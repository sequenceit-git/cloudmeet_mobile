import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Room, RoomConnectOptions, ConnectionState, RoomEvent, DisconnectReason } from 'livekit-client';
import storage, { StorageKeys, MeetingSettings, DEFAULT_MEETING_SETTINGS } from '../services/storage';
import { initLiveKit } from '../services/livekit';
import { resetToOnboarding, resetToHome } from '../navigation/navigationRef';
import {
  startMeetingForegroundService,
  stopMeetingForegroundService,
  releaseScreenShareWakeLock,
} from '../utils/wakeLock';
import { resolveLiveKitServerUrl } from '../config/env';
import { setPipConfig } from '../utils/pip';

export type ConnectionLifecycleState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'background'
  | 'background_recovery'
  | 'reconnecting'
  | 'disconnected'
  | 'leaving';

export interface MeetingSession {
  roomName: string;
  token: string;
  serverUrl: string;
  displayName?: string;
  meetingCode?: string;
  meetingTitle?: string;
  isHost?: boolean;
  isGuest?: boolean;
  muteAudio?: boolean;
  muteVideo?: boolean;
  hostSessionToken?: string;
}

export interface MeetingContextType {
  activeMeeting: MeetingSession | null;
  isMinimized: boolean;
  room: Room | undefined;
  connectionState: ConnectionLifecycleState;
  isReconnectingUI: boolean;
  connectOptions: RoomConnectOptions;
  startMeeting: (session: MeetingSession) => void;
  minimizeMeeting: () => void;
  maximizeMeeting: () => void;
  endMeeting: () => Promise<void>;
  manualReconnect: () => Promise<void>;
}

const MeetingContext = createContext<MeetingContextType | undefined>(undefined);

export const MeetingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeMeeting, setActiveMeeting] = useState<MeetingSession | null>(null);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [meetingSettings, setMeetingSettings] = useState<MeetingSettings>(DEFAULT_MEETING_SETTINGS);
  const [connectionState, setConnectionState] = useState<ConnectionLifecycleState>('idle');
  const [isReconnectingUI, setIsReconnectingUI] = useState<boolean>(false);

  // Centralized Lifecycle Guards & Mutex
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  const isLeavingRef = useRef<boolean>(false);
  const isAppInBackgroundRef = useRef<boolean>(false);

  // Phase 3 DEV Diagnostics: Unique Provider Instance Identity for detecting concurrent roots/providers
  const providerInstanceId = useRef(`meeting-ctx-${Math.random().toString(36).substring(2, 8)}`).current;

  // Load user meeting settings (resolution, framerate, etc.)
  useEffect(() => {
    (async () => {
      try {
        const stored = await storage.getItem(StorageKeys.MEETING_SETTINGS);
        if (stored) {
          const parsed = JSON.parse(stored);
          setMeetingSettings({ ...DEFAULT_MEETING_SETTINGS, ...parsed });
        }
      } catch (err) {
        console.warn('[MeetingContext] Error reading meeting settings:', err);
      }
    })();
  }, [activeMeeting]);

  // Synchronize PiP capability: PiP auto-enter is ONLY enabled while on an active video call or meeting
  useEffect(() => {
    if (activeMeeting) {
      setPipConfig(true, false);
    } else {
      setPipConfig(false, false);
    }
  }, [Boolean(activeMeeting)]);

  const videoPreset = useMemo(() => {
    const is4K = meetingSettings.videoQuality === '4k' && Boolean(activeMeeting?.isHost);
    const is720p = meetingSettings.videoQuality === '720p';

    if (is4K) {
      return {
        capture: {
          width: 3840,
          height: 2160,
          frameRate: meetingSettings.frameRate,
        },
        encoding: {
          maxBitrate: 8_000_000,
          maxFramerate: meetingSettings.frameRate,
        },
      };
    }

    if (is720p) {
      return {
        capture: {
          width: 1280,
          height: 720,
          frameRate: meetingSettings.frameRate,
        },
        encoding: {
          maxBitrate: 1_800_000,
          maxFramerate: meetingSettings.frameRate,
        },
      };
    }

    // Default: 1080p Full HD (2.5 - 3.5 Mbps)
    return {
      capture: {
        width: 1920,
        height: 1080,
        frameRate: meetingSettings.frameRate,
      },
      encoding: {
        maxBitrate: 3_500_000,
        maxFramerate: meetingSettings.frameRate,
      },
    };
  }, [meetingSettings, activeMeeting?.isHost]);

  // Memoized connection options
  const connectOptions = useMemo<RoomConnectOptions>(() => ({
    autoSubscribe: true,
    peerConnectionTimeout: 30000,
    maxRetries: 10,
    websocketTimeout: 30000,
  }), []);

  // Single Room Instance Owner: strictly keyed to the active meeting credentials
  const room = useMemo(() => {
    if (!activeMeeting?.token || !activeMeeting?.serverUrl) return undefined;
    initLiveKit();
    const instance = new Room({
      adaptiveStream: false,
      dynacast: true,
      stopLocalTrackOnUnpublish: false,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      videoCaptureDefaults: {
        resolution: videoPreset.capture,
      },
      publishDefaults: {
        videoCodec: 'h264',
        backupCodec: { codec: 'vp8' },
        videoEncoding: videoPreset.encoding,
        screenShareEncoding: {
          maxBitrate: 3_000_000,
          maxFramerate: 15,
        },
        dtx: true,
        red: true,
      },
    });

    if (__DEV__) {
      console.log('[MeetingConnection] LiveKit room instance created:', instance.name, 'Initial state:', instance.state, 'providerInstanceId:', providerInstanceId);
    }

    return instance;
    // Intentionally omit videoPreset from dependencies to avoid recreating the Room instance mid-call
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMeeting?.roomName, activeMeeting?.token]);

  // Phase 3 DEV Diagnostics: Track Provider Mount/Unmount lifecycle and detect concurrent duplicate providers
  useEffect(() => {
    if (__DEV__) {
      console.log('[MeetingContext:Diag] PROVIDER_MOUNT', {
        instanceId: providerInstanceId,
        appState: AppState.currentState,
        roomInstance: room ? (room as any).name || 'RoomInstance' : undefined,
        roomState: room?.state,
      });
    }
    return () => {
      if (__DEV__) {
        console.log('[MeetingContext:Diag] PROVIDER_UNMOUNT', {
          instanceId: providerInstanceId,
          appState: AppState.currentState,
          roomInstance: room ? (room as any).name || 'RoomInstance' : undefined,
          roomState: room?.state,
        });
      }
    };
  }, []);

  // Clean room disconnection on room instance change / unmount
  useEffect(() => {
    return () => {
      if (room) {
        if (__DEV__) console.log('[MeetingConnection] Cleaning up room instance on unmount:', room.name);
        room.disconnect().catch(() => {});
      }
    };
  }, [room]);

  // Sole Connection Mutex & Orchestrator
  const connectRoom = useCallback(async (reason: string) => {
    if (isLeavingRef.current) {
      if (__DEV__) console.log('[MeetingConnection] CONNECT_SKIPPED_LEAVING');
      return;
    }
    if (!room || !activeMeeting?.serverUrl || !activeMeeting?.token) {
      return;
    }
    if (room.state === ConnectionState.Connected) {
      if (__DEV__) console.log('[MeetingConnection] CONNECT_SKIPPED_ALREADY_CONNECTED');
      return;
    }
    if (connectPromiseRef.current) {
      if (__DEV__) console.log('[MeetingConnection] CONNECT_SKIPPED_IN_FLIGHT');
      return connectPromiseRef.current;
    }

    if (__DEV__) {
      console.log(`[MeetingConnection] CONNECT_ATTEMPT (${reason})`, {
        roomName: room.name,
        roomState: room.state,
        appState: AppState.currentState,
      });
    }

    const promise = (async () => {
      try {
        const livekitUrl = resolveLiveKitServerUrl(activeMeeting.serverUrl);
        await room.connect(livekitUrl, activeMeeting.token, connectOptions);
        if (__DEV__) console.log(`[MeetingConnection] CONNECT_SUCCESS (${reason})`);
      } catch (err: any) {
        if (__DEV__) console.warn(`[MeetingConnection] CONNECT_FAILED (${reason}):`, err?.message || err);
        throw err;
      } finally {
        connectPromiseRef.current = null;
      }
    })();

    connectPromiseRef.current = promise;
    return promise;
  }, [room, activeMeeting?.serverUrl, activeMeeting?.token, connectOptions]);

  // Centralized Room Event Listeners
  useEffect(() => {
    if (!room) {
      setConnectionState('idle');
      setIsReconnectingUI(false);
      return;
    }

    const handleConnected = () => {
      if (__DEV__) console.log('[MeetingConnection] CONNECTED', { roomName: room.name });
      setConnectionState('connected');
      setIsReconnectingUI(false);
    };

    const handleReconnecting = () => {
      if (__DEV__) {
        console.log('[MeetingConnection] RECONNECTING', {
          roomName: room.name,
          isBackground: isAppInBackgroundRef.current,
        });
      }
      if (isAppInBackgroundRef.current) {
        // Silent recovery when backgrounded
        setConnectionState('background_recovery');
        setIsReconnectingUI(false);
      } else {
        // Genuine foreground network problem
        setConnectionState('reconnecting');
        setIsReconnectingUI(true);
      }
    };

    const handleReconnected = () => {
      if (__DEV__) console.log('[MeetingConnection] RECONNECTED', { roomName: room.name });
      setConnectionState('connected');
      setIsReconnectingUI(false);
    };

    const handleDisconnected = (reason?: DisconnectReason) => {
      if (__DEV__) {
        console.log('[MeetingConnection] DISCONNECTED', {
          roomName: room.name,
          reason,
          isLeaving: isLeavingRef.current,
        });
      }
      setIsReconnectingUI(false);

      if (isLeavingRef.current) {
        setConnectionState('disconnected');
        return;
      }

      if (activeMeeting?.isHost) {
        // Host immunity: attempt recovery
        setConnectionState(isAppInBackgroundRef.current ? 'background_recovery' : 'reconnecting');
        setTimeout(() => {
          if (!isLeavingRef.current && room.state === ConnectionState.Disconnected) {
            connectRoom('host_auto_recovery').catch(() => {});
          }
        }, 1500);
        return;
      }

      if (
        reason === DisconnectReason.CLIENT_INITIATED ||
        reason === DisconnectReason.ROOM_DELETED ||
        reason === DisconnectReason.ROOM_CLOSED ||
        reason === DisconnectReason.PARTICIPANT_REMOVED ||
        reason === DisconnectReason.USER_REJECTED
      ) {
        setConnectionState('disconnected');
      } else {
        // Transient socket drop
        if (isAppInBackgroundRef.current) {
          setConnectionState('background_recovery');
        } else {
          setConnectionState('reconnecting');
          setIsReconnectingUI(true);
        }
        setTimeout(() => {
          if (!isLeavingRef.current && room.state === ConnectionState.Disconnected) {
            connectRoom('transient_recovery').catch(() => {});
          }
        }, 1500);
      }
    };

    const handleConnectionStateChanged = (state: ConnectionState) => {
      if (__DEV__) console.log('[MeetingConnection] STATE_CHANGE', { state, roomName: room.name });
      if (state === ConnectionState.Connected) {
        setConnectionState('connected');
        setIsReconnectingUI(false);
      } else if (state === ConnectionState.Disconnected) {
        if (isLeavingRef.current) {
          setIsReconnectingUI(false);
        }
      }
    };

    room.on(RoomEvent.Connected, handleConnected);
    room.on(RoomEvent.Reconnecting, handleReconnecting);
    room.on(RoomEvent.Reconnected, handleReconnected);
    room.on(RoomEvent.Disconnected, handleDisconnected);
    room.on(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);

    return () => {
      room.off(RoomEvent.Connected, handleConnected);
      room.off(RoomEvent.Reconnecting, handleReconnecting);
      room.off(RoomEvent.Reconnected, handleReconnected);
      room.off(RoomEvent.Disconnected, handleDisconnected);
      room.off(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
    };
  }, [room, activeMeeting?.isHost, connectRoom]);

  // Centralized AppState Listener: Backgrounding & Silent Foreground Recovery
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (__DEV__) {
        console.log('[MeetingConnection] AppState change:', {
          instanceId: providerInstanceId,
          nextAppState,
          roomState: room?.state,
          roomName: room?.name,
        });
      }

      if (nextAppState === 'background' || nextAppState === 'inactive') {
        isAppInBackgroundRef.current = true;
        // Do not setState here. A render while Android is entering PiP
        // cancels the mini window (PiP true, then immediate false).
        if (activeMeeting) {
          startMeetingForegroundService(activeMeeting.meetingTitle || activeMeeting.roomName);
        }
      } else if (nextAppState === 'active') {
        isAppInBackgroundRef.current = false;
        if (isLeavingRef.current) return;

        if (!room) return;

        if (room.state === ConnectionState.Connected) {
          if (__DEV__) console.log('[MeetingConnection] FOREGROUND: Room already connected, no-op');
          setConnectionState('connected');
          setIsReconnectingUI(false);
        } else if (room.state === ConnectionState.Reconnecting) {
          if (__DEV__) console.log('[MeetingConnection] FOREGROUND: Room reconnecting; silent recovery');
          setConnectionState('background_recovery');
          setIsReconnectingUI(false);
        } else if (room.state === ConnectionState.Disconnected) {
          if (__DEV__) console.log('[MeetingConnection] FOREGROUND: Room disconnected; starting silent background recovery');
          setConnectionState('background_recovery');
          setIsReconnectingUI(false);
          connectRoom('foreground_resume').catch(() => {});
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [room, connectionState, activeMeeting, connectRoom]);

  const startMeeting = useCallback((session: MeetingSession) => {
    isLeavingRef.current = false;
    setConnectionState('connecting');
    setIsReconnectingUI(false);
    const sanitizedSession: MeetingSession = {
      ...session,
      serverUrl: resolveLiveKitServerUrl(session.serverUrl),
    };
    setActiveMeeting(prev => {
      if (
        prev &&
        prev.roomName === sanitizedSession.roomName &&
        prev.token === sanitizedSession.token
      ) {
        return prev;
      }
      return sanitizedSession;
    });
    setIsMinimized(false);
    setPipConfig(true, false);
    startMeetingForegroundService(sanitizedSession.meetingTitle || sanitizedSession.roomName);
  }, []);

  const minimizeMeeting = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const maximizeMeeting = useCallback(() => {
    setIsMinimized(false);
  }, []);

  const manualReconnect = useCallback(async () => {
    if (isLeavingRef.current) return;
    setIsReconnectingUI(true);
    try {
      await connectRoom('manual_retry');
    } catch {
      // Keep UI state if failed
    } finally {
      if (room?.state === ConnectionState.Connected) {
        setIsReconnectingUI(false);
      }
    }
  }, [connectRoom, room]);

  const endMeeting = useCallback(async () => {
    isLeavingRef.current = true;
    setConnectionState('leaving');
    setIsReconnectingUI(false);
    releaseScreenShareWakeLock();
    stopMeetingForegroundService();
    setPipConfig(false, false);

    if (room) {
      try {
        if (__DEV__) console.log('[MeetingConnection] Disconnecting room on endMeeting:', room.name);
        await room.disconnect();
      } catch (err) {
        console.warn('[MeetingContext] Error disconnecting room on endMeeting:', err);
      }
    }

    const isGuestSession = Boolean(
      activeMeeting?.isGuest || (await storage.getItem(StorageKeys.IS_GUEST)) === 'true'
    );

    try {
      const token = await storage.getItem(StorageKeys.AUTH_TOKEN);
      const isSavedGuest = (await storage.getItem(StorageKeys.IS_GUEST)) === 'true';
      const hasHostSession = Boolean(token && !isSavedGuest);

      if (hasHostSession && !activeMeeting?.isGuest) {
        resetToHome();
      } else {
        resetToOnboarding();
      }
    } catch (e) {
      console.warn('[MeetingContext] Error during endMeeting cleanup:', e);
      resetToOnboarding();
    } finally {
      setPipConfig(false, false);
      setActiveMeeting(null);
      setIsMinimized(false);
    }
  }, [activeMeeting, room]);

  return (
    <MeetingContext.Provider
      value={{
        activeMeeting,
        isMinimized,
        room,
        connectionState,
        isReconnectingUI,
        connectOptions,
        startMeeting,
        minimizeMeeting,
        maximizeMeeting,
        endMeeting,
        manualReconnect,
      }}
    >
      {children}
    </MeetingContext.Provider>
  );
};

export const useMeeting = (): MeetingContextType => {
  const context = useContext(MeetingContext);
  if (!context) {
    throw new Error('useMeeting must be used within a MeetingProvider');
  }
  return context;
};

export const useMeetingContext = useMeeting;
