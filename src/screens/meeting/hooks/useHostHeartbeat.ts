import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import storage from '../../../services/storage';
import { sendHostHeartbeat, reacquireHostSession, joinMeeting } from '../../../services/api';

export interface UseHostHeartbeatProps {
  isHostParam?: boolean;
  meetingCode?: string;
  hostSessionToken?: string;
}

export const useHostHeartbeat = ({
  isHostParam,
  meetingCode,
  hostSessionToken,
}: UseHostHeartbeatProps) => {
  const hostSessionTokenRef = useRef<string | null>(hostSessionToken || null);

  useEffect(() => {
    if (hostSessionToken) {
      hostSessionTokenRef.current = hostSessionToken;
    }
  }, [hostSessionToken]);

  // Persist host session token so app kill/restart can recover it
  useEffect(() => {
    if (isHostParam && meetingCode) {
      const cleanCode = meetingCode.replace(/[\s-]/g, '');
      if (hostSessionTokenRef.current) {
        storage.setItem(`host_session_${cleanCode}`, hostSessionTokenRef.current);
      } else {
        storage.getItem(`host_session_${cleanCode}`).then(saved => {
          if (saved && !hostSessionTokenRef.current) {
            hostSessionTokenRef.current = saved;
          }
        }).catch(() => {});
      }
    }
  }, [isHostParam, meetingCode]);

  const isHostSessionRecoveryInFlightRef = useRef<boolean>(false);
  const isHostHeartbeatInFlightRef = useRef<boolean>(false);
  const lastRecoverySuccessTimestampRef = useRef<number>(0);

  // Controlled host session heartbeat with automatic background lease recovery
  const performHostHeartbeat = useCallback(async (isForegroundPulse: boolean = false) => {
    if (!isHostParam || !meetingCode) return;

    if (isHostHeartbeatInFlightRef.current || isHostSessionRecoveryInFlightRef.current) {
      if (__DEV__) console.log('[HostHeartbeat] Host heartbeat/recovery already in-flight, skipping duplicate pulse');
      return;
    }

    const token = hostSessionTokenRef.current;
    if (!token) return;

    isHostHeartbeatInFlightRef.current = true;

    try {
      await sendHostHeartbeat(meetingCode, token);
      if (__DEV__ && isForegroundPulse) {
        console.log('[HostHeartbeat] Foreground host heartbeat acknowledged');
      }
    } catch (err: any) {
      const errorCode = err?.response?.data?.code;

      if (errorCode === 'HOST_SESSION_INVALID') {
        if (token !== hostSessionTokenRef.current || Date.now() - lastRecoverySuccessTimestampRef.current < 5000) {
          if (__DEV__) console.log('[HostHeartbeat] Ignoring expired lease error for already rotated host token');
          return;
        }

        if (isHostSessionRecoveryInFlightRef.current) {
          if (__DEV__) console.log('[HostHeartbeat] Host session recovery already in flight, skipping duplicate trigger');
          return;
        }

        isHostSessionRecoveryInFlightRef.current = true;
        console.log('[HostHeartbeat] Host session lease expired; performing controlled re-acquisition...');

        try {
          const reacquireRes = await reacquireHostSession(meetingCode, token);
          if (reacquireRes.success && reacquireRes.data?.host_session_token) {
            const newToken = reacquireRes.data.host_session_token;
            hostSessionTokenRef.current = newToken;
            lastRecoverySuccessTimestampRef.current = Date.now();
            const cleanCode = meetingCode.replace(/[\s-]/g, '');
            await storage.setItem(`host_session_${cleanCode}`, newToken);
            console.log('[HostHeartbeat] Host session successfully re-acquired with fresh token');
            return;
          }
        } catch (reacquireErr: any) {
          const reacquireStatus = reacquireErr?.response?.status;
          const reacquireCode = reacquireErr?.response?.data?.code;

          if (reacquireStatus === 404) {
            console.log('[HostHeartbeat] Reacquire endpoint returned 404; falling back to joinMeeting host recovery...');
            try {
              const cleanCode = meetingCode.replace(/[\s-]/g, '');
              const joinRes = await joinMeeting(cleanCode, undefined, undefined, token);
              if (joinRes.success && joinRes.data?.host_session_token) {
                const newToken = joinRes.data.host_session_token;
                hostSessionTokenRef.current = newToken;
                lastRecoverySuccessTimestampRef.current = Date.now();
                await storage.setItem(`host_session_${cleanCode}`, newToken);
                console.log('[HostHeartbeat] Host session successfully recovered via fallback with fresh token');
                return;
              }
            } catch (fallbackErr: any) {
              console.warn('[HostHeartbeat] Host recovery fallback failed:', fallbackErr?.response?.data || fallbackErr?.message);
            }
          }

          const isJustRecovered = Date.now() - lastRecoverySuccessTimestampRef.current < 5000;
          if (reacquireCode === 'HOST_ALREADY_IN_MEETING' && isJustRecovered) {
            if (__DEV__) console.log('[HostHeartbeat] Suppressing duplicate HOST_ALREADY_IN_MEETING race after successful recovery');
            return;
          }

          console.warn('[HostHeartbeat] Host session re-acquisition failed:', reacquireErr?.response?.data || reacquireErr?.message);
          if (reacquireCode === 'MEETING_ENDED' || reacquireCode === 'HOST_ALREADY_IN_MEETING') {
            console.warn('[HostHeartbeat] Critical host ownership conflict:', reacquireCode);
          }
        } finally {
          isHostSessionRecoveryInFlightRef.current = false;
        }
      } else {
        console.warn('[HostHeartbeat] Host heartbeat warning:', err?.response?.data || err?.message);
      }
    } finally {
      isHostHeartbeatInFlightRef.current = false;
    }
  }, [isHostParam, meetingCode]);

  // Periodic Host session heartbeat (20s interval)
  useEffect(() => {
    if (!isHostParam || !meetingCode) return;

    const interval = setInterval(() => {
      performHostHeartbeat(false);
    }, 20000);

    return () => {
      clearInterval(interval);
    };
  }, [isHostParam, meetingCode, performHostHeartbeat]);

  // Immediate Foreground / PiP Resume Pulse
  useEffect(() => {
    if (!isHostParam || !meetingCode) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        if (__DEV__) console.log('[HostHeartbeat] AppState active: sending immediate host heartbeat/recovery pulse');
        performHostHeartbeat(true);
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      sub.remove();
    };
  }, [isHostParam, meetingCode, performHostHeartbeat]);

  return {
    hostSessionTokenRef,
    performHostHeartbeat,
  };
};

export default useHostHeartbeat;
