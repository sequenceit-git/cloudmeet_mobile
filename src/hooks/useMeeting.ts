import { useCallback, useEffect, useState } from 'react';
import { createMeeting, guestLogin, joinMeetingRoom } from '../services/api';
import { initLiveKit, startAudioSession, stopAudioSession } from '../services/livekit';
import storage, { StorageKeys } from '../services/storage';
import { resolveLiveKitServerUrl } from '../config/env';

export function useMeeting() {
  const [state, setState] = useState({
    isConnecting: false,
    isConnected: false,
    token: null as string | null,
    serverUrl: null as string | null,
    roomName: null as string | null,
    error: null as string | null,
  });

  useEffect(() => {
    initLiveKit();
  }, []);

  const startNewMeeting = useCallback(async (
    title = 'Instant Meeting',
    options?: { meetingCode?: string; passcode?: string; maxParticipants?: number }
  ) => {
    setState(prev => ({ ...prev, isConnecting: true, error: null }));
    try {
      // 1. Authenticate as Guest first (Sanctum requirement) only if not authenticated
      const token = await storage.getItem(StorageKeys.AUTH_TOKEN);
      if (!token) {
        await guestLogin('Mobile User');
      }

      // 2. Create Meeting
      const response = await createMeeting(title, options);

      await startAudioSession();

      setState({
        isConnecting: false,
        isConnected: true,
        token: response.data.livekit_token || response.data.token || null,
        serverUrl: resolveLiveKitServerUrl(response.data.livekit_url) || null,
        roomName: response.data.room_name || response.data.meeting?.room_name || '',
        error: null,
      });

      return response.data;
    } catch (err: any) {
      if (err?.response?.data?.error_code !== 'AUTH_SESSION_REVOKED') {
        console.warn('[MeetingAPI] Error:', err?.response?.data || err.message);
      }
      const msg = err?.response?.data?.message || err.message;
      setState(prev => ({ ...prev, isConnecting: false, error: msg }));
      throw new Error(msg);
    }
  }, []);

  return {
    ...state,
    startNewMeeting,
  };
}

export default useMeeting;
