import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  LayoutChangeEvent,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
  Alert,
  Share,
  BackHandler,
  AppState,
  AppStateStatus,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useLocalParticipant,
  useParticipants,
  useRoomContext,
} from '@livekit/react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  Track,
  ConnectionState,
  Participant,
  RoomEvent,
  ParticipantEvent,
} from 'livekit-client';
import * as Clipboard from 'expo-clipboard';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { RootStackNavigationProp, RootStackRouteProp } from '../../navigation/types';
import {
  getMeetingInviteLink,
  getUsers,
  User,
} from '../../services/api';
import { useTranslation } from '../../hooks/useTranslation';
import storage, { StorageKeys } from '../../services/storage';
import { useMeeting } from '../../context/MeetingContext';
import { startMeetingForegroundService, stopMeetingForegroundService } from '../../utils/wakeLock';
import { startAudioSession, stopAudioSession } from '../../services/livekit';
import { addPipListener, suppressMeetingChrome } from '../../utils/pip';
import { getInitials, getAvatarTextStyle } from '../../utils/helpers';
import { styles } from './meetingRoomStyles';
import { checkIsParticipantHost, formatMeetingCode, formatTime } from './meetingRoomUtils';
import {
  LeaveMeetingModal,
  AudioDeviceModal,
  MeetingInfoModal,
  InviteParticipantsModal,
} from './modals';
import {
  MeetingHeaderBar,
  MeetingControlsDock,
  MeetingBanners,
  NativePipActionBar,
} from './components';
import {
  MeetingChatDrawer,
  MeetingParticipantsDrawer,
} from './drawers';
import { MeetingStageView } from './views';
import { WaitingRoomView } from './WaitingRoomView';
import { MediaPreviewModal } from '../../components/meeting/MediaPreviewModal';
import {
  useHostHeartbeat,
  useMeetingAudio,
  useMeetingLayout,
  useMeetingControlsAnimation,
  useMeetingChatHandler,
  useWaitingRoomManager,
  useMeetingScreenShare,
} from './hooks';

// Safely resolve iOS-only ScreenCapturePickerView without crashing on Android
const ScreenCapturePickerViewComponent: any = Platform.OS === 'ios'
  ? (() => {
      try {
        return require('@livekit/react-native-webrtc').ScreenCapturePickerView;
      } catch (e) {
        return null;
      }
    })()
  : null;

export const MeetingRoomContent: React.FC<{
  roomName: string;
  meetingCode?: string;
  meetingTitle?: string;
  isHostParam?: boolean;
  isGuest?: boolean;
  hostSessionToken?: string;
  onLeave: () => void;
  onMinimize?: () => void;
  isMinimized?: boolean;
  muteAudioParam?: boolean;
  muteVideoParam?: boolean;
  hasAudioPermission?: boolean;
  hasCameraPermission?: boolean;
}> = ({
  roomName,
  meetingCode,
  meetingTitle,
  isHostParam,
  isGuest,
  hostSessionToken,
  onLeave,
  onMinimize,
  isMinimized = false,
  muteAudioParam = false,
  muteVideoParam = false,
  hasAudioPermission = true,
  hasCameraPermission = true,
}) => {
  const insets = useSafeAreaInsets();
  const initialWindow = Dimensions.get('window');
  const [frame, setFrame] = useState({
    width: initialWindow.width,
    height: initialWindow.height,
    compact: false,
  });
  const windowWidth = frame.width;
  const windowHeight = frame.height;
  const isNativePip = frame.compact;

  const applyFrameSize = useCallback((width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    const compact = height < 700 || width < 400;
    setFrame(prev => (
      prev.width === width && prev.height === height && prev.compact === compact
        ? prev
        : { width, height, compact }
    ));
  }, []);

  const handleMeetingLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    applyFrameSize(Math.round(width), Math.round(height));
  }, [applyFrameSize]);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      applyFrameSize(Math.round(window.width), Math.round(window.height));
    });
    return () => sub.remove();
  }, [applyFrameSize]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        suppressMeetingChrome();
      }
    });
    return () => sub.remove();
  }, []);

  const room = useRoomContext();
  const { t } = useTranslation();
  const { isReconnectingUI, manualReconnect } = useMeeting();

  // Keep display awake while actively inside Meeting UI
  useEffect(() => {
    if (!isMinimized) {
      activateKeepAwakeAsync('cloudnews-meeting-screen').catch(err => {
        if (__DEV__) console.warn('[KeepAwake] Failed to activate meeting screen awake:', err);
      });
      return () => {
        deactivateKeepAwake('cloudnews-meeting-screen').catch(() => {});
      };
    }
  }, [isMinimized]);

  // Host heartbeat & lease recovery hook
  const { hostSessionTokenRef } = useHostHeartbeat({
    isHostParam,
    meetingCode,
    hostSessionToken,
  });

  useEffect(() => {
    return addPipListener(inPip => {
      if (__DEV__) console.log('[PiP] Native Picture-in-Picture state changed:', inPip);
    });
  }, []);

  const [callDuration, setCallDuration] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setCallDuration(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Audio Device routing hook
  const {
    isAudioModalOpen,
    setIsAudioModalOpen,
    availableOutputs,
    selectedAudioOutput,
    isRefreshingOutputs,
    fetchAudioOutputs,
    handleSelectAudioOutput,
    getAudioDeviceDisplay,
    renderCurrentAudioIcon,
  } = useMeetingAudio();

  // Initialize Audio Session & Foreground Service
  useEffect(() => {
    let isMounted = true;
    const initAudio = async () => {
      try {
        await startAudioSession();
        if (isMounted) {
          await fetchAudioOutputs(true);
        }
      } catch (err) {
        console.warn('[Audio] Failed to start audio session:', err);
      }
    };
    initAudio();

    startMeetingForegroundService(
      meetingTitle || roomName || 'CloudNews Meeting',
      '通话中 · 麦克风与音频已保持开启 / Meeting active · Mic & audio running'
    );

    return () => {
      isMounted = false;
      stopAudioSession();
      stopMeetingForegroundService();
    };
  }, [fetchAudioOutputs, meetingTitle, roomName]);

  const [isMicMuted, setIsMicMuted] = useState(Boolean(muteAudioParam || !hasAudioPermission));
  const isMicMutedRef = useRef(isMicMuted);
  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  const [isCameraOff, setIsCameraOff] = useState(Boolean(muteVideoParam || !hasCameraPermission));
  const isCameraOffRef = useRef(isCameraOff);
  useEffect(() => {
    isCameraOffRef.current = isCameraOff;
  }, [isCameraOff]);
  const userWantsMicMutedRef = useRef(Boolean(muteAudioParam || !hasAudioPermission));
  const userWantsCameraOffRef = useRef(Boolean(muteVideoParam || !hasCameraPermission));
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');

  const remoteParticipants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  // Re-sync local audio/video publish state on reconnect
  useEffect(() => {
    if (!room) return;

    const handleReconnected = () => {
      const lp = room.localParticipant;
      if (lp) {
        if (!userWantsMicMutedRef.current && !lp.isMicrophoneEnabled) {
          lp.setMicrophoneEnabled(true).catch(() => {});
        }
        if (!userWantsCameraOffRef.current && !lp.isCameraEnabled) {
          lp.setCameraEnabled(true).catch(() => {});
        }
      }
    };

    room.on(RoomEvent.Reconnected, handleReconnected);
    return () => {
      room.off(RoomEvent.Reconnected, handleReconnected);
    };
  }, [room]);

  const isUserLeavingRef = useRef<boolean>(false);

  // Synchronize mic track state bidirectionally with localParticipant
  useEffect(() => {
    if (!localParticipant) return;

    const syncMic = (pub?: any) => {
      if (pub && pub.source && pub.source !== Track.Source.Microphone) {
        return;
      }
      if (!room || room.state !== ConnectionState.Connected || isUserLeavingRef.current) {
        return;
      }
      const enabled = localParticipant.isMicrophoneEnabled;
      if (!enabled && !userWantsMicMutedRef.current) {
        localParticipant.setMicrophoneEnabled(true).catch(() => {});
        return;
      }
      setIsMicMuted(!enabled);
    };

    if (localParticipant.isMicrophoneEnabled !== undefined) {
      syncMic({ source: Track.Source.Microphone });
    }

    localParticipant.on(ParticipantEvent.TrackMuted, syncMic);
    localParticipant.on(ParticipantEvent.TrackUnmuted, syncMic);
    localParticipant.on(ParticipantEvent.LocalTrackPublished, syncMic);
    localParticipant.on(ParticipantEvent.LocalTrackUnpublished, syncMic);

    return () => {
      localParticipant.off(ParticipantEvent.TrackMuted, syncMic);
      localParticipant.off(ParticipantEvent.TrackUnmuted, syncMic);
      localParticipant.off(ParticipantEvent.LocalTrackPublished, syncMic);
      localParticipant.off(ParticipantEvent.LocalTrackUnpublished, syncMic);
    };
  }, [localParticipant, room]);

  // Synchronize camera track state bidirectionally with localParticipant
  useEffect(() => {
    if (!localParticipant) return;

    const syncCamera = (pub?: any) => {
      if (pub && pub.source && pub.source !== Track.Source.Camera) {
        return;
      }
      if (!room || room.state !== ConnectionState.Connected || isUserLeavingRef.current) {
        return;
      }
      const enabled = localParticipant.isCameraEnabled;
      if (!enabled && !userWantsCameraOffRef.current) {
        localParticipant.setCameraEnabled(true).catch(() => {});
        return;
      }
      setIsCameraOff(!enabled);
    };

    if (localParticipant.isCameraEnabled !== undefined) {
      syncCamera({ source: Track.Source.Camera });
    }

    localParticipant.on(ParticipantEvent.TrackMuted, syncCamera);
    localParticipant.on(ParticipantEvent.TrackUnmuted, syncCamera);
    localParticipant.on(ParticipantEvent.LocalTrackPublished, syncCamera);
    localParticipant.on(ParticipantEvent.LocalTrackUnpublished, syncCamera);

    return () => {
      localParticipant.off(ParticipantEvent.TrackMuted, syncCamera);
      localParticipant.off(ParticipantEvent.TrackUnmuted, syncCamera);
      localParticipant.off(ParticipantEvent.LocalTrackPublished, syncCamera);
      localParticipant.off(ParticipantEvent.LocalTrackUnpublished, syncCamera);
    };
  }, [localParticipant, room]);

  // Initial user choice sync
  useEffect(() => {
    if (!localParticipant) return;
    if (muteAudioParam || !hasAudioPermission) {
      localParticipant.setMicrophoneEnabled(false).catch(() => {});
    }
    if (muteVideoParam || !hasCameraPermission) {
      localParticipant.setCameraEnabled(false).catch(() => {});
    }
  }, [localParticipant, muteAudioParam, muteVideoParam, hasAudioPermission, hasCameraPermission]);

  // Keep mic active in background
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        startMeetingForegroundService(
          meetingTitle || roomName || 'CloudNews Meeting',
          '通话中 · 麦克风与音频已保持开启 / Meeting active · Mic & audio running'
        );
        if (localParticipant && room?.state === ConnectionState.Connected) {
          if (!userWantsMicMutedRef.current && !localParticipant.isMicrophoneEnabled) {
            localParticipant.setMicrophoneEnabled(true).catch(() => {});
          }
          if (!userWantsCameraOffRef.current && !localParticipant.isCameraEnabled) {
            localParticipant.setCameraEnabled(true).catch(() => {});
          }
        }
      } else if (nextAppState === 'active') {
        if (localParticipant && room?.state === ConnectionState.Connected) {
          if (!userWantsMicMutedRef.current && !localParticipant.isMicrophoneEnabled) {
            localParticipant.setMicrophoneEnabled(true).catch(() => {});
          }
          if (!userWantsCameraOffRef.current && !localParticipant.isCameraEnabled) {
            localParticipant.setCameraEnabled(true).catch(() => {});
          }
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [localParticipant, meetingTitle, roomName, room?.state]);

  const allParticipants = useMemo(() => {
    const map = new Map<string, Participant>();
    if (localParticipant) {
      map.set(localParticipant.identity, localParticipant);
    }
    remoteParticipants.forEach(p => {
      map.set(p.identity, p);
    });
    return Array.from(map.values());
  }, [localParticipant, remoteParticipants]);

  const isHost = Boolean(
    !isGuest && (
      isHostParam ||
      checkIsParticipantHost(localParticipant) ||
      localParticipant?.metadata === 'host'
    )
  );

  const [currentUserName, setCurrentUserName] = useState<string>('');
  useEffect(() => {
    (async () => {
      try {
        const raw = await storage.getItem(StorageKeys.USER_DATA);
        if (raw) {
          const u = JSON.parse(raw);
          if (u?.name) setCurrentUserName(u.name);
        }
      } catch {}
    })();
  }, []);

  // Waiting Room Manager Hook
  const {
    waitingGuests,
    latestWaitingGuest,
    isHostPresent,
    isInWaitingRoom,
    showAdmittedBanner,
    handleAdmitGuest,
    handleAdmitAll,
    handleDenyGuest,
    handlePromptRemoveParticipant,
    handleLeaveOrEndMeeting,
    handleLeaveWaitingRoom,
  } = useWaitingRoomManager({
    room,
    localParticipant,
    allParticipants,
    isHost,
    isGuest,
    meetingCode,
    roomName,
    hostSessionTokenRef,
    onLeave,
    manualReconnect,
    isMicMuted,
    isCameraOff,
    setIsMicMuted,
    isUserLeavingRef,
    t,
  });

  // Active meeting participants list
  const activeMeetingParticipants = useMemo(() => {
    let list = allParticipants;
    if (isHost && waitingGuests.length > 0) {
      const waitingSet = new Set(waitingGuests.map(g => g.identity));
      list = list.filter(p => !waitingSet.has(p.identity));
    }

    const seenMap = new Map<string, Participant>();
    for (const p of list) {
      const rawKey = (p.name || p.identity || '').trim().toLowerCase();
      if (!rawKey) {
        seenMap.set(p.identity, p);
        continue;
      }

      if (!seenMap.has(rawKey)) {
        seenMap.set(rawKey, p);
      } else {
        const existing = seenMap.get(rawKey)!;
        if (p.identity === localParticipant?.identity) {
          seenMap.set(rawKey, p);
        } else if (existing.identity === localParticipant?.identity) {
          // Keep existing local
        } else {
          const pHasTracks = p.trackPublications && p.trackPublications.size > 0;
          const existHasTracks = existing.trackPublications && existing.trackPublications.size > 0;
          if (p.isSpeaking || (pHasTracks && !existHasTracks)) {
            seenMap.set(rawKey, p);
          }
        }
      }
    }

    return Array.from(seenMap.values());
  }, [isHost, allParticipants, waitingGuests, localParticipant]);

  // Screen Share Hook
  const {
    isScreenSharing,
    isScreenShareToggling,
    screenCapturePickerRef,
    cameraTracks,
    activeScreenShare,
    isScreenShareActionInFlight,
    screenShareLifecycleRef,
    handleToggleScreenShare,
  } = useMeetingScreenShare({
    room,
    localParticipant,
    remoteParticipants,
    allParticipants,
    isMicMuted,
    isMicMutedRef,
    isMinimized,
    t,
  });

  // Pinned/Focused Participant
  const [pinnedParticipantIdentity, setPinnedParticipantIdentity] = useState<string | null>(null);
  useEffect(() => {
    if (pinnedParticipantIdentity) {
      const stillExists = allParticipants.find(p => p.identity === pinnedParticipantIdentity);
      if (!stillExists) setPinnedParticipantIdentity(null);
    }
  }, [allParticipants, pinnedParticipantIdentity]);

  // Layout Hook
  const {
    isGridMode,
    setIsGridMode,
    handleToggleLayout,
    gridLayout,
    isFullScreen,
  } = useMeetingLayout({
    windowWidth,
    windowHeight,
    insets,
    participantCount: activeMeetingParticipants.length,
    hasActiveScreenShare: Boolean(activeScreenShare),
    pinnedParticipantIdentity,
  });

  // Automatically expand layout when screen sharing begins
  useEffect(() => {
    if (activeScreenShare) {
      setIsGridMode(false);
      setPinnedParticipantIdentity(null);
    }
  }, [activeScreenShare, setIsGridMode]);

  // Intercept back button to minimize in-app
  useEffect(() => {
    if (isMinimized) return;

    const backAction = () => {
      if (onMinimize) {
        onMinimize();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [isMinimized, onMinimize]);

  // Modal visibility states
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Invite by Username state
  const [inviteSearchQuery, setInviteSearchQuery] = useState('');
  const [registeredUsers, setRegisteredUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [invitedUsernames, setInvitedUsernames] = useState<Set<string>>(new Set());

  // Chat Handler Hook
  const {
    chatInput,
    setChatInput,
    messages,
    isUploadingAttachment,
    uploadProgress,
    unreadChatCount,
    setUnreadChatCount,
    previewMedia,
    setPreviewMedia,
    chatScrollViewRef,
    sendChatMessage,
    handlePickAndSendAttachment,
  } = useMeetingChatHandler({
    room,
    localParticipant,
    isHost,
    currentUserName,
    meetingCode,
    roomName,
    isChatOpen,
    t,
  });

  // Controls Auto-Hide & Gestures Animation Hook
  const isAnyModalOpen = Boolean(
    isAudioModalOpen || isChatOpen || isParticipantsOpen || isInfoModalOpen || isLeaveModalOpen || isInviteModalOpen
  );
  const {
    showControls,
    controlsOpacity,
    headerTranslateY,
    footerTranslateY,
    resetControlsTimer,
    showPipActions,
    pipActionsOpacity,
    resetPipActionsTimer,
    handleScreenTap,
  } = useMeetingControlsAnimation({
    isNativePip,
    isMinimized,
    isAnyModalOpen,
  });

  const displayCode = useMemo(() => formatMeetingCode(meetingCode || roomName), [meetingCode, roomName]);
  const displayTitle = useMemo(() => {
    if (meetingTitle && !meetingTitle.toLowerCase().startsWith('cloudnews-')) {
      return meetingTitle;
    }
    return displayCode;
  }, [meetingTitle, displayCode]);
  const meetingLink = useMemo(() => getMeetingInviteLink(displayCode), [displayCode]);

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleMic = async () => {
    if (!localParticipant) return;
    const nextEnabled = isMicMuted;
    try {
      if (nextEnabled && Platform.OS === 'android') {
        const audioGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (!audioGranted) {
          const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
          if (res !== PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert('Permission Denied', 'Microphone permission is required to speak.');
            return;
          }
        }
      }
      if (!isInWaitingRoom) {
        await localParticipant.setMicrophoneEnabled(nextEnabled);
      }
      userWantsMicMutedRef.current = !nextEnabled;
      setIsMicMuted(!nextEnabled);
    } catch (err) {
      console.error('[MeetingRoom] Toggle mic failed:', err);
      setIsMicMuted(!localParticipant.isMicrophoneEnabled);
    }
  };

  const handleToggleCamera = async () => {
    if (!localParticipant) return;
    const nextEnabled = isCameraOff;
    try {
      if (nextEnabled && Platform.OS === 'android') {
        const cameraGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (!cameraGranted) {
          const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
          if (res !== PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert('Permission Denied', 'Camera permission is required for video.');
            return;
          }
        }
      }
      await localParticipant.setCameraEnabled(nextEnabled);
      userWantsCameraOffRef.current = !nextEnabled;
      setIsCameraOff(!nextEnabled);
    } catch (err) {
      console.error('[MeetingRoom] Toggle camera failed:', err);
      setIsCameraOff(!localParticipant.isCameraEnabled);
    }
  };

  const handleSwitchCamera = async () => {
    try {
      resetControlsTimer();
      const nextFacing: 'user' | 'environment' = cameraFacing === 'user' ? 'environment' : 'user';
      const videoPubs = Array.from(localParticipant?.videoTrackPublications?.values() ?? []);
      const cameraPub = videoPubs.find(p => p.source === Track.Source.Camera);
      const videoTrack = (cameraPub?.videoTrack || cameraPub?.track) as any;
      const mediaTrack = videoTrack?.mediaStreamTrack;

      if (videoTrack && typeof videoTrack.restartTrack === 'function') {
        await videoTrack.restartTrack({ facingMode: nextFacing });
      } else if (mediaTrack && typeof mediaTrack._switchCamera === 'function') {
        mediaTrack._switchCamera();
      }

      if ((room as any)?.options?.videoCaptureDefaults) {
        (room as any).options.videoCaptureDefaults.facingMode = nextFacing;
        delete (room as any).options.videoCaptureDefaults.deviceId;
      }

      setCameraFacing(nextFacing);
    } catch (e) {
      console.error('[CameraSwitch] Failed to switch camera:', e);
    }
  };

  const handleParticipantPress = (identity: string) => {
    if (allParticipants.length <= 1) {
      setIsGridMode(false);
      return;
    }
    setPinnedParticipantIdentity(prev => prev === identity ? null : identity);
    setIsGridMode(false);
  };

  // Fetch users when Invite Modal opens
  useEffect(() => {
    if (isInviteModalOpen) {
      setIsLoadingUsers(true);
      getUsers()
        .then(res => {
          if (res?.success && Array.isArray(res.data)) {
            setRegisteredUsers(res.data);
          }
        })
        .catch(err => console.error('[Invite] Error fetching users:', err))
        .finally(() => setIsLoadingUsers(false));
    }
  }, [isInviteModalOpen]);

  const filteredInviteUsers = useMemo(() => {
    const q = inviteSearchQuery.trim().toLowerCase().replace(/^@/, '');
    if (!q) {
      return registeredUsers.slice(0, 20);
    }
    return registeredUsers.filter(u =>
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q))
    );
  }, [registeredUsers, inviteSearchQuery]);

  const handleSendInvite = (targetUsername: string, targetName?: string) => {
    const clean = targetUsername.trim().replace(/^@/, '');
    if (!clean) return;

    setInvitedUsernames(prev => new Set([...prev, clean]));
    const inviteText = `Join my Cloud News Meet:\nTitle: ${meetingTitle || displayCode}\nCode: ${displayCode}\nLink: ${meetingLink}\nApp: cloudnews://room/${displayCode}`;

    Alert.alert(
      'Invitation Sent!',
      `Invitation to join meeting ${displayCode} was sent to @${clean}${targetName ? ` (${targetName})` : ''}.`,
      [
        { text: 'Done', style: 'default' },
        {
          text: 'Share Link',
          onPress: () => {
            Share.share({
              message: inviteText,
              title: `Join ${meetingTitle || 'Meeting'}`,
            }).catch(() => {});
          },
        },
      ]
    );
  };

  const handleShareInviteLink = async () => {
    const inviteText = `Join my Cloud News Meet:\nTitle: ${meetingTitle || displayCode}\nCode: ${displayCode}\nLink: ${meetingLink}\nApp: cloudnews://room/${displayCode}`;
    try {
      await Share.share({
        message: inviteText,
        title: `Join ${meetingTitle || 'Meeting'}`,
      });
    } catch {
      await Clipboard.setStringAsync(meetingLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleMuteAllPress = () => {
    if (!isHost) {
      Alert.alert(t('common.error'), 'Only the meeting host can mute all participants.');
      return;
    }

    Alert.alert(
      t('meeting.muteAllConfirmTitle'),
      t('meeting.muteAllConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('meeting.muteAll'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (localParticipant) {
                await localParticipant.setMicrophoneEnabled(false);
                setIsMicMuted(true);
              }

              const encoder = new TextEncoder();
              const payload = encoder.encode(
                JSON.stringify({
                  type: 'MUTE_ALL',
                  host: localParticipant?.name || 'Host',
                  timestamp: Date.now(),
                })
              );
              await localParticipant?.publishData(payload, { reliable: true } as any);
              Alert.alert(t('common.success'), 'All participants have been muted.');
            } catch (e) {
              console.error('[MuteAll] Failed:', e);
              Alert.alert(t('common.error'), 'Failed to send mute all command.');
            }
          },
        },
      ]
    );
  };

  if (room.state === ConnectionState.Connecting) {
    return (
      <View style={styles.loadingOverlay}>
        <ActivityIndicator color="#00A8FF" size="large" />
        <Text style={styles.loadingText}>Establishing high-speed connection...</Text>
        <Text style={styles.subLoadingText}>Optimizing for cross-border traffic</Text>
      </View>
    );
  }

  if (isInWaitingRoom) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050B14' }}>
        <WaitingRoomView
          insets={insets}
          meetingTitle={displayTitle}
          meetingCode={displayCode}
          displayName={localParticipant?.name || 'Guest'}
          isMicMuted={isMicMuted}
          isCameraOff={isCameraOff}
          cameraTrack={cameraTracks.find(t => t.participant?.identity === localParticipant?.identity)}
          cameraFacing={cameraFacing}
          isHostPresent={isHostPresent}
          onToggleMic={handleToggleMic}
          onToggleCamera={handleToggleCamera}
          onSwitchCamera={handleSwitchCamera}
          onOpenAudioModal={() => {
            fetchAudioOutputs(false);
            setIsAudioModalOpen(true);
          }}
          renderCurrentAudioIcon={renderCurrentAudioIcon}
          onLeave={() => {
            resetControlsTimer();
            setIsLeaveModalOpen(true);
          }}
          onMinimize={onMinimize}
        />

        <LeaveMeetingModal
          visible={isLeaveModalOpen}
          isHost={isHost}
          bottomInset={insets.bottom}
          onConfirm={() => {
            setIsLeaveModalOpen(false);
            handleLeaveWaitingRoom();
          }}
          onCancel={() => setIsLeaveModalOpen(false)}
        />

        <AudioDeviceModal
          visible={isAudioModalOpen}
          bottomInset={insets.bottom}
          availableOutputs={availableOutputs}
          selectedAudioOutput={selectedAudioOutput}
          isRefreshingOutputs={isRefreshingOutputs}
          onRefresh={() => fetchAudioOutputs(false)}
          onSelectDevice={handleSelectAudioOutput}
          onClose={() => setIsAudioModalOpen(false)}
          getAudioDeviceDisplay={getAudioDeviceDisplay}
        />
      </View>
    );
  }

  return (
    <View
      style={[styles.contentContainer, isNativePip && styles.pipVideoOnly]}
      collapsable={false}
      onLayout={handleMeetingLayout}
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* --- TOP BANNERS --- */}
      {!isNativePip && (
        <MeetingBanners
          insets={insets}
          showControls={showControls}
          showAdmittedBanner={showAdmittedBanner}
          isHost={isHost}
          latestWaitingGuest={latestWaitingGuest}
          onAdmitGuest={handleAdmitGuest}
          onDenyGuest={handleDenyGuest}
          isReconnectingUI={isReconnectingUI}
          isRoomConnected={room.state === ConnectionState.Connected}
          isScreenSharing={isScreenSharing}
          isScreenShareToggling={isScreenShareToggling}
          shouldShowScreenShareBanner={Boolean(isGridMode || pinnedParticipantIdentity || !activeScreenShare)}
          onStopScreenShare={() => {
            if (isScreenShareActionInFlight.current || screenShareLifecycleRef.current !== 'idle') return;
            handleToggleScreenShare();
          }}
        />
      )}

      {/* --- TOP HEADER --- */}
      {!isNativePip && (
        <MeetingHeaderBar
          insets={insets}
          showControls={showControls}
          controlsOpacity={controlsOpacity}
          headerTranslateY={headerTranslateY}
          isGridMode={isGridMode}
          displayTitle={displayTitle}
          callDuration={callDuration}
          renderCurrentAudioIcon={renderCurrentAudioIcon}
          onOpenAudioModal={() => {
            resetControlsTimer();
            fetchAudioOutputs(false);
            setIsAudioModalOpen(true);
          }}
          onMinimize={() => {
            resetControlsTimer();
            if (onMinimize) onMinimize();
          }}
          onOpenInfoModal={() => {
            resetControlsTimer();
            setIsInfoModalOpen(true);
          }}
          onLeave={() => {
            resetControlsTimer();
            setIsLeaveModalOpen(true);
          }}
        />
      )}

      {/* --- DYNAMIC PARTICIPANTS / SCREEN SHARE VIEW --- */}
      <MeetingStageView
        isFullScreen={isFullScreen}
        isNativePip={isNativePip}
        insets={insets}
        activeScreenShare={activeScreenShare}
        isGridMode={isGridMode}
        showControls={showControls}
        isScreenSharing={isScreenSharing}
        localParticipant={localParticipant}
        activeMeetingParticipants={activeMeetingParticipants}
        cameraFacing={cameraFacing}
        pinnedParticipantIdentity={pinnedParticipantIdentity}
        gridLayout={gridLayout}
        onToggleLayout={handleToggleLayout}
        onAudioPress={() => {
          resetControlsTimer();
          fetchAudioOutputs(false);
          setIsAudioModalOpen(true);
        }}
        renderCurrentAudioIcon={renderCurrentAudioIcon}
        onScreenTap={handleScreenTap}
        onToggleScreenShare={() => {
          if (isScreenShareActionInFlight.current || screenShareLifecycleRef.current !== 'idle') return;
          handleToggleScreenShare();
        }}
        onSwitchCamera={handleSwitchCamera}
        onParticipantPress={handleParticipantPress}
      />

      {/* --- CHAT DRAWER --- */}
      {!isNativePip && (
        <MeetingChatDrawer
          insets={insets}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          messages={messages}
          chatScrollViewRef={chatScrollViewRef}
          chatInput={chatInput}
          setChatInput={setChatInput}
          onSendMessage={sendChatMessage}
          onPickAndSendAttachment={handlePickAndSendAttachment}
          isUploadingAttachment={isUploadingAttachment}
          uploadProgress={uploadProgress}
          onPreviewMedia={(media) => setPreviewMedia(media)}
        />
      )}

      {/* --- PARTICIPANTS DRAWER --- */}
      {!isNativePip && (
        <MeetingParticipantsDrawer
          insets={insets}
          isOpen={isParticipantsOpen}
          onClose={() => setIsParticipantsOpen(false)}
          activeMeetingParticipants={activeMeetingParticipants}
          localParticipantIdentity={localParticipant?.identity}
          isHost={isHost}
          waitingGuests={waitingGuests}
          onMuteAll={handleMuteAllPress}
          onOpenInviteModal={() => setIsInviteModalOpen(true)}
          onAdmitAll={handleAdmitAll}
          onAdmitGuest={handleAdmitGuest}
          onDenyGuest={handleDenyGuest}
          onRemoveParticipant={handlePromptRemoveParticipant}
          checkIsParticipantHost={checkIsParticipantHost}
          getAvatarTextStyle={getAvatarTextStyle}
          getInitials={getInitials}
        />
      )}

      {/* --- BOTTOM CONTROLS --- */}
      {!isNativePip && (
        <MeetingControlsDock
          insets={insets}
          showControls={showControls}
          controlsOpacity={controlsOpacity}
          footerTranslateY={footerTranslateY}
          isMicMuted={isMicMuted}
          isCameraOff={isCameraOff}
          unreadChatCount={unreadChatCount}
          canScreenShare={allParticipants.length > 1 || isScreenSharing}
          isScreenSharing={isScreenSharing}
          isScreenShareToggling={isScreenShareToggling}
          participantBadgeText={isHost && waitingGuests.length > 0 ? `+${waitingGuests.length}` : activeMeetingParticipants.length}
          isHostWaitingGuestsBadge={isHost && waitingGuests.length > 0}
          onToggleMic={() => {
            resetControlsTimer();
            handleToggleMic();
          }}
          onToggleCamera={() => {
            resetControlsTimer();
            handleToggleCamera();
          }}
          onOpenChat={() => {
            resetControlsTimer();
            setIsChatOpen(true);
            setUnreadChatCount(0);
          }}
          onToggleScreenShare={() => {
            if (isScreenShareActionInFlight.current || screenShareLifecycleRef.current !== 'idle') return;
            resetControlsTimer();
            handleToggleScreenShare();
          }}
          onOpenParticipants={() => {
            resetControlsTimer();
            setIsParticipantsOpen(true);
          }}
        />
      )}

      {/* Fullscreen tap surface */}
      {!showControls && !isNativePip && !isMinimized && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleScreenTap}
          style={styles.fullScreenTapSurface}
        />
      )}

      {/* Native PiP Action Bar */}
      {isNativePip && (
        <NativePipActionBar
          showPipActions={showPipActions}
          pipActionsOpacity={pipActionsOpacity}
          isMicMuted={isMicMuted}
          isCameraOff={isCameraOff}
          onToggleMic={() => {
            resetPipActionsTimer();
            handleToggleMic();
          }}
          onToggleCamera={() => {
            resetPipActionsTimer();
            handleToggleCamera();
          }}
          onLeaveMeeting={handleLeaveOrEndMeeting}
        />
      )}

      {/* Modals */}
      <MeetingInfoModal
        visible={!isNativePip && isInfoModalOpen}
        bottomInset={insets.bottom}
        meetingTitle={displayTitle}
        meetingLink={meetingLink}
        copied={copied}
        onCopyLink={copyToClipboard}
        onClose={() => setIsInfoModalOpen(false)}
      />

      <LeaveMeetingModal
        visible={!isNativePip && isLeaveModalOpen}
        isHost={isHost}
        bottomInset={insets.bottom}
        onConfirm={handleLeaveOrEndMeeting}
        onCancel={() => setIsLeaveModalOpen(false)}
      />

      <InviteParticipantsModal
        visible={!isNativePip && isInviteModalOpen}
        bottomInset={insets.bottom}
        meetingLink={meetingLink}
        copied={copied}
        inviteSearchQuery={inviteSearchQuery}
        setInviteSearchQuery={setInviteSearchQuery}
        isLoadingUsers={isLoadingUsers}
        filteredInviteUsers={filteredInviteUsers}
        invitedUsernames={invitedUsernames}
        onSendInvite={handleSendInvite}
        onShareInviteLink={handleShareInviteLink}
        onClose={() => setIsInviteModalOpen(false)}
        getAvatarTextStyle={getAvatarTextStyle}
        getInitials={getInitials}
      />

      <AudioDeviceModal
        visible={!isNativePip && isAudioModalOpen}
        bottomInset={insets.bottom}
        availableOutputs={availableOutputs}
        selectedAudioOutput={selectedAudioOutput}
        isRefreshingOutputs={isRefreshingOutputs}
        onRefresh={() => fetchAudioOutputs(false)}
        onSelectDevice={handleSelectAudioOutput}
        onClose={() => setIsAudioModalOpen(false)}
        getAudioDeviceDisplay={getAudioDeviceDisplay}
      />

      <MediaPreviewModal
        visible={!isNativePip && Boolean(previewMedia)}
        media={previewMedia}
        onClose={() => setPreviewMedia(null)}
      />

      {Platform.OS === 'ios' && ScreenCapturePickerViewComponent && (
        <ScreenCapturePickerViewComponent
          ref={screenCapturePickerRef}
          style={styles.iosBroadcastPicker}
        />
      )}
    </View>
  );
};

export const MeetingRoomScreen: React.FC = () => {
  const navigation = useNavigation<RootStackNavigationProp<'MeetingRoom'>>();
  const route = useRoute<RootStackRouteProp<'MeetingRoom'>>();
  const { activeMeeting, startMeeting } = useMeeting();

  const {
    roomName,
    token,
    serverUrl,
    meetingCode,
    meetingTitle,
    displayName,
    isHost = false,
    isGuest = false,
    muteAudio = false,
    muteVideo = false,
    hostSessionToken,
  } = route.params || {};

  useEffect(() => {
    if (token && serverUrl && roomName) {
      if (
        activeMeeting?.roomName === roomName &&
        activeMeeting?.token === token
      ) {
        navigation.navigate('Home');
        return;
      }
      startMeeting({
        roomName,
        token,
        serverUrl,
        displayName,
        meetingCode,
        meetingTitle,
        isHost,
        isGuest,
        muteAudio,
        muteVideo,
        hostSessionToken,
      });
      navigation.navigate('Home');
    }
  }, [
    roomName,
    token,
    serverUrl,
    displayName,
    meetingCode,
    meetingTitle,
    isHost,
    isGuest,
    muteAudio,
    muteVideo,
    hostSessionToken,
    startMeeting,
    navigation,
    activeMeeting,
  ]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#00A8FF" />
    </View>
  );
};

export default MeetingRoomScreen;
