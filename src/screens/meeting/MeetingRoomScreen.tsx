import {
  LiveKitRoom,
  useLocalParticipant,
  useParticipants,
  useTracks,
  VideoTrack,
  useRoomContext,
  AudioSession,
} from '@livekit/react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  Track,
  TrackEvent,
  LocalVideoTrack,
  ConnectionState,
  Participant,
  RoomEvent,
  ParticipantEvent,
  DataPacket_Kind,
  facingModeFromLocalTrack,
  DisconnectReason,
  TrackPublishOptions,
  ScreenShareCaptureOptions,
  LocalTrackPublication,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
} from 'livekit-client';
import * as Clipboard from 'expo-clipboard';
import {
  ChevronDown,
  ChevronLeft,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorUp,
  MonitorOff,
  StopCircle,
  Users,
  Volume2,
  X,
  Send,
  UserPlus,
  Video as LucideVideo,
  VideoOff,
  Copy,
  Check,
  Link as LinkIcon,
  Camera,
  SwitchCamera,
  LayoutGrid,
  Maximize2,
  Search,
  Smartphone,
  Headphones,
  Bluetooth,
  RefreshCw,
  Clock,
  ShieldCheck,
  Radio,
  Paperclip,
  FileText,
  Film,
  Image as ImageIcon,
  Play,
  FolderOpen,
  AlertCircle,
  Download,
  Eye,
  UserX,
  PhoneOff,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { validateFileSize, formatBytes, MAX_FILE_SIZE_BYTES } from '../../utils/fileValidation';
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  LayoutChangeEvent,
  TextInput,
  ScrollView,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Animated,
  Share,
  ToastAndroid,
  FlatList,
  BackHandler,
  Image,
  Linking,
  KeyboardAvoidingView,
  AppState,
  AppStateStatus,
  findNodeHandle,
  NativeModules,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { RootStackNavigationProp, RootStackRouteProp } from '../../navigation/types';
import {
  getMeetingInviteLink,
  getUsers,
  uploadMeetingFile,
  User,
  endMeeting,
  leaveMeeting,
  sendHostHeartbeat,
  reacquireHostSession,
  joinMeeting,
  removeMeetingParticipant,
  getMeetingMessages,
  sendMeetingMessage,
  normalizeMeetingCode,
} from '../../services/api';
import { useTranslation } from '../../hooks/useTranslation';
import storage, { StorageKeys } from '../../services/storage';
import { useMeeting } from '../../context/MeetingContext';
import {
  acquireScreenShareWakeLock,
  releaseScreenShareWakeLock,
  startMeetingForegroundService,
  stopMeetingForegroundService,
} from '../../utils/wakeLock';
import { startAudioSession, stopAudioSession } from '../../services/livekit';
import { MediaPreviewModal, MediaPreviewItem, sanitizeMediaUrl } from '../../components/meeting/MediaPreviewModal';
import { setPipConfig, prepareScreenShare, addPipListener, suppressMeetingChrome } from '../../utils/pip';
import { getInitials, getAvatarTextStyle } from '../../utils/helpers';
import { styles } from './meetingRoomStyles';
import { checkIsParticipantHost, formatMeetingCode, formatTime, type ChatMessage } from './meetingRoomUtils';
import { ParticipantCard } from './ParticipantCard';
import { ScreenShareStage } from './ScreenShareStage';
import { WaitingRoomView } from './WaitingRoomView';
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
  // Chrome follows the real view size, after it has stopped changing.
  // Updating the tree on the PiP true/false events makes Samsung cancel the
  // window immediately (log: PiP true, then PiP false, then AppState active).
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

  // 1. Keep display awake while actively inside Meeting UI (FLAG_KEEP_SCREEN_ON via expo-keep-awake)
  // Ensures screen does not sleep while viewing screen share or in active meeting UI.
  // Releases keep-awake when meeting is minimized or exited, decoupled from MediaProjection and wakeLock.ts.
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

    // Single-flight guard: do not overlap heartbeats or start a heartbeat while recovery is running
    if (isHostHeartbeatInFlightRef.current || isHostSessionRecoveryInFlightRef.current) {
      if (__DEV__) console.log('[MeetingRoomScreen] Host heartbeat/recovery already in-flight, skipping duplicate pulse');
      return;
    }

    const token = hostSessionTokenRef.current;
    if (!token) return;

    isHostHeartbeatInFlightRef.current = true;

    try {
      await sendHostHeartbeat(meetingCode, token);
      if (__DEV__ && isForegroundPulse) {
        console.log('[MeetingRoomScreen] Foreground host heartbeat acknowledged');
      }
    } catch (err: any) {
      const errorCode = err?.response?.data?.code;

      // When the host lease expired (e.g. background > 90s), perform controlled re-acquisition
      // using the existing acquireHostLock() rules.
      if (errorCode === 'HOST_SESSION_INVALID') {
        // Stale token check: if token was already rotated or recovery completed in the last 5 seconds, ignore this expired error
        if (token !== hostSessionTokenRef.current || Date.now() - lastRecoverySuccessTimestampRef.current < 5000) {
          if (__DEV__) console.log('[MeetingRoomScreen] Ignoring expired lease error for already rotated host token');
          return;
        }

        // Single-flight recovery mutex
        if (isHostSessionRecoveryInFlightRef.current) {
          if (__DEV__) console.log('[MeetingRoomScreen] Host session recovery already in flight, skipping duplicate trigger');
          return;
        }

        isHostSessionRecoveryInFlightRef.current = true;
        console.log('[MeetingRoomScreen] Host session lease expired; performing controlled re-acquisition...');

        try {
          const reacquireRes = await reacquireHostSession(meetingCode, token);
          if (reacquireRes.success && reacquireRes.data?.host_session_token) {
            const newToken = reacquireRes.data.host_session_token;
            hostSessionTokenRef.current = newToken;
            lastRecoverySuccessTimestampRef.current = Date.now();
            const cleanCode = meetingCode.replace(/[\s-]/g, '');
            await storage.setItem(`host_session_${cleanCode}`, newToken);
            console.log('[MeetingRoomScreen] Host session successfully re-acquired with fresh token');
            return;
          }
        } catch (reacquireErr: any) {
          const reacquireStatus = reacquireErr?.response?.status;
          const reacquireCode = reacquireErr?.response?.data?.code;

          // If the specialized reacquire endpoint returns 404 (e.g. pending backend route deployment),
          // fall back to re-acquiring the host lock via the existing joinMeeting endpoint.
          if (reacquireStatus === 404) {
            console.log('[MeetingRoomScreen] Reacquire endpoint returned 404; falling back to joinMeeting host recovery...');
            try {
              const cleanCode = meetingCode.replace(/[\s-]/g, '');
              const joinRes = await joinMeeting(cleanCode, undefined, undefined, token);
              if (joinRes.success && joinRes.data?.host_session_token) {
                const newToken = joinRes.data.host_session_token;
                hostSessionTokenRef.current = newToken;
                lastRecoverySuccessTimestampRef.current = Date.now();
                await storage.setItem(`host_session_${cleanCode}`, newToken);
                console.log('[MeetingRoomScreen] Host session successfully recovered via fallback with fresh token');
                return;
              }
            } catch (fallbackErr: any) {
              console.warn('[MeetingRoomScreen] Host recovery fallback failed:', fallbackErr?.response?.data || fallbackErr?.message);
            }
          }

          // If another concurrent recovery attempt already succeeded or rotated the token,
          // do NOT treat HOST_ALREADY_IN_MEETING as a fatal ownership conflict.
          const isJustRecovered = Date.now() - lastRecoverySuccessTimestampRef.current < 5000;
          if (reacquireCode === 'HOST_ALREADY_IN_MEETING' && isJustRecovered) {
            if (__DEV__) console.log('[MeetingRoomScreen] Suppressing duplicate HOST_ALREADY_IN_MEETING race after successful recovery');
            return;
          }

          console.warn('[MeetingRoomScreen] Host session re-acquisition failed:', reacquireErr?.response?.data || reacquireErr?.message);
          if (reacquireCode === 'MEETING_ENDED' || reacquireCode === 'HOST_ALREADY_IN_MEETING') {
            console.warn('[MeetingRoomScreen] Critical host ownership conflict:', reacquireCode);
          }
        } finally {
          isHostSessionRecoveryInFlightRef.current = false;
        }
      } else {
        console.warn('[MeetingRoomScreen] Host heartbeat warning:', err?.response?.data || err?.message);
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
        if (__DEV__) console.log('[MeetingRoomScreen] AppState active: sending immediate host heartbeat/recovery pulse');
        performHostHeartbeat(true);
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      sub.remove();
    };
  }, [isHostParam, meetingCode, performHostHeartbeat]);

  const { activeMeeting, isReconnectingUI, manualReconnect } = useMeeting();
  const isUserLeavingRef = useRef<boolean>(false);

  useEffect(() => {
    return addPipListener(inPip => {
      if (__DEV__) console.log('[PiP] Native Picture-in-Picture state changed:', inPip);
    });
  }, []);

  // Subscribe to LiveKit room reconnection to re-sync local audio/video publish state if active
  useEffect(() => {
    if (!room) return;

    const handleReconnected = () => {
      if (__DEV__) console.log('[MeetingRoomScreen] Successfully reconnected to room:', room.name);

      // Re-sync local audio/video publish state if active
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

  const getAudioDeviceDisplay = useCallback((deviceId: string) => {
    switch (deviceId) {
      case 'speaker':
      case 'force_speaker':
        return {
          name: t('meeting.phoneSpeaker'),
          description: t('meeting.phoneSpeakerDesc'),
          icon: Volume2,
        };
      case 'earpiece':
      case 'default':
        return {
          name: t('meeting.earSpeaker'),
          description: t('meeting.earSpeakerDesc'),
          icon: Smartphone,
        };
      case 'headset':
        return {
          name: t('meeting.wiredHeadphones'),
          description: t('meeting.wiredHeadphonesDesc'),
          icon: Headphones,
        };
      case 'bluetooth':
        return {
          name: t('meeting.bluetoothEarphones'),
          description: t('meeting.bluetoothEarphonesDesc'),
          icon: Bluetooth,
        };
      default:
        return {
          name: deviceId.charAt(0).toUpperCase() + deviceId.slice(1),
          description: t('meeting.outputDevices'),
          icon: Volume2,
        };
    }
  }, [t]);

  const [callDuration, setCallDuration] = useState(0);
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

  type ScreenShareLifecycleState = 'idle' | 'publishing' | 'unpublishing';
  const screenShareLifecycleRef = useRef<ScreenShareLifecycleState>('idle');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isShareButtonBusy, setIsShareButtonBusy] = useState(false);
  const isTogglingScreenShareRef = useRef(false);
  const isScreenShareToggling = isShareButtonBusy;
  const isScreenShareTogglingRef = isTogglingScreenShareRef;
  const isStartingScreenShareRef = useRef(false);
  const isScreenShareActionInFlight = useRef(false);
  const pendingScreenShareActionRef = useRef<'start' | 'stop' | null>(null);
  const executeToggleScreenShareRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const screenCapturePickerRef = useRef<any>(null);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [previewMedia, setPreviewMedia] = useState<MediaPreviewItem | null>(null);
  const isChatOpenRef = useRef(false);

  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
    if (isChatOpen) {
      setUnreadChatCount(0);
    }
  }, [isChatOpen]);

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

  // Audio Output device routing state
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [availableOutputs, setAvailableOutputs] = useState<string[]>(['speaker', 'earpiece']);
  const [selectedAudioOutput, setSelectedAudioOutput] = useState<string>('speaker');
  const [isRefreshingOutputs, setIsRefreshingOutputs] = useState(false);

  const fetchAudioOutputs = useCallback(async (autoSelectDefault = false) => {
    try {
      setIsRefreshingOutputs(true);
      const outputs = await AudioSession.getAudioOutputs();
      console.log('[Audio] Detected available outputs:', outputs);

      // Ensure both phone speaker and ear speaker (earpiece) are always present, alongside any connected bluetooth/headset
      const list = outputs && outputs.length > 0 ? [...outputs] : ['speaker', 'earpiece'];
      if (!list.includes('speaker') && !list.includes('force_speaker')) {
        list.unshift('speaker');
      }
      if (!list.includes('earpiece') && !list.includes('default')) {
        list.push('earpiece');
      }

      setAvailableOutputs(list);

      if (autoSelectDefault) {
        if (list.includes('speaker')) {
          setSelectedAudioOutput('speaker');
          await AudioSession.selectAudioOutput('speaker');
        } else if (list.includes('force_speaker')) {
          setSelectedAudioOutput('force_speaker');
          await AudioSession.selectAudioOutput('force_speaker');
        } else {
          setSelectedAudioOutput(list[0]);
          await AudioSession.selectAudioOutput(list[0]);
        }
      }
    } catch (err) {
      console.warn('[Audio] Failed to get audio outputs:', err);
    } finally {
      setIsRefreshingOutputs(false);
    }
  }, []);

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

    // Start Native Android Foreground Service to prevent OS from killing app or cutting mic when minimized
    startMeetingForegroundService(
      meetingTitle || roomName || 'CloudNews Meeting',
      '通话中 · 麦克风与音频已保持开启 / Meeting active · Mic & audio running'
    );

    return () => {
      isMounted = false;
      stopAudioSession();
      releaseScreenShareWakeLock();
      stopMeetingForegroundService();
    };
  }, [fetchAudioOutputs, meetingTitle, roomName]);

  const handleSelectAudioOutput = async (deviceId: string) => {
    try {
      console.log('[Audio] Selecting audio output:', deviceId);
      await AudioSession.selectAudioOutput(deviceId);
      setSelectedAudioOutput(deviceId);
      setIsAudioModalOpen(false);
    } catch (err: any) {
      console.warn('[Audio] Select output warning:', err);
      setSelectedAudioOutput(deviceId);
      setIsAudioModalOpen(false);
    }
  };

  const renderCurrentAudioIcon = () => {
    const config = getAudioDeviceDisplay(selectedAudioOutput);
    const IconComponent = config.icon;
    return <IconComponent color="#00A8FF" size={20} />;
  };

  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const chatScrollViewRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (isChatOpen) {
      setTimeout(() => {
        chatScrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [isChatOpen, messages.length]);

  // Controls auto-hide (5.5 seconds) & tap to toggle
  const [showControls, setShowControls] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const footerTranslateY = useRef(new Animated.Value(0)).current;
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetControlsTimer = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    if (isAudioModalOpen || isChatOpen || isParticipantsOpen || isInfoModalOpen || isLeaveModalOpen || isInviteModalOpen) {
      return;
    }
    hideTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 5500);
  }, [isAudioModalOpen, isChatOpen, isParticipantsOpen, isInfoModalOpen, isLeaveModalOpen, isInviteModalOpen]);

  useEffect(() => {
    if (isAudioModalOpen || isChatOpen || isParticipantsOpen || isInfoModalOpen || isLeaveModalOpen || isInviteModalOpen) {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      setShowControls(true);
    } else {
      resetControlsTimer();
    }
  }, [isAudioModalOpen, isChatOpen, isParticipantsOpen, isInfoModalOpen, isLeaveModalOpen, isInviteModalOpen, resetControlsTimer]);
  const [showPipActions, setShowPipActions] = useState(false);
  const pipActionsOpacity = useRef(new Animated.Value(0)).current;
  const pipActionsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetPipActionsTimer = useCallback(() => {
    if (pipActionsTimeoutRef.current) {
      clearTimeout(pipActionsTimeoutRef.current);
    }
    pipActionsTimeoutRef.current = setTimeout(() => {
      setShowPipActions(false);
    }, 3000);
  }, []);

  const handleScreenTap = useCallback(() => {
    if (isNativePip) {
      setShowPipActions(prev => {
        const next = !prev;
        if (next) {
          resetPipActionsTimer();
        } else if (pipActionsTimeoutRef.current) {
          clearTimeout(pipActionsTimeoutRef.current);
          pipActionsTimeoutRef.current = null;
        }
        return next;
      });
      return;
    }
    setShowControls(prev => {
      const next = !prev;
      if (next) {
        resetControlsTimer();
      } else {
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }
      }
      return next;
    });
  }, [isNativePip, resetControlsTimer, resetPipActionsTimer]);

  // Hide meeting chrome with opacity / compactPip flags. Header and footer
  // stay mounted so Android does not abort the PiP window.
  useEffect(() => {
    if (!isNativePip) {
      setShowPipActions(false);
      if (pipActionsTimeoutRef.current) {
        clearTimeout(pipActionsTimeoutRef.current);
        pipActionsTimeoutRef.current = null;
      }
      setShowControls(true);
      resetControlsTimer();
      return;
    }
    setShowControls(false);
    setShowPipActions(false);
  }, [isNativePip, resetControlsTimer]);

  useEffect(() => {
    Animated.timing(pipActionsOpacity, {
      toValue: showPipActions ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [showPipActions, pipActionsOpacity]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(controlsOpacity, {
        toValue: showControls ? 1 : 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(headerTranslateY, {
        toValue: showControls ? 0 : -100,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(footerTranslateY, {
        toValue: showControls ? 0 : 120,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [showControls]);

  // Screen Share & Camera Tracks Detection
  const screenShareTracks = useTracks([Track.Source.ScreenShare], {
    onlySubscribed: false,
    updateOnlyOn: [RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed],
  });
  const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });

  // Pinned/Focused Participant
  const [pinnedParticipantIdentity, setPinnedParticipantIdentity] = useState<string | null>(null);

  const remoteParticipants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  // Track whether remote participants have ever joined this meeting
  const hadRemoteParticipantsRef = useRef(false);
  useEffect(() => {
    if (remoteParticipants.length > 0) {
      hadRemoteParticipantsRef.current = true;
    }
  }, [remoteParticipants.length]);

  const activeRemoteScreenShare = useMemo(() => {
    return screenShareTracks.find(
      t => !t.participant?.isLocal && (localParticipant ? t.participant?.identity !== localParticipant.identity : true) && Boolean(t.publication)
    );
  }, [screenShareTracks, localParticipant]);

  const isRemotePresentationActive = Boolean(activeRemoteScreenShare);
  const isLocalScreenSharing = Boolean(isScreenSharing || localParticipant?.isScreenShareEnabled);

  const activeScreenShare = useMemo(() => {
    // 1. Remote screen share: any remote participant with a screen share publication
    if (activeRemoteScreenShare) return activeRemoteScreenShare;

    // 2. Local screen share: if local user is sharing screen
    if (isLocalScreenSharing) {
      const localShare = screenShareTracks.find(
        t => (t.participant?.isLocal || (localParticipant && t.participant?.identity === localParticipant.identity))
      );
      if (localShare) return localShare;

      if (localParticipant) {
        return {
          participant: localParticipant,
          source: Track.Source.ScreenShare,
          publication: localParticipant.getTrackPublication(Track.Source.ScreenShare),
        };
      }
    }

    return screenShareTracks.find(t => Boolean(t.publication));
  }, [screenShareTracks, localParticipant, isLocalScreenSharing, activeRemoteScreenShare]);

  // Determine if any screen share (local or remote) is currently active
  const isScreenShareActive = useMemo(() => {
    return Boolean(isLocalScreenSharing || isRemotePresentationActive || isStartingScreenShareRef.current);
  }, [isLocalScreenSharing, isRemotePresentationActive, isScreenShareToggling]);

  // Automatically switch layout to full screen when host or guest screen shares
  useEffect(() => {
    if (activeScreenShare) {
      console.log('[MeetingRoomScreen] Screen share started by', activeScreenShare.participant?.identity, '- automatically expanding to full screen');
      setIsGridMode(false);
      setPinnedParticipantIdentity(null);
    }
  }, [activeScreenShare]);

  // Synchronize Picture-in-Picture configuration with Android OS:
  // - While in a meeting (full screen or minimized in-app), allow OS PiP so minimizing the app preserves the floating window
  // - When broadcaster is actively sharing screen, disable native PiP so they can present 3rd-party apps
  // Do not call setPipConfig(false) when only the screen-share flag changes — that
  // disabled auto-enter mid Home-press and closed the live PiP window.
  useEffect(() => {
    setPipConfig(true, isLocalScreenSharing);
  }, [isLocalScreenSharing]);

  useEffect(() => {
    return () => {
      setPipConfig(false, false);
    };
  }, []);

  // Intercept hardware/system back button to minimize meeting in-app and return to the App's Home Screen
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

  // Track SIDs for which subscription request was already issued to prevent duplicate signaling
  const subscribedTrackSidsRef = useRef<Set<string>>(new Set());
  // In-flight subscription requests to avoid concurrent duplicate requests for the same track
  const subscribingInFlightTrackSidsRef = useRef<Set<string>>(new Set());
  // Bounded retry map for failed subscriptions (trackSid -> retry count)
  const subscriptionRetryCountRef = useRef<Map<string, number>>(new Map());
  const MAX_SUBSCRIPTION_RETRIES = 2;

  // Auto-subscribe to remote screen share tracks as soon as they are announced
  useEffect(() => {
    screenShareTracks.forEach(t => {
      if (!t.participant?.isLocal && t.publication) {
        const remotePub = t.publication as any;
        const trackSid = remotePub.trackSid || t.publication.trackSid;

        if (__DEV__) {
          console.log('[ScreenShare-Diag:SCREEN_SHARE_PUBLICATION_FOUND]', {
            identity: t.participant?.identity,
            trackSid,
            isSubscribed: remotePub.isSubscribed,
            hasTrack: Boolean(remotePub.track),
            roomState: room?.state,
          });
        }

        // Only issue subscription requests when room is Connected to avoid racing signaling recovery
        if (room?.state !== ConnectionState.Connected) {
          return;
        }

        if (
          typeof remotePub.setSubscribed === 'function' &&
          !remotePub.isSubscribed &&
          !remotePub.track &&
          trackSid &&
          !subscribedTrackSidsRef.current.has(trackSid) &&
          !subscribingInFlightTrackSidsRef.current.has(trackSid)
        ) {
          subscribedTrackSidsRef.current.add(trackSid);
          subscribingInFlightTrackSidsRef.current.add(trackSid);
          if (__DEV__) {
            console.log('[ScreenShare-Diag:SCREEN_SHARE_SUBSCRIBE_REQUEST]', {
              identity: t.participant?.identity,
              trackSid,
              isSubscribed: remotePub.isSubscribed,
              hasTrack: Boolean(remotePub.track),
            });
          }
          remotePub.setSubscribed(true);
        }
        if (typeof remotePub.setEnabled === 'function' && !remotePub.isEnabled) {
          remotePub.setEnabled(true);
        }
      }
    });
  }, [screenShareTracks, room?.state]);

  // Synchronize local screen sharing track state with system/UI
  useEffect(() => {
    if (!localParticipant) return;
    setIsScreenSharing(Boolean(localParticipant.isScreenShareEnabled));

    const syncScreenShare = (pub?: any) => {
      if (!localParticipant) return;
      // Filter out non-screen-share publications (mic, camera) so they don't interfere
      if (pub && pub.source && pub.source !== Track.Source.ScreenShare) {
        return;
      }
      const enabled = Boolean(localParticipant.isScreenShareEnabled);
      setIsScreenSharing(enabled);

      // If an active transition is already managing the unpublish/publish lifecycle,
      // prevent re-entrant PiP or wakeLock mutations.
      if (screenShareLifecycleRef.current !== 'idle') {
        return;
      }

      if (!enabled) {
        // System notification "Stop Sharing" or OS single-app stop fired externally
        prepareScreenShare(false);
        setPipConfig(true, false);
        releaseScreenShareWakeLock();
      }
    };

    localParticipant.on(ParticipantEvent.LocalTrackPublished, syncScreenShare);
    localParticipant.on(ParticipantEvent.LocalTrackUnpublished, syncScreenShare);

    return () => {
      localParticipant.off(ParticipantEvent.LocalTrackPublished, syncScreenShare);
      localParticipant.off(ParticipantEvent.LocalTrackUnpublished, syncScreenShare);
    };
  }, [localParticipant, isMinimized]);

  // Synchronize local microphone track state bidirectionally with localParticipant
  useEffect(() => {
    if (!localParticipant) return;

    const syncMic = (pub?: any) => {
      if (pub && pub.source && pub.source !== Track.Source.Microphone) {
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
  }, [localParticipant]);

  // Synchronize local camera track state bidirectionally with localParticipant
  useEffect(() => {
    if (!localParticipant) return;

    const syncCamera = (pub?: any) => {
      if (pub && pub.source && pub.source !== Track.Source.Camera) {
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
  }, [localParticipant]);

  // Synchronize initial mic and camera track states based on user pre-call choices
  useEffect(() => {
    if (!localParticipant) return;
    if (muteAudioParam || !hasAudioPermission) {
      localParticipant.setMicrophoneEnabled(false).catch(e => console.warn('[LiveKit] Set mic muted error:', e));
    }
    if (muteVideoParam || !hasCameraPermission) {
      localParticipant.setCameraEnabled(false).catch(e => console.warn('[LiveKit] Set camera off error:', e));
    }
  }, [localParticipant, muteAudioParam, muteVideoParam, hasAudioPermission, hasCameraPermission]);

  // Keep microphone and audio session active when app transitions to background (e.g. minimized to Home screen)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      console.log('[AppState] Meeting Room state changed to:', nextAppState);
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App is minimized to Android Home Screen or another app is focused.
        // Guarantee native foreground service & microphone capture remain active in background without being silenced.
        startMeetingForegroundService(
          meetingTitle || roomName || 'CloudNews Meeting',
          '通话中 · 麦克风与音频已保持开启 / Meeting active · Mic & audio running'
        );
        if (localParticipant && room?.state === ConnectionState.Connected) {
          if (!userWantsMicMutedRef.current && !localParticipant.isMicrophoneEnabled) {
            console.log('[AppState] Ensuring microphone track is preserved in background');
            localParticipant.setMicrophoneEnabled(true).catch(err => {
              console.warn('[AppState] Background microphone preserve warning:', err);
            });
          }
          if (!userWantsCameraOffRef.current && !localParticipant.isCameraEnabled) {
            localParticipant.setCameraEnabled(true).catch(() => {});
          }
        }
      } else if (nextAppState === 'active') {
        // Returned to foreground, re-verify mic/camera if the OS paused capture while backgrounded
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

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [localParticipant, meetingTitle, roomName, room?.state]);

  useEffect(() => {
    if (!isNativePip || !localParticipant || room?.state !== ConnectionState.Connected) {
      return;
    }
    if (!userWantsMicMutedRef.current && !localParticipant.isMicrophoneEnabled) {
      localParticipant.setMicrophoneEnabled(true).catch(() => {});
    }
    if (!userWantsCameraOffRef.current && !localParticipant.isCameraEnabled) {
      localParticipant.setCameraEnabled(true).catch(() => {});
    }
  }, [isNativePip, localParticipant, room?.state]);

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

  // Active participants in meeting (excludes unadmitted waiting guests for host view)
  const [waitingGuests, setWaitingGuests] = useState<{ identity: string; name: string; requestedAt: number }[]>([]);
  const [latestWaitingGuest, setLatestWaitingGuest] = useState<{ identity: string; name: string; requestedAt: number } | null>(null);
  const admittedGuestIdsRef = useRef<Set<string>>(new Set());
  const promptDismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-dismiss top prompt after 12s, but keep in waitingGuests list
  useEffect(() => {
    if (latestWaitingGuest) {
      if (promptDismissTimerRef.current) clearTimeout(promptDismissTimerRef.current);
      promptDismissTimerRef.current = setTimeout(() => {
        setLatestWaitingGuest(null);
      }, 12000);
    }
    return () => {
      if (promptDismissTimerRef.current) clearTimeout(promptDismissTimerRef.current);
    };
  }, [latestWaitingGuest]);

  // Determine if local user is host of this meeting room (guests are NEVER host)
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

  const localParticipantRef = useRef(localParticipant);
  localParticipantRef.current = localParticipant;

  const currentUserNameRef = useRef(currentUserName);
  currentUserNameRef.current = currentUserName;

  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  const isFetchingHistoryRef = useRef(false);
  const lastFetchedMeetingCodeRef = useRef<string | null>(null);

  // Fetch previous chat messages and shared files from server (for new joiners and history)
  const fetchMeetingMessages = useCallback(async () => {
    const code = meetingCode || roomName;
    if (!code) return;

    if (isFetchingHistoryRef.current) {
      return;
    }
    isFetchingHistoryRef.current = true;

    if (__DEV__) {
      console.log('[MEETING_CHAT_HISTORY_REQUEST]', {
        meetingId: code,
        roomName: roomName || '',
        endpoint: `/meetings/${normalizeMeetingCode(code)}/messages`,
      });
    }

    try {
      const res = await getMeetingMessages(code);
      if (res.success && Array.isArray(res.data)) {
        if (__DEV__) {
          console.log('[MEETING_CHAT_HISTORY_SUCCESS]', {
            meetingId: code,
            count: res.data.length,
          });
        }
        const historyMessages: ChatMessage[] = res.data.map(m => {
          const isSenderSelf = Boolean(
            (localParticipantRef.current?.name && m.sender_name === localParticipantRef.current.name) ||
            (currentUserNameRef.current && m.sender_name === currentUserNameRef.current) ||
            (isHostRef.current && (m.sender_name === 'Host' || m.sender_name === currentUserNameRef.current))
          );
          const rawTime = m.timestamp || m.created_at;
          const timeFormatted = rawTime
            ? new Date(rawTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          const messageText = m.message || m.text || '';
          const msgType = m.file_type || m.type || 'text';
          const mediaUrl = m.file_url || m.media_url;
          const clientMsgId = m.client_msg_id;
          const resolvedId = clientMsgId || String(m.id);

          return {
            id: resolvedId,
            clientMsgId: clientMsgId,
            sender: m.sender_name || 'Participant',
            text: messageText,
            time: timeFormatted,
            isSelf: isSenderSelf,
            type: msgType,
            fileName: m.file_name,
            fileSize: m.file_size,
            mediaUrl: sanitizeMediaUrl(mediaUrl),
            duration: m.duration,
          };
        });

        // Merge with existing messages and deduplicate by clientMsgId, ID, and precise signature
        setMessages(prev => {
          const map = new Map<string, ChatMessage>();
          // 1. Add historical messages from database
          historyMessages.forEach(msg => {
            map.set(msg.id, msg);
            if (msg.clientMsgId) {
              map.set(msg.clientMsgId, msg);
            }
          });
          // 2. Add local/live messages not yet in history
          prev.forEach(msg => {
            const alreadyInHistory = historyMessages.some(
              h =>
                h.id === msg.id ||
                (msg.clientMsgId && (h.clientMsgId === msg.clientMsgId || h.id === msg.clientMsgId)) ||
                (h.clientMsgId && h.clientMsgId === msg.id) ||
                (h.text === msg.text && h.sender === msg.sender && h.type === msg.type && h.time === msg.time)
            );
            if (!alreadyInHistory) {
              map.set(msg.id, msg);
            }
          });
          return Array.from(new Set(map.values()));
        });
        lastFetchedMeetingCodeRef.current = code;
      }
    } catch (err: any) {
      const status = err?.response?.status || err?.status || 'UNKNOWN';
      if (__DEV__) {
        console.warn('[MEETING_CHAT_HISTORY_FAILED]', {
          meetingId: code,
          status,
          endpoint: `/meetings/${normalizeMeetingCode(code)}/messages`,
        });
      }
      console.warn('[MeetingRoomScreen] Error fetching meeting messages history:', err);
    } finally {
      isFetchingHistoryRef.current = false;
    }
  }, [meetingCode, roomName]);

  // Reset messages if switching to a completely different meeting
  useEffect(() => {
    const code = meetingCode || roomName;
    if (code && lastFetchedMeetingCodeRef.current && lastFetchedMeetingCodeRef.current !== code) {
      setMessages([]);
    }
  }, [meetingCode, roomName]);

  // Load message history on mount
  useEffect(() => {
    fetchMeetingMessages();
  }, [fetchMeetingMessages]);

  // Silently refresh message history when chat drawer is opened
  useEffect(() => {
    if (isChatOpen) {
      fetchMeetingMessages();
    }
  }, [isChatOpen, fetchMeetingMessages]);

  // Refresh messages on room connected event
  useEffect(() => {
    if (!room) return;
    const onConnected = () => {
      fetchMeetingMessages();
    };
    room.on(RoomEvent.Connected, onConnected);
    return () => {
      room.off(RoomEvent.Connected, onConnected);
    };
  }, [room, fetchMeetingMessages]);

  // Active meeting participants (for video grid and members list)
  const activeMeetingParticipants = useMemo(() => {
    let list = allParticipants;
    if (isHost && waitingGuests.length > 0) {
      const waitingSet = new Set(waitingGuests.map(g => g.identity));
      list = list.filter(p => !waitingSet.has(p.identity));
    }

    // Deduplicate participants to eliminate ghost / reconnect duplicate cards for the same user
    const seenMap = new Map<string, Participant>();
    for (const p of list) {
      const rawKey = (p.name || p.identity || '').trim();
      const key = rawKey.toLowerCase();
      if (!key) {
        seenMap.set(p.identity, p);
        continue;
      }

      if (!seenMap.has(key)) {
        seenMap.set(key, p);
      } else {
        const existing = seenMap.get(key)!;
        // Priority 1: If current participant is local, local always wins over any remote stale ghost
        if (p.identity === localParticipant?.identity) {
          seenMap.set(key, p);
        } else if (existing.identity === localParticipant?.identity) {
          // Keep existing local
        } else {
          // Priority 2: Keep the participant that is speaking, or has active published tracks
          const pHasTracks = p.trackPublications && p.trackPublications.size > 0;
          const existHasTracks = existing.trackPublications && existing.trackPublications.size > 0;
          if (p.isSpeaking || (pHasTracks && !existHasTracks)) {
            seenMap.set(key, p);
          }
        }
      }
    }

    return Array.from(seenMap.values());
  }, [isHost, allParticipants, waitingGuests, localParticipant]);

  // Dynamic adaptive grid layout configuration: automatically shrinks card size, adapts columns/rows, and allows scrolling
  const gridLayout = useMemo(() => {
    const isPortrait = windowHeight >= windowWidth;
    const availableWidth = windowWidth - 20; // 10 padding each side in multiGridContainer
    const availableHeight = Math.max(
      320,
      windowHeight - (insets.top + 68) - (insets.bottom + 92) - 20
    );

    const participantCount = activeMeetingParticipants.length;
    const totalItems = participantCount;

    let cols = 2;
    let rows = 2;
    let gap = 8;
    let density: 'spacious' | 'normal' | 'compact' | 'ultra-compact' = 'normal';

    if (totalItems <= 1) {
      cols = 1;
      rows = 1;
      gap = 0;
      density = 'spacious';
    } else if (totalItems === 2) {
      if (isPortrait) {
        cols = 1;
        rows = 2;
        gap = 10;
        density = 'spacious';
      } else {
        cols = 2;
        rows = 1;
        gap = 10;
        density = 'spacious';
      }
    } else if (totalItems <= 4) {
      cols = 2;
      rows = 2;
      gap = 8;
      density = 'normal';
    } else if (totalItems <= 6) {
      cols = 2;
      rows = 3;
      gap = 8;
      density = 'compact';
    } else if (totalItems <= 8) {
      cols = 2;
      rows = 4;
      gap = 6;
      density = 'compact';
    } else {
      // 9, 10 or more participants
      cols = availableWidth >= 550 ? 3 : 2;
      const heightFor5 = Math.floor((availableHeight - (4 * 6)) / 5);
      if (heightFor5 >= 118 && totalItems >= 9) {
        rows = 5;
      } else {
        rows = 4;
      }
      gap = 6;
      density = 'ultra-compact';
    }

    const cardWidth = Math.floor((availableWidth - ((cols - 1) * gap)) / cols);
    let cardHeight: number;
    if (totalItems <= 1) {
      cardHeight = Math.min(Math.floor(availableHeight * 0.88), 480);
    } else if (totalItems <= 8 || (rows === 5 && totalItems <= 10)) {
      cardHeight = Math.max(114, Math.floor((availableHeight - ((rows - 1) * gap)) / rows));
    } else {
      // Exceeds visible rows (e.g. >8 or >10): fix cardHeight so it smoothly scrolls
      cardHeight = Math.max(118, Math.floor((availableHeight - ((rows - 1) * gap)) / rows));
    }

    return {
      cols,
      rows,
      gap,
      cardWidth,
      cardHeight,
      density,
      isScrollable: totalItems > (cols * rows),
    };
  }, [windowWidth, windowHeight, insets.top, insets.bottom, activeMeetingParticipants.length]);

  // User manual layout toggle: full screen vs grid mode
  const [isGridMode, setIsGridMode] = useState(false);

  const handleToggleLayout = useCallback(() => {
    setIsGridMode(prev => !prev);
  }, []);

  const isFullScreen = !isGridMode && Boolean(
    activeScreenShare || activeMeetingParticipants.length === 1 || pinnedParticipantIdentity
  );

  // Reset pin if participant leaves
  useEffect(() => {
    if (pinnedParticipantIdentity) {
      const stillExists = allParticipants.find(p => p.identity === pinnedParticipantIdentity);
      if (!stillExists) setPinnedParticipantIdentity(null);
    }
  }, [allParticipants, pinnedParticipantIdentity]);

  // Host presence data state
  const [hostPresenceData, setHostPresenceData] = useState<{ isPresent: boolean; hostIdentity?: string }>({
    isPresent: false,
  });

  // Determine if host is present in the meeting
  const isHostPresent = useMemo(() => {
    // If the local user is host, host is naturally present
    if (isHost) return true;

    // Check all remote participants for host metadata/identity
    const hasRemoteHost = allParticipants.some(p => {
      if (p.identity === localParticipant?.identity) return false;
      return checkIsParticipantHost(p);
    });
    if (hasRemoteHost) return true;

    // If data channel reported host presence, verify host participant is still in the room
    if (hostPresenceData.isPresent && hostPresenceData.hostIdentity) {
      return allParticipants.some(p => p.identity === hostPresenceData.hostIdentity);
    }

    return false;
  }, [isHost, allParticipants, localParticipant, hostPresenceData]);

  // Guest admission state: With Host-First Token Gating, guests who receive a token enter directly!
  // Eliminates manual "Admit" waiting room roadblock so guests seamlessly enter upon join.
  const [isAdmitted, setIsAdmitted] = useState(true);
  const isInWaitingRoom = false;

  // Host admission control actions
  const handleAdmitGuest = useCallback((guestIdentity: string) => {
    if (!localParticipant) return;
    const encoder = new TextEncoder();
    const payload = encoder.encode(
      JSON.stringify({
        type: 'ADMIT_GUEST',
        guestIdentity,
        admittedBy: localParticipant.name || 'Host',
        timestamp: Date.now(),
      })
    );
    localParticipant.publishData(payload, { reliable: true } as any).catch(() => {});

    admittedGuestIdsRef.current.add(guestIdentity);
    setWaitingGuests(prev => prev.filter(g => g.identity !== guestIdentity));
    setLatestWaitingGuest(prev => (prev?.identity === guestIdentity ? null : prev));
  }, [localParticipant]);

  const handleAdmitAll = useCallback(() => {
    if (!localParticipant) return;
    const encoder = new TextEncoder();
    const payload = encoder.encode(
      JSON.stringify({
        type: 'ADMIT_GUEST',
        guestIdentity: 'ALL',
        admittedBy: localParticipant.name || 'Host',
        timestamp: Date.now(),
      })
    );
    localParticipant.publishData(payload, { reliable: true } as any).catch(() => {});

    waitingGuests.forEach(g => admittedGuestIdsRef.current.add(g.identity));
    setWaitingGuests([]);
    setLatestWaitingGuest(null);
  }, [localParticipant, waitingGuests]);

  const handleDenyGuest = useCallback((guestIdentity: string) => {
    if (!localParticipant) return;
    const encoder = new TextEncoder();
    const payload = encoder.encode(
      JSON.stringify({
        type: 'DENY_GUEST',
        guestIdentity,
        timestamp: Date.now(),
      })
    );
    localParticipant.publishData(payload, { reliable: true } as any).catch(() => {});

    setWaitingGuests(prev => prev.filter(g => g.identity !== guestIdentity));
    setLatestWaitingGuest(prev => (prev?.identity === guestIdentity ? null : prev));
  }, [localParticipant]);

  const hostIdentityRef = useRef<string | null>(null);
  const isEndingNoticeShownRef = useRef<boolean>(false);
  const isRemovedNoticeShownRef = useRef<boolean>(false);

  useEffect(() => {
    if (isHost && localParticipant) {
      hostIdentityRef.current = localParticipant.identity;
      return;
    }
    if (hostPresenceData.hostIdentity) {
      hostIdentityRef.current = hostPresenceData.hostIdentity;
      return;
    }
    const remoteHost = allParticipants.find(
      p => p.identity !== localParticipant?.identity && checkIsParticipantHost(p)
    );
    if (remoteHost) {
      hostIdentityRef.current = remoteHost.identity;
    }
  }, [isHost, localParticipant, hostPresenceData, allParticipants]);

  const handleMeetingEndedNotice = useCallback((customMsg?: string) => {
    if (isHost || isEndingNoticeShownRef.current) return;
    isEndingNoticeShownRef.current = true;

    const title = t('meeting.hostLeftMeetingEndedTitle') || 'Meeting Ended';
    const message =
      customMsg ||
      t('meeting.hostLeftMeetingEnded') ||
      'The host has left the meeting. The meeting has ended.';

    // Safe auto-exit fallback after 4.5 seconds if alert is unhandled
    const autoExitTimer = setTimeout(() => {
      try {
        room?.disconnect();
      } catch {}
      onLeave();
    }, 4500);

    Alert.alert(
      title,
      message,
      [
        {
          text: t('common.ok') || 'OK',
          onPress: () => {
            clearTimeout(autoExitTimer);
            try {
              room?.disconnect();
            } catch {}
            onLeave();
          },
        },
      ],
      { cancelable: false }
    );
  }, [isHost, room, onLeave, t]);

  const handleRemovedByHostNotice = useCallback((customMsg?: string) => {
    if (isRemovedNoticeShownRef.current) return;
    isRemovedNoticeShownRef.current = true;

    const title = t('meeting.removedFromMeeting') || 'Removed from Meeting';
    const message =
      customMsg ||
      t('meeting.removedByHostNotice') ||
      'You have been removed from the meeting by the host.';

    const autoExitTimer = setTimeout(() => {
      try {
        room?.disconnect();
      } catch {}
      onLeave();
    }, 4500);

    Alert.alert(
      title,
      message,
      [
        {
          text: t('common.ok') || 'OK',
          onPress: () => {
            clearTimeout(autoExitTimer);
            try {
              room?.disconnect();
            } catch {}
            onLeave();
          },
        },
      ],
      { cancelable: false }
    );
  }, [room, onLeave, t]);

  const handleExecuteRemoveParticipant = useCallback(async (p: Participant) => {
    if (!room || !localParticipant || !isHost) return;

    try {
      // 1. Immediate data channel eviction signal to target participant
      const encoder = new TextEncoder();
      const payload = encoder.encode(
        JSON.stringify({
          type: 'REMOVE_PARTICIPANT',
          targetIdentity: p.identity,
          timestamp: Date.now(),
        })
      );
      await localParticipant.publishData(payload, { reliable: true } as any).catch(() => {});

      // 2. Terminate participant on LiveKit SFU via backend API and mark left in DB
      const code = meetingCode || roomName;
      if (code) {
        await removeMeetingParticipant(code, p.identity);
      }
    } catch (err: any) {
      console.warn('[MeetingRoomScreen] Error removing participant:', err);
    }
  }, [room, localParticipant, isHost, meetingCode, roomName]);

  const handlePromptRemoveParticipant = useCallback((p: Participant) => {
    const name = p.name || p.identity || t('meeting.participant') || 'Participant';
    Alert.alert(
      t('meeting.removeParticipantTitle') || 'Remove Participant',
      t('meeting.removeParticipantConfirm', { name }) || `Are you sure you want to remove ${name} from this meeting?`,
      [
        {
          text: t('common.cancel') || 'Cancel',
          style: 'cancel',
        },
        {
          text: t('meeting.remove') || 'Remove',
          style: 'destructive',
          onPress: () => {
            handleExecuteRemoveParticipant(p);
          },
        },
      ]
    );
  }, [t, handleExecuteRemoveParticipant]);

  const handleLeaveOrEndMeeting = useCallback(async () => {
    setIsLeaveModalOpen(false);

    if (isHost) {
      // 1. Broadcast MEETING_ENDED_BY_HOST to all connected participants immediately
      try {
        if (localParticipant && room?.state === ConnectionState.Connected) {
          const encoder = new TextEncoder();
          const payload = encoder.encode(
            JSON.stringify({
              type: 'MEETING_ENDED_BY_HOST',
              message: t('meeting.hostLeftMeetingEnded'),
              hostIdentity: localParticipant.identity,
              timestamp: Date.now(),
            })
          );
          await localParticipant.publishData(payload, { reliable: true } as any);
        }
      } catch (e) {
        console.warn('[MeetingRoomScreen] Error publishing MEETING_ENDED_BY_HOST:', e);
      }

      // 2. Call backend API to end meeting and delete LiveKit SFU room
      try {
        if (meetingCode) {
          await endMeeting(meetingCode, hostSessionTokenRef.current || undefined);
          const cleanCode = meetingCode.replace(/[\s-]/g, '');
          await storage.removeItem(`host_session_${cleanCode}`);
        }
      } catch (e) {
        console.warn('[MeetingRoomScreen] Error ending meeting on server:', e);
      }
    } else {
      // Participant leaves
      try {
        if (meetingCode) {
          await leaveMeeting(meetingCode);
        }
      } catch (e) {
        console.warn('[MeetingRoomScreen] Error notifying leave meeting on server:', e);
      }
    }

    // 3. Disconnect local LiveKit room & trigger onLeave
    try {
      await room?.disconnect();
    } catch (e) {
      console.warn('[MeetingRoomScreen] Error disconnecting room:', e);
    }

    isUserLeavingRef.current = true;
    onLeave();
  }, [isHost, localParticipant, room, meetingCode, onLeave, t]);

  const handleLeaveWaitingRoom = useCallback(async () => {
    if (isHost) {
      await handleLeaveOrEndMeeting();
      return;
    }

    if (localParticipant) {
      const encoder = new TextEncoder();
      const payload = encoder.encode(
        JSON.stringify({
          type: 'GUEST_LEFT_WAITING',
          guestIdentity: localParticipant.identity,
          timestamp: Date.now(),
        })
      );
      localParticipant.publishData(payload, { reliable: true } as any).catch(() => {});
    }

    try {
      if (meetingCode) {
        await leaveMeeting(meetingCode);
      }
    } catch {}

    try {
      await room?.disconnect();
    } catch {}

    isUserLeavingRef.current = true;
    onLeave();
  }, [isHost, handleLeaveOrEndMeeting, localParticipant, meetingCode, room, onLeave]);

  // Broadcast host presence when host connects
  useEffect(() => {
    if (!isHost || !localParticipant || !room) return;

    const broadcastHostPresence = () => {
      if (room.state !== ConnectionState.Connected) return;
      try {
        const encoder = new TextEncoder();
        const payload = encoder.encode(
          JSON.stringify({
            type: 'HOST_PRESENT',
            hostName: localParticipant.name || 'Host',
            hostIdentity: localParticipant.identity,
            timestamp: Date.now(),
          })
        );
        localParticipant.publishData(payload, { reliable: true } as any).catch(() => {});
      } catch (e) {
        // Safe catch
      }
    };

    if (room.state === ConnectionState.Connected) {
      broadcastHostPresence();
    }

    room.on(RoomEvent.Connected, broadcastHostPresence);
    return () => {
      room.off(RoomEvent.Connected, broadcastHostPresence);
    };
  }, [isHost, localParticipant, room]);

  // Guest periodic ping to discover host and request admission (only when connected)
  useEffect(() => {
    if (!isInWaitingRoom || !localParticipant || !room) return;

    const ping = () => {
      if (room.state !== ConnectionState.Connected) return;
      try {
        const encoder = new TextEncoder();
        const payload = encoder.encode(
          JSON.stringify({
            type: 'GUEST_WAITING',
            guestIdentity: localParticipant.identity,
            guestName: localParticipant.name || 'Guest',
            timestamp: Date.now(),
          })
        );
        localParticipant.publishData(payload, { reliable: true } as any).catch(() => {});
      } catch (e) {
        // Safe catch
      }
    };

    if (room.state === ConnectionState.Connected) {
      ping();
    }

    room.on(RoomEvent.Connected, ping);
    const interval = setInterval(ping, 2500);

    return () => {
      room.off(RoomEvent.Connected, ping);
      clearInterval(interval);
    };
  }, [isInWaitingRoom, localParticipant, room]);

  // Media isolation: mute mic to room while in waiting room
  useEffect(() => {
    if (isInWaitingRoom && localParticipant) {
      localParticipant.setMicrophoneEnabled(false).catch(() => {});
    }
  }, [isInWaitingRoom, localParticipant]);

  // Admission detection banner & re-enabling selected media
  const [showAdmittedBanner, setShowAdmittedBanner] = useState(false);
  const wasInWaitingRoomRef = useRef(isInWaitingRoom);

  useEffect(() => {
    if (isGuest) {
      if (wasInWaitingRoomRef.current && !isInWaitingRoom) {
        // Just admitted from waiting room!
        setShowAdmittedBanner(true);
        if (localParticipant) {
          if (!isMicMuted) localParticipant.setMicrophoneEnabled(true).catch(() => {});
          if (!isCameraOff) localParticipant.setCameraEnabled(true).catch(() => {});
        }
        setTimeout(() => setShowAdmittedBanner(false), 4000);
      }
      wasInWaitingRoomRef.current = isInWaitingRoom;
    }
  }, [isInWaitingRoom, isGuest, isMicMuted, isCameraOff, localParticipant]);

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

  // Filter users by username or display name
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

  // Real-time Chat & Host Control Data Channel Logic
  useEffect(() => {
    const onDataReceived = (payload: Uint8Array, participant?: Participant) => {
      const decoder = new TextDecoder();
      const text = decoder.decode(payload);

      try {
        const parsed = JSON.parse(text);
        if (parsed.type === 'MEETING_ENDED_BY_HOST') {
          handleMeetingEndedNotice(parsed.message);
          return;
        }

        if (parsed.type === 'REMOVE_PARTICIPANT') {
          if (parsed.targetIdentity === localParticipant?.identity) {
            handleRemovedByHostNotice();
            return;
          }
        }

        if (parsed.type === 'HOST_PRESENT') {
          setHostPresenceData({ isPresent: true, hostIdentity: parsed.hostIdentity });
          return;
        }

        if (parsed.type === 'GUEST_WAITING' && isHost && localParticipant) {
          const encoder = new TextEncoder();
          const reply = encoder.encode(
            JSON.stringify({
              type: 'HOST_PRESENT',
              hostName: localParticipant.name || 'Host',
              hostIdentity: localParticipant.identity,
              timestamp: Date.now(),
            })
          );
          localParticipant.publishData(reply, { reliable: true } as any).catch(() => {});

          const guestId = parsed.guestIdentity;
          if (guestId) {
            // If already admitted in this session, re-admit immediately
            if (admittedGuestIdsRef.current.has(guestId)) {
              const admitMsg = encoder.encode(
                JSON.stringify({
                  type: 'ADMIT_GUEST',
                  guestIdentity: guestId,
                  admittedBy: localParticipant.name || 'Host',
                  timestamp: Date.now(),
                })
              );
              localParticipant.publishData(admitMsg, { reliable: true } as any).catch(() => {});
              return;
            }

            const guestName = parsed.guestName || 'Guest';
            setWaitingGuests(prev => {
              if (prev.some(g => g.identity === guestId)) return prev;
              return [...prev, { identity: guestId, name: guestName, requestedAt: parsed.timestamp || Date.now() }];
            });

            setLatestWaitingGuest({ identity: guestId, name: guestName, requestedAt: parsed.timestamp || Date.now() });
          }
          return;
        }

        if (parsed.type === 'GUEST_LEFT_WAITING' && isHost) {
          const guestId = parsed.guestIdentity;
          if (guestId) {
            setWaitingGuests(prev => prev.filter(g => g.identity !== guestId));
            setLatestWaitingGuest(prev => (prev?.identity === guestId ? null : prev));
          }
          return;
        }

        if (parsed.type === 'ADMIT_GUEST' && isGuest) {
          if (parsed.guestIdentity === localParticipant?.identity || parsed.guestIdentity === 'ALL') {
            setIsAdmitted(true);
            setShowAdmittedBanner(true);
            if (localParticipant) {
              if (!isMicMuted) localParticipant.setMicrophoneEnabled(true).catch(() => {});
              if (!isCameraOff) localParticipant.setCameraEnabled(true).catch(() => {});
            }
            setTimeout(() => setShowAdmittedBanner(false), 4000);
          }
          return;
        }

        if (parsed.type === 'DENY_GUEST' && isGuest) {
          if (parsed.guestIdentity === localParticipant?.identity) {
            Alert.alert(
              t('meeting.admissionDeclined'),
              t('meeting.admissionDeclinedDesc'),
              [{ text: t('common.ok'), onPress: onLeave }]
            );
          }
          return;
        }

        if (parsed.type === 'MUTE_ALL') {
          // Received Mute All command from Host
          if (localParticipant) {
            localParticipant.setMicrophoneEnabled(false);
            setIsMicMuted(true);
          }
          Alert.alert('Microphone Muted', `The host (${parsed.host || 'Host'}) has muted everyone.`);
          return;
        }

        if (parsed.type === 'CHAT') {
          const clientMsgId = parsed.client_msg_id || parsed.id;
          const resolvedText = parsed.message || parsed.text || '';
          const resolvedType = parsed.file_type || parsed.msgType || parsed.type || 'text';
          const resolvedMediaUrl = sanitizeMediaUrl(parsed.file_url || parsed.mediaUrl);

          const newMessage: ChatMessage = {
            id: clientMsgId || Math.random().toString(36).substr(2, 9),
            clientMsgId: clientMsgId,
            sender: parsed.sender || participant?.name || participant?.identity || 'Unknown',
            text: resolvedText,
            time: parsed.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isSelf: false,
            type: resolvedType,
            fileName: parsed.fileName || parsed.file_name,
            fileSize: parsed.fileSize || parsed.file_size,
            mediaUrl: resolvedMediaUrl,
            duration: parsed.duration,
          };
          setMessages(prev => {
            if (
              prev.some(
                m =>
                  (clientMsgId && (m.clientMsgId === clientMsgId || m.id === clientMsgId)) ||
                  m.id === newMessage.id ||
                  (m.text === newMessage.text && m.sender === newMessage.sender && m.type === newMessage.type && m.time === newMessage.time)
              )
            ) {
              return prev;
            }
            return [...prev, newMessage];
          });
          if (!isChatOpenRef.current) {
            setUnreadChatCount(prev => prev + 1);
          }
          return;
        }
      } catch {
        // Fallback for plain text message
        const newMessage: ChatMessage = {
          id: Math.random().toString(36).substr(2, 9),
          sender: participant?.name || participant?.identity || 'Unknown',
          text,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isSelf: false,
        };
        setMessages(prev => [...prev, newMessage]);
        if (!isChatOpenRef.current) {
          setUnreadChatCount(prev => prev + 1);
        }
      }
    };

    room.on(RoomEvent.DataReceived, onDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, onDataReceived);
    };
  }, [room, localParticipant, handleMeetingEndedNotice, handleRemovedByHostNotice]);

  // Listen for host disconnection or room termination to notify guests and auto-end
  useEffect(() => {
    if (!room) return;

    const handleParticipantDisconnected = (participant: Participant) => {
      console.log('[MeetingRoomScreen] Participant disconnected:', participant.identity);
      // Note: Do NOT immediately kick guests when host temporarily drops (ICE restart or WiFi switch).
      // LiveKit data message 'MEETING_ENDED_BY_HOST' and RoomEvent.Disconnected with ROOM_CLOSED / ROOM_DELETED
      // handle explicit server closure.
    };

    const handleRoomDisconnected = (reason?: any) => {
      if (__DEV__) console.log('[MeetingRoomScreen] Room disconnected with reason:', reason);

      if (isUserLeavingRef.current) {
        return;
      }

      if (isHost) {
        // Host absolute immunity against premature ejection: recovery is handled centrally in MeetingContext
        if (__DEV__) console.log('[MeetingRoomScreen] Host disconnected event; session preservation active');
        return;
      }

      // Only show "Meeting ended by host" if the room was explicitly closed by the host or server
      if (reason === DisconnectReason.ROOM_CLOSED || reason === DisconnectReason.ROOM_DELETED) {
        handleMeetingEndedNotice();
      } else if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
        handleRemovedByHostNotice();
      } else {
        // Network timeout or transient socket drop after retries: Offer retry rather than abruptly terminating
        Alert.alert(
          t('meeting.connectionLostTitle') || 'Connection Lost',
          t('meeting.connectionLostDesc') || 'Connection was lost due to network issues. Would you like to reconnect?',
          [
            {
              text: t('meeting.leave') || 'Leave',
              style: 'cancel',
              onPress: onLeave,
            },
            {
              text: t('common.retry') || 'Reconnect',
              onPress: () => {
                manualReconnect();
              },
            },
          ]
        );
      }
    };

    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    room.on(RoomEvent.Disconnected, handleRoomDisconnected);

    return () => {
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      room.off(RoomEvent.Disconnected, handleRoomDisconnected);
    };
  }, [room, isHost, handleMeetingEndedNotice, handleRemovedByHostNotice, onLeave, t, manualReconnect]);

  // Diagnostic listeners for screen share lifecycle, subscriptions, and stream state
  useEffect(() => {
    if (!room) return;

    const handleSubscriptionFailed = (trackSid: string, participant: RemoteParticipant) => {
      // Clear in-flight marker
      subscribingInFlightTrackSidsRef.current.delete(trackSid);

      const isTransientRecovery = room.state !== ConnectionState.Connected;
      const currentRetries = subscriptionRetryCountRef.current.get(trackSid) || 0;

      if (isTransientRecovery) {
        console.warn('[ScreenShare-Diag:SCREEN_SHARE_SUBSCRIPTION_FAILED_TRANSIENT_RECOVERY]', {
          trackSid,
          participantIdentity: participant?.identity,
          roomState: room.state,
          retryCount: currentRetries,
        });
      } else {
        console.error('[ScreenShare-Diag:SCREEN_SHARE_SUBSCRIPTION_FAILED]', {
          trackSid,
          participantIdentity: participant?.identity,
          roomState: room.state,
          retryCount: currentRetries,
        });
      }

      // If room is connected and bounded retries not exhausted, schedule a clean single retry
      if (room.state === ConnectionState.Connected && currentRetries < MAX_SUBSCRIPTION_RETRIES) {
        subscriptionRetryCountRef.current.set(trackSid, currentRetries + 1);
        subscribedTrackSidsRef.current.delete(trackSid);
        const pub = participant?.getTrackPublicationBySid(trackSid);
        if (pub && typeof (pub as any).setSubscribed === 'function' && !pub.isSubscribed) {
          subscribingInFlightTrackSidsRef.current.add(trackSid);
          (pub as any).setSubscribed(true);
        }
      }
    };

    const handleStreamStateChanged = (
      pub: RemoteTrackPublication,
      streamState: Track.StreamState,
      participant: RemoteParticipant
    ) => {
      if (pub?.source === Track.Source.ScreenShare) {
        console.log('[ScreenShare-Diag:SCREEN_SHARE_STREAM_STATE_CHANGED]', {
          trackSid: pub.trackSid,
          participantIdentity: participant?.identity,
          streamState,
        });
      }
    };

    const handleTrackPublished = (
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      if (publication?.source === Track.Source.ScreenShare) {
        if (__DEV__) {
          console.log('[ScreenShare-Diag:SCREEN_SHARE_PUBLICATION_FOUND]', {
            trackSid: publication.trackSid,
            participantIdentity: participant?.identity,
            isSubscribed: publication.isSubscribed,
            hasTrack: Boolean(publication.track),
          });
        }
      }
    };

    const handleTrackSubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      if (publication?.source === Track.Source.ScreenShare) {
        subscribingInFlightTrackSidsRef.current.delete(publication.trackSid);
        subscribedTrackSidsRef.current.add(publication.trackSid);
        subscriptionRetryCountRef.current.delete(publication.trackSid);
        if (__DEV__) {
          console.log('[ScreenShare-Diag:SCREEN_SHARE_SUBSCRIBED]', {
            trackSid: publication.trackSid,
            participantIdentity: participant?.identity,
            isSubscribed: publication.isSubscribed,
            hasTrack: Boolean(publication.track),
            dimensions: (track as any)?.dimensions,
            kind: track?.kind,
          });
        }
      }
    };

    const handleTrackUnsubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      if (publication?.source === Track.Source.ScreenShare) {
        subscribedTrackSidsRef.current.delete(publication.trackSid);
        subscribingInFlightTrackSidsRef.current.delete(publication.trackSid);
        subscriptionRetryCountRef.current.delete(publication.trackSid);
        if (__DEV__) {
          console.log('[ScreenShare-Diag:SCREEN_SHARE_UNSUBSCRIBED]', {
            trackSid: publication.trackSid,
            participantIdentity: participant?.identity,
          });
        }
      }
    };

    const handleTrackUnpublished = (
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      if (publication?.source === Track.Source.ScreenShare) {
        subscribedTrackSidsRef.current.delete(publication.trackSid);
        subscribingInFlightTrackSidsRef.current.delete(publication.trackSid);
        subscriptionRetryCountRef.current.delete(publication.trackSid);
        if (__DEV__) {
          console.log('[ScreenShare-Diag:SCREEN_SHARE_UNPUBLISHED]', {
            trackSid: publication.trackSid,
            participantIdentity: participant?.identity,
          });
        }
      }
    };

    const resumeDeferredActionIfNeeded = () => {
      if (pendingScreenShareActionRef.current) {
        const action = pendingScreenShareActionRef.current;
        pendingScreenShareActionRef.current = null;
        console.log('[ScreenShare-Diag:SCREEN_SHARE_ACTION_RESUMED_AFTER_SIGNAL_CONNECTED]', {
          timestamp: new Date().toISOString(),
          action,
        });
        executeToggleScreenShareRef.current().catch(err => {
          console.warn('[ScreenShare-Diag] Deferred screen share execution error:', err);
        });
      }
    };

    const handleReconnected = () => {
      console.log('[ScreenShare-Diag:ROOM_RECONNECTED]', {
        timestamp: new Date().toISOString(),
        roomState: room.state,
      });
      // Clear in-flight states on reconnect so publications can re-subscribe cleanly
      subscribingInFlightTrackSidsRef.current.clear();
      subscriptionRetryCountRef.current.clear();

      // For any remote screen share publication that is not yet subscribed, allow auto-subscribe
      room.remoteParticipants.forEach(rp => {
        rp.trackPublications.forEach(pub => {
          if (pub.source === Track.Source.ScreenShare && !pub.isSubscribed) {
            subscribedTrackSidsRef.current.delete(pub.trackSid);
          }
        });
      });

      resumeDeferredActionIfNeeded();
    };

    const handleConnectionStateChanged = (state: ConnectionState) => {
      console.log('[ScreenShare-Diag:CONNECTION_STATE_CHANGED]', {
        timestamp: new Date().toISOString(),
        state,
      });
      if (state === ConnectionState.Connected) {
        subscribingInFlightTrackSidsRef.current.clear();
        resumeDeferredActionIfNeeded();
      }
    };

    room.on(RoomEvent.TrackPublished, handleTrackPublished);
    room.on(RoomEvent.TrackUnpublished, handleTrackUnpublished);
    room.on(RoomEvent.TrackSubscriptionFailed, handleSubscriptionFailed);
    room.on(RoomEvent.TrackStreamStateChanged, handleStreamStateChanged);
    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    room.on(RoomEvent.Reconnected, handleReconnected);
    room.on(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);

    return () => {
      room.off(RoomEvent.TrackPublished, handleTrackPublished);
      room.off(RoomEvent.TrackUnpublished, handleTrackUnpublished);
      room.off(RoomEvent.TrackSubscriptionFailed, handleSubscriptionFailed);
      room.off(RoomEvent.TrackStreamStateChanged, handleStreamStateChanged);
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      room.off(RoomEvent.Reconnected, handleReconnected);
      room.off(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
    };
  }, [room]);

  // --- Screen Share Quality A/B Testing Profiles ---
  // Switch ACTIVE_SCREEN_SHARE_PROFILE between 'test-a' and 'test-b' for comparative testing:
  // Test A (Baseline):  H.264, 2.5 Mbps, 15 FPS, simulcast: false, maintain-resolution
  // Test B (Candidate): H.264, 4.5 Mbps, 20 FPS, simulcast: false, maintain-resolution
  const SCREEN_SHARE_PROFILES = {
    'test-a': {
      name: 'Test A (Baseline: 2.5 Mbps, 15 FPS)',
      videoCodec: 'h264' as const,
      simulcast: false as const,
      screenShareEncoding: {
        maxBitrate: 2_500_000,
        maxFramerate: 15,
      },
      degradationPreference: 'maintain-resolution' as const,
    },
    'test-b': {
      name: 'Test B (Candidate: 4.5 Mbps, 20 FPS)',
      videoCodec: 'h264' as const,
      simulcast: false as const,
      screenShareEncoding: {
        maxBitrate: 4_500_000,
        maxFramerate: 20,
      },
      degradationPreference: 'maintain-resolution' as const,
    },
  };

  const ACTIVE_SCREEN_SHARE_PROFILE: 'test-a' | 'test-b' = 'test-b';

  const ENABLE_SCREEN_SHARE_DIAGNOSTICS = __DEV__;

  // Tracing outbound WebRTC screen-share stats on broadcaster
  useEffect(() => {
    if (!ENABLE_SCREEN_SHARE_DIAGNOSTICS || !isScreenSharing || !localParticipant) return;
    const shareStartTime = Date.now();
    let prevTime = shareStartTime;
    let prevFramesCaptured: number | null = null;
    let prevFramesEncoded: number | null = null;
    let prevBytesSent: number | null = null;

    const interval = setInterval(async () => {
      try {
        const pub = localParticipant.getTrackPublication(Track.Source.ScreenShare);
        const track = pub?.track;
        if (track) {
          const now = Date.now();
          const elapsedSec = Math.round((now - shareStartTime) / 1000);
          const deltaSec = Math.max(0.1, (now - prevTime) / 1000);

          let framesCaptured: number | string = 'unavailable';
          let captureFps: number | string = 'unavailable';
          let framesEncoded = 0;
          let encodeFps: number | string = 'unavailable';
          let bytesSent = 0;
          let bitrateKbps: number | string = 'unavailable';
          let packetsSent = 0;
          let resolution = `${(track as any)?.dimensions?.width ?? '?'}x${(track as any)?.dimensions?.height ?? '?'}`;
          let encoderImplementation = 'unavailable';
          let qualityLimitationReason = 'none';
          let rttMs: number | string = 'unavailable';

          if (typeof (track as any).getRTCStatsReport === 'function') {
            const report = await (track as any).getRTCStatsReport();
            if (report && typeof report.forEach === 'function') {
              report.forEach((stat: any) => {
                if (stat?.type === 'media-source' && (stat?.kind === 'video' || stat?.mediaType === 'video')) {
                  if (typeof stat.frames === 'number') {
                    framesCaptured = stat.frames;
                    if (typeof stat.framesPerSecond === 'number') {
                      captureFps = Math.round(stat.framesPerSecond * 10) / 10;
                    } else if (prevFramesCaptured !== null) {
                      captureFps = Math.round(((stat.frames - prevFramesCaptured) / deltaSec) * 10) / 10;
                    }
                    prevFramesCaptured = stat.frames;
                  }
                  if (stat.width && stat.height) {
                    resolution = `${stat.width}x${stat.height}`;
                  }
                } else if (stat?.type === 'outbound-rtp' && (stat?.kind === 'video' || stat?.mediaType === 'video')) {
                  framesEncoded = stat.framesEncoded ?? stat.framesSent ?? 0;
                  if (typeof stat.framesPerSecond === 'number') {
                    encodeFps = Math.round(stat.framesPerSecond * 10) / 10;
                  } else if (prevFramesEncoded !== null) {
                    encodeFps = Math.round(((framesEncoded - prevFramesEncoded) / deltaSec) * 10) / 10;
                  }
                  prevFramesEncoded = framesEncoded;

                  bytesSent = stat.bytesSent ?? 0;
                  if (prevBytesSent !== null) {
                    bitrateKbps = Math.round(((bytesSent - prevBytesSent) * 8) / (deltaSec * 1000));
                  }
                  prevBytesSent = bytesSent;

                  packetsSent = stat.packetsSent ?? 0;
                  if (stat.frameWidth && stat.frameHeight) {
                    resolution = `${stat.frameWidth}x${stat.frameHeight}`;
                  }
                  if (stat.encoderImplementation) {
                    encoderImplementation = stat.encoderImplementation;
                  }
                  if (stat.qualityLimitationReason) {
                    qualityLimitationReason = stat.qualityLimitationReason;
                  }
                } else if (stat?.type === 'remote-inbound-rtp' && (stat?.kind === 'video' || stat?.mediaType === 'video')) {
                  if (typeof stat.roundTripTime === 'number') {
                    rttMs = Math.round(stat.roundTripTime * 1000);
                  }
                } else if (stat?.type === 'candidate-pair' && (stat.state === 'succeeded' || stat.nominated)) {
                  if (typeof stat.currentRoundTripTime === 'number' && rttMs === 'unavailable') {
                    rttMs = Math.round(stat.currentRoundTripTime * 1000);
                  }
                }
              });
            }
          } else if (typeof (track as any).getSenderStats === 'function') {
            const senderStats = await (track as any).getSenderStats();
            if (Array.isArray(senderStats) && senderStats.length > 0) {
              const stat = senderStats[0];
              framesEncoded = stat.framesSent ?? 0;
              if (prevFramesEncoded !== null) {
                encodeFps = Math.round(((framesEncoded - prevFramesEncoded) / deltaSec) * 10) / 10;
              }
              prevFramesEncoded = framesEncoded;

              bytesSent = stat.bytesSent ?? 0;
              if (prevBytesSent !== null) {
                bitrateKbps = Math.round(((bytesSent - prevBytesSent) * 8) / (deltaSec * 1000));
              }
              prevBytesSent = bytesSent;

              packetsSent = stat.packetsSent ?? 0;
              if (stat.frameWidth && stat.frameHeight) {
                resolution = `${stat.frameWidth}x${stat.frameHeight}`;
              }
            }
          }

          prevTime = now;

          console.log('[ScreenShare-Diag:SCREEN_SHARE_OUTBOUND_METRICS]', {
            profile: ACTIVE_SCREEN_SHARE_PROFILE,
            elapsedSec,
            trackSid: pub?.trackSid,
            resolution,
            framesCaptured,
            captureFps,
            framesEncoded,
            encodeFps,
            bytesSent,
            bitrateKbps,
            packetsSent,
            rttMs,
            encoder: encoderImplementation,
            qualityLimitationReason,
          });
        }
      } catch (err) {
        // Safe ignore
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isScreenSharing, localParticipant, windowWidth, windowHeight]);

  // Tracing inbound WebRTC screen-share stats on receiver (strictly isolated to screen-share track)
  useEffect(() => {
    if (!ENABLE_SCREEN_SHARE_DIAGNOSTICS || !activeRemoteScreenShare) return;
    const trackRef = activeRemoteScreenShare;
    const receiverStartTime = Date.now();
    let prevTime = receiverStartTime;
    let prevFramesDecoded: number | null = null;
    let prevBytesReceived: number | null = null;
    let firstFrameLogged = false;

    const interval = setInterval(async () => {
      try {
        const track = trackRef.publication?.track;
        if (track) {
          const now = Date.now();
          const elapsedSec = Math.round((now - receiverStartTime) / 1000);
          const deltaSec = Math.max(0.1, (now - prevTime) / 1000);

          let framesReceived = 0;
          let framesDecoded = 0;
          let decodeFps: number | string = 'unavailable';
          let bytesReceived = 0;
          let bitrateKbps: number | string = 'unavailable';
          let packetsLost = 0;
          let freezeCount: number | string = 'unavailable';
          let totalFreezeDuration: number | string = 'unavailable';
          let resolution = `${(track as any)?.dimensions?.width ?? '?'}x${(track as any)?.dimensions?.height ?? '?'}`;
          let decoderImplementation = 'unavailable';
          let jitter: number | string = 'unavailable';
          let rttMs: number | string = 'unavailable';

          if (typeof (track as any).getRTCStatsReport === 'function') {
            const report = await (track as any).getRTCStatsReport();
            if (report && typeof report.forEach === 'function') {
              report.forEach((stat: any) => {
                if (stat?.type === 'inbound-rtp' && (stat?.kind === 'video' || stat?.mediaType === 'video')) {
                  framesReceived = stat.framesReceived ?? 0;
                  framesDecoded = stat.framesDecoded ?? 0;
                  if (!firstFrameLogged && (framesDecoded > 0 || framesReceived > 0)) {
                    firstFrameLogged = true;
                    if (__DEV__) {
                      console.log('[ScreenShare-Diag:SCREEN_SHARE_FIRST_FRAME]', {
                        trackSid: trackRef.publication?.trackSid,
                        framesDecoded,
                        framesReceived,
                        resolution,
                        elapsedSec,
                      });
                    }
                  }
                  if (typeof stat.framesPerSecond === 'number') {
                    decodeFps = Math.round(stat.framesPerSecond * 10) / 10;
                  } else if (prevFramesDecoded !== null) {
                    decodeFps = Math.round(((framesDecoded - prevFramesDecoded) / deltaSec) * 10) / 10;
                  }
                  prevFramesDecoded = framesDecoded;

                  bytesReceived = stat.bytesReceived ?? 0;
                  if (prevBytesReceived !== null) {
                    bitrateKbps = Math.round(((bytesReceived - prevBytesReceived) * 8) / (deltaSec * 1000));
                  }
                  prevBytesReceived = bytesReceived;

                  packetsLost = stat.packetsLost ?? 0;
                  if (stat.frameWidth && stat.frameHeight) {
                    resolution = `${stat.frameWidth}x${stat.frameHeight}`;
                  }
                  if (stat.decoderImplementation) {
                    decoderImplementation = stat.decoderImplementation;
                  }
                  if (typeof stat.freezeCount === 'number') {
                    freezeCount = stat.freezeCount;
                  }
                  const freezeDur = stat.totalFreezesDuration ?? stat.totalFreezeDuration;
                  if (typeof freezeDur === 'number') {
                    totalFreezeDuration = Math.round(freezeDur * 1000) / 1000;
                  }
                  if (typeof stat.jitter === 'number') {
                    jitter = Math.round(stat.jitter * 1000 * 10) / 10;
                  }
                } else if (stat?.type === 'candidate-pair' && (stat.state === 'succeeded' || stat.nominated)) {
                  if (typeof stat.currentRoundTripTime === 'number') {
                    rttMs = Math.round(stat.currentRoundTripTime * 1000);
                  }
                }
              });
            }
          } else if (typeof (track as any).getReceiverStats === 'function') {
            const receiverStats = await (track as any).getReceiverStats();
            if (receiverStats) {
              framesReceived = receiverStats.framesReceived ?? 0;
              framesDecoded = receiverStats.framesDecoded ?? 0;
              if (prevFramesDecoded !== null) {
                decodeFps = Math.round(((framesDecoded - prevFramesDecoded) / deltaSec) * 10) / 10;
              }
              prevFramesDecoded = framesDecoded;

              bytesReceived = receiverStats.bytesReceived ?? 0;
              if (prevBytesReceived !== null) {
                bitrateKbps = Math.round(((bytesReceived - prevBytesReceived) * 8) / (deltaSec * 1000));
              }
              prevBytesReceived = bytesReceived;

              packetsLost = receiverStats.packetsLost ?? 0;
              if (receiverStats.frameWidth && receiverStats.frameHeight) {
                resolution = `${receiverStats.frameWidth}x${receiverStats.frameHeight}`;
              }
              if (receiverStats.decoderImplementation) {
                decoderImplementation = receiverStats.decoderImplementation;
              }
              if (typeof (receiverStats as any).jitter === 'number') {
                jitter = Math.round((receiverStats as any).jitter * 1000 * 10) / 10;
              }
            }
          }

          prevTime = now;

          if (framesDecoded > 0 && !firstFrameLogged) {
            firstFrameLogged = true;
            console.log('[ScreenShare-Diag:SCREEN_SHARE_FIRST_FRAME_RENDERED]', {
              elapsedSec,
              trackSid: trackRef.publication?.trackSid,
              resolution,
              framesDecoded,
            });
          }

          console.log('[ScreenShare-Diag:SCREEN_SHARE_INBOUND_METRICS]', {
            elapsedSec,
            trackSid: trackRef.publication?.trackSid,
            resolution,
            framesReceived,
            framesDecoded,
            decodeFps,
            bytesReceived,
            bitrateKbps,
            packetsLost,
            freezeCount,
            totalFreezeDuration,
            rttMs,
            decoder: decoderImplementation,
            jitter,
          });
        }
      } catch (err) {
        // Safe ignore
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeRemoteScreenShare]);

  const sendChatMessage = useCallback(async () => {
    const textToSend = chatInput.trim();
    if (!textToSend) return;

    const activeParticipant = localParticipant || room.localParticipant;
    if (!activeParticipant) {
      Alert.alert('Chat', 'Connecting to room... Please try again.');
      return;
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgId = 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
    const senderName = activeParticipant.name || currentUserName || (isHost ? 'Host' : 'Participant');

    const payload = JSON.stringify({
      type: 'CHAT',
      id: msgId,
      client_msg_id: msgId,
      sender: senderName,
      text: textToSend,
      message: textToSend,
      time: timeStr,
      msgType: 'text',
    });

    // 1. Optimistically display immediately in sender's chat
    const newMessage: ChatMessage = {
      id: msgId,
      clientMsgId: msgId,
      sender: senderName,
      text: textToSend,
      time: timeStr,
      isSelf: true,
      type: 'text',
    };

    setMessages(prev => [...prev, newMessage]);
    setChatInput('');

    // 2. Broadcast to room via data channel
    if (room.state !== ConnectionState.Connected) {
      console.warn('[Chat] Room is not yet connected (state:', room.state, '), message saved locally');
    } else {
      const encoder = new TextEncoder();
      const data = encoder.encode(payload);

      try {
        await activeParticipant.publishData(data, { reliable: true } as any);
      } catch (e) {
        console.warn('[Chat] Failed to publishData (reliable), resetting promise and trying lossy channel:', e);
        try {
          if ((room as any)?.engine) {
            (room as any).engine.publisherConnectionPromise = undefined;
          }
          await activeParticipant.publishData(data, { reliable: false } as any);
        } catch (e2) {
          if ((room as any)?.engine) {
            (room as any).engine.publisherConnectionPromise = undefined;
          }
          console.warn('[Chat] Notice: message broadcast deferred (channel negotiating):', e2);
        }
      }
    }

    // 3. Simultaneously post to server for permanent storage so rejoiners and new joiners view history
    const code = meetingCode || roomName;
    if (code) {
      sendMeetingMessage(code, {
        type: 'text',
        file_type: 'text',
        text: textToSend,
        message: textToSend,
        sender_name: senderName,
        client_msg_id: msgId,
      }).catch(err => {
        console.warn('[Chat] Failed to persist chat message to server:', err);
      });
    }
  }, [chatInput, localParticipant, room, isHost, currentUserName, meetingCode, roomName]);

  const handlePickAndSendAttachment = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];
      const fileSize = file.size || 0;
      const validation = validateFileSize(fileSize);

      if (!validation.isValid) {
        Alert.alert(
          t('meeting.fileTooLargeTitle'),
          `${t('meeting.fileTooLargeDesc')}\n\n(${validation.sizeFormatted} > 5 MB)`
        );
        return;
      }

      const activeParticipant = localParticipant || room.localParticipant;
      if (!activeParticipant) {
        Alert.alert('Chat', 'Connecting to room... Please wait.');
        return;
      }

      const fileName = file.name || 'Attachment';
      const mime = (file.mimeType || '').toLowerCase();
      const ext = fileName.split('.').pop()?.toLowerCase() || '';

      let category: 'image' | 'video' | 'audio' | 'document' = 'document';
      if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
        category = 'image';
      } else if (mime.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp'].includes(ext)) {
        category = 'video';
      } else if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext)) {
        category = 'audio';
      }

      const title = fileName;
      const resolvedSize = validation.sizeFormatted || '1.5 MB';
      const defaultDuration = category === 'audio' ? '0:35' : category === 'video' ? '01:20' : undefined;
      const senderName = activeParticipant.name || currentUserName || (isHost ? 'Host' : 'Participant');
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const msgId = 'att_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);

      let finalMediaUrl: string | undefined = file.uri;

      // Upload file to Hong Kong server
      try {
        setIsUploadingAttachment(true);
        setUploadProgress(15);
        const uploadRes = await uploadMeetingFile(
          meetingCode || roomName,
          {
            uri: file.uri,
            name: file.name || 'file',
            type: file.mimeType || '*/*',
          },
          category,
          (progress) => setUploadProgress(progress)
        );

        if (uploadRes.success && uploadRes.data?.file_url) {
          finalMediaUrl = sanitizeMediaUrl(uploadRes.data.file_url);
        }
      } catch (uploadErr) {
        console.warn('[MeetingRoomScreen] File upload warning:', uploadErr);
      } finally {
        setIsUploadingAttachment(false);
        setUploadProgress(0);
      }

      // 1. Optimistically display in local chat
      setMessages(prev => [
        ...prev,
        {
          id: msgId,
          clientMsgId: msgId,
          sender: senderName,
          text: title,
          time: timeStr,
          isSelf: true,
          type: category,
          fileName: title,
          fileSize: resolvedSize,
          mediaUrl: sanitizeMediaUrl(finalMediaUrl),
          duration: defaultDuration,
        },
      ]);

      // 2. Broadcast via data channel to all participants
      if (room.state !== ConnectionState.Connected) {
        console.warn('[MeetingRoomScreen] Room not connected for attachment broadcast, state:', room.state);
      } else {
        const payload = JSON.stringify({
          type: 'CHAT',
          id: msgId,
          client_msg_id: msgId,
          sender: senderName,
          text: title,
          message: title,
          msgType: category,
          file_type: category,
          fileName: title,
          file_name: title,
          fileSize: resolvedSize,
          file_size: resolvedSize,
          mediaUrl: sanitizeMediaUrl(finalMediaUrl),
          file_url: sanitizeMediaUrl(finalMediaUrl),
          duration: defaultDuration,
          time: timeStr,
        });

        const encoder = new TextEncoder();
        const data = encoder.encode(payload);

        try {
          await activeParticipant.publishData(data, { reliable: true } as any);
        } catch (e) {
          console.warn('[MeetingRoomScreen] Error sending attachment reliable, trying lossy:', e);
          try {
            if ((room as any)?.engine) {
              (room as any).engine.publisherConnectionPromise = undefined;
            }
            await activeParticipant.publishData(data, { reliable: false } as any);
          } catch (e2) {
            if ((room as any)?.engine) {
              (room as any).engine.publisherConnectionPromise = undefined;
            }
            console.warn('[MeetingRoomScreen] Warning broadcasting attachment:', e2);
          }
        }
      }

      // 3. Persist file attachment record to server so future joiners can view & download
      const code = meetingCode || roomName;
      if (code) {
        sendMeetingMessage(code, {
          type: category,
          file_type: category,
          text: title,
          message: title,
          file_name: title,
          file_size: resolvedSize,
          media_url: finalMediaUrl,
          file_url: finalMediaUrl,
          duration: defaultDuration,
          sender_name: senderName,
          client_msg_id: msgId,
        }).catch(err => {
          console.warn('[MeetingRoomScreen] Failed to persist file message to server:', err);
        });
      }
    } catch (err) {
      console.warn('[MeetingRoomScreen] Error picking/sending attachment:', err);
    }
  }, [localParticipant, room, isHost, currentUserName, meetingCode, roomName, t]);

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayCode = useMemo(() => {
    return formatMeetingCode(meetingCode || roomName);
  }, [meetingCode, roomName]);

  const displayTitle = useMemo(() => {
    if (meetingTitle && !meetingTitle.toLowerCase().startsWith('cloudnews-')) {
      return meetingTitle;
    }
    return displayCode;
  }, [meetingTitle, displayCode]);

  const meetingLink = useMemo(() => {
    return getMeetingInviteLink(displayCode);
  }, [displayCode]);

  useEffect(() => {
    const timer = setInterval(() => setCallDuration(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleToggleMic = async () => {
    if (!localParticipant) {
      console.warn('[MeetingRoom] localParticipant is null, cannot toggle mic');
      return;
    }
    // If currently muted (isMicMuted is true), we want to unmute (nextEnabled = true)
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
    if (!localParticipant) {
      console.warn('[MeetingRoom] localParticipant is null, cannot toggle camera');
      return;
    }
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

  /**
   * Strictly tears down any existing local screen-share publication and track.
   * Awaits LiveKit unpublish completion and stops underlying MediaStreamTrack
   * before any new publish operation may proceed.
   */
  const teardownExistingScreenShare = async (source: string = 'teardown'): Promise<void> => {
    if (!localParticipant) return;

    // Collect all publications associated with ScreenShare
    const screenPub = localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const lingeringPubs = Array.from(localParticipant.trackPublications.values()).filter(
      p => p.source === Track.Source.ScreenShare
    );

    const targetPubs: LocalTrackPublication[] = [];
    if (screenPub) {
      targetPubs.push(screenPub);
    }
    for (const p of lingeringPubs) {
      if (!targetPubs.some(tp => tp.trackSid === p.trackSid)) {
        targetPubs.push(p);
      }
    }

    if (targetPubs.length === 0 && !localParticipant.isScreenShareEnabled) {
      return;
    }

    if (__DEV__) {
      console.log('[ScreenShare-Diag:SCREEN_SHARE_UNPUBLISH_START]', {
        timestamp: new Date().toISOString(),
        source,
        count: targetPubs.length,
        trackSids: targetPubs.map(p => p.trackSid),
      });
    }

    // 1. Unpublish each identified publication and await completion
    for (const pub of targetPubs) {
      const track = pub.track;
      const trackSid = pub.trackSid;

      if (track) {
        try {
          await localParticipant.unpublishTrack(track, true);
        } catch (unpubErr) {
          if (__DEV__) {
            console.warn('[ScreenShare-Diag:SCREEN_SHARE_UNPUBLISH_ERROR]', {
              timestamp: new Date().toISOString(),
              trackSid,
              error: unpubErr,
              source,
            });
          }
        }
      }

      // Explicitly stop track to release underlying MediaStream
      if (track) {
        try {
          track.stop();
          if (__DEV__) {
            console.log('[ScreenShare-Diag:SCREEN_SHARE_TRACK_STOP]', {
              timestamp: new Date().toISOString(),
              trackSid,
              source,
            });
          }
        } catch (stopErr) {
          // ignore
        }
      }

      if (__DEV__) {
        console.log('[ScreenShare-Diag:SCREEN_SHARE_UNPUBLISH_COMPLETE]', {
          timestamp: new Date().toISOString(),
          trackSid,
          source,
        });
      }
    }

    // 2. Also ensure setScreenShareEnabled(false) has completed in LiveKit's internal state
    try {
      await localParticipant.setScreenShareEnabled(false);
    } catch {
      // ignore
    }
  };

  const handleToggleScreenShare = async () => {
    if (
      isScreenShareActionInFlight.current ||
      screenShareLifecycleRef.current !== 'idle' ||
      !room ||
      !localParticipant
    ) {
      if (__DEV__) {
        console.log('[ScreenShare-Diag:SCREEN_SHARE_TRANSITION_IGNORED]', {
          timestamp: new Date().toISOString(),
          state: screenShareLifecycleRef.current,
          actionInFlight: isScreenShareActionInFlight.current,
          reason: 'Screen share action or transition already in flight',
          source: 'handleToggleScreenShare',
        });
      }
      return;
    }

    // Guard against triggering screen-share media transitions or offer negotiation
    // while LiveKit signaling is reconnecting or recovering.
    if (room.state !== ConnectionState.Connected) {
      const currentlyEnabled = Boolean(localParticipant.isScreenShareEnabled);
      const targetAction = currentlyEnabled ? 'stop' : 'start';
      pendingScreenShareActionRef.current = targetAction;

      console.warn('[ScreenShare-Diag:SCREEN_SHARE_ACTION_DEFERRED_SIGNAL_RECONNECTING]', {
        timestamp: new Date().toISOString(),
        roomState: room.state,
        targetAction,
      });

      Alert.alert(
        t('meeting.reconnecting') || 'Reconnecting...',
        t('meeting.reconnectingScreenShareNotice') ||
          'Connection is currently recovering. Screen share action has been queued and will resume once reconnected.'
      );
      return;
    }

    // Screen sharing is unavailable when alone in the meeting
    const currentlyEnabled = Boolean(localParticipant.isScreenShareEnabled);
    if (allParticipants.length <= 1 && !currentlyEnabled) {
      Alert.alert(
        t('meeting.screenShareUnavailableTitle'),
        t('meeting.screenShareUnavailableDesc')
      );
      return;
    }

    isScreenShareActionInFlight.current = true;
    isTogglingScreenShareRef.current = true;
    setIsShareButtonBusy(true);

    const targetState = !currentlyEnabled;
    try {
      if (targetState) {
        screenShareLifecycleRef.current = 'publishing';

        if (__DEV__) {
          console.log('[ScreenShare-Diag:SCREEN_SHARE_TRANSITION_START]', {
            timestamp: new Date().toISOString(),
            transition: 'publishing',
            targetState: true,
            source: 'handleToggleScreenShare',
          });
        }

        // Guarantee local teardown before a new publish
        await teardownExistingScreenShare('pre-publish-teardown');

        // 1. Immediately disable Android OS PiP auto-enter before calling LiveKit so Android 14/15 system dialog does not trigger PiP
        isStartingScreenShareRef.current = true;
        prepareScreenShare(true);

        // Record current microphone state before screen share starts
        const micShouldBeActive = !isMicMuted;

        // 2. On iOS: Trigger native ReplayKit broadcast picker sheet
        if (
          Platform.OS === 'ios' &&
          screenCapturePickerRef.current &&
          NativeModules.ScreenCapturePickerViewManager?.show
        ) {
          try {
            const reactTag = findNodeHandle(screenCapturePickerRef.current);
            if (reactTag) {
              NativeModules.ScreenCapturePickerViewManager.show(reactTag);
            }
          } catch (pickerErr) {
            console.warn('[ScreenShare] Launching iOS ScreenCapturePicker failed:', pickerErr);
          }
        }

        let pub: LocalTrackPublication | undefined;
        try {
          const profile = SCREEN_SHARE_PROFILES[ACTIVE_SCREEN_SHARE_PROFILE];
          const publishOptions: TrackPublishOptions = {
            videoCodec: profile.videoCodec,
            simulcast: profile.simulcast,
            screenShareEncoding: profile.screenShareEncoding,
            degradationPreference: profile.degradationPreference,
          };
          if (__DEV__) {
            console.log('[ScreenShare-Diag:SCREEN_SHARE_PUBLISH_START]', {
              timestamp: new Date().toISOString(),
              profile: ACTIVE_SCREEN_SHARE_PROFILE,
              profileName: profile.name,
              localParticipantIdentity: localParticipant.identity,
              source: Track.Source.ScreenShare,
              requestedCodec: publishOptions.videoCodec,
              screenShareEncoding: publishOptions.screenShareEncoding,
              degradationPreference: publishOptions.degradationPreference,
            });
          }
          const captureOptions: ScreenShareCaptureOptions = {
            audio: false,
            resolution: {
              width: 1920,
              height: 1080,
              frameRate: profile.screenShareEncoding.maxFramerate || 20,
            },
          };
          pub = await room.localParticipant.setScreenShareEnabled(
            true,
            captureOptions,
            publishOptions
          );
          if (__DEV__) {
            console.log('[ScreenShare-Diag:SCREEN_SHARE_PERMISSION_GRANTED]', {
              timestamp: new Date().toISOString(),
            });
            const localTrack = pub?.track;
            if (localTrack?.mediaStreamTrack) {
              try {
                (localTrack.mediaStreamTrack as any).contentHint = 'detail';
              } catch (hintErr) {
                // ignore
              }
            }
            console.log('[ScreenShare-Diag:SCREEN_SHARE_TRACK_CREATED]', {
              timestamp: new Date().toISOString(),
              trackSid: pub?.trackSid,
              trackDimensions: (localTrack as any)?.dimensions,
              readyState: (localTrack as any)?.mediaStreamTrack?.readyState,
              enabled: (localTrack as any)?.mediaStreamTrack?.enabled,
              source: pub?.source,
              codecConfiguration: publishOptions.videoCodec,
            });
            console.log('[ScreenShare-Diag:SCREEN_SHARE_PUBLISHED]', {
              timestamp: new Date().toISOString(),
              trackSid: pub?.trackSid,
              isPublished: Boolean(pub),
              isSubscribed: (pub as any)?.isSubscribed,
              trackExists: pub?.track !== null,
              mimeType: (pub as any)?.mimeType,
              dimensions: (pub as any)?.dimensions,
            });
          }
        } catch (shareErr: any) {
          if (__DEV__) {
            console.error('[ScreenShare-Diag:SCREEN_SHARE_PUBLISH_FAILED]', shareErr);
          }
          const errMsg = (shareErr?.message || shareErr?.name || String(shareErr) || '').toLowerCase();

          // Silently handle user cancellation on both iOS (ReplayKit cancel) and Android (MediaProjection cancel)
          const isCancelled =
            errMsg.includes('cancel') ||
            errMsg.includes('reject') ||
            errMsg.includes('abort') ||
            errMsg.includes('notallowed') ||
            errMsg.includes('result_canceled') ||
            errMsg.includes('broadcast') ||
            errMsg.includes('user cancelled') ||
            errMsg.includes('user denied');

          const isSignalingRecoveryError =
            errMsg.includes('cannot send signal') ||
            errMsg.includes('before connected') ||
            errMsg.includes('negotiation timed out') ||
            (room && room.state !== ConnectionState.Connected);

          if (isSignalingRecoveryError) {
            console.warn('[ScreenShare-Diag:SCREEN_SHARE_ACTION_DEFERRED_SIGNAL_RECONNECTING]', {
              timestamp: new Date().toISOString(),
              roomState: room?.state,
              error: errMsg,
            });
            pendingScreenShareActionRef.current = 'start';
          }

          isStartingScreenShareRef.current = false;
          prepareScreenShare(false);
          setPipConfig(true, false);
          setIsScreenSharing(false);
          releaseScreenShareWakeLock();

          // Clean up any partially created track
          await teardownExistingScreenShare('publish-error-cleanup').catch(() => {});

          if (__DEV__) {
            console.log('[ScreenShare-Diag:SCREEN_SHARE_TRANSITION_COMPLETE]', {
              timestamp: new Date().toISOString(),
              transition: 'publishing',
              success: false,
              cancelled: isCancelled,
              recoveryDeferred: isSignalingRecoveryError,
              error: errMsg,
            });
          }

          if (!isCancelled && !isSignalingRecoveryError) {
            const platformName = Platform.OS === 'ios' ? 'iOS / iPhone' : 'Android';
            Alert.alert(
              'Screen Share Notice',
              `Could not share screen. Please allow screen recording/casting when prompted by ${platformName}.`
            );
          }
          return;
        }

        isStartingScreenShareRef.current = false;
        setIsScreenSharing(true);
        setPipConfig(true, true);

        // Stabilization delay to allow MediaProjection track and hardware encoder to produce initial keyframe smoothly
        await new Promise(resolve => setTimeout(resolve, 450));

        // Guarantee that local microphone track is NOT disposed or unpublished, and coexists with screen share
        if (micShouldBeActive && !isMicMutedRef.current && !localParticipant.isMicrophoneEnabled) {
          console.log('[ScreenShare] Preserving active microphone track coexisting with screen share');
          try {
            await localParticipant.setMicrophoneEnabled(true);
          } catch (micErr) {
            console.warn('[ScreenShare] Re-enabling microphone failed:', micErr);
          }
        }

        if (__DEV__) {
          console.log('[ScreenShare-Diag:SCREEN_SHARE_TRANSITION_COMPLETE]', {
            timestamp: new Date().toISOString(),
            transition: 'publishing',
            success: true,
            trackSid: pub?.trackSid,
          });
        }
      } else {
        screenShareLifecycleRef.current = 'unpublishing';

        if (__DEV__) {
          console.log('[ScreenShare-Diag:SCREEN_SHARE_TRANSITION_START]', {
            timestamp: new Date().toISOString(),
            transition: 'unpublishing',
            targetState: false,
            source: 'handleToggleScreenShare',
          });
        }

        isStartingScreenShareRef.current = false;
        prepareScreenShare(false);
        try {
          await teardownExistingScreenShare('user-stop');
        } finally {
          setIsScreenSharing(false);
          setPipConfig(true, false);
          releaseScreenShareWakeLock();
        }

        // Small delay before verifying microphone track state after stopping screen share
        await new Promise(resolve => setTimeout(resolve, 200));

        if (!isMicMutedRef.current && !localParticipant.isMicrophoneEnabled) {
          try {
            await localParticipant.setMicrophoneEnabled(true);
          } catch (micErr) {
            console.warn('[ScreenShare] Re-enabling microphone after stop failed:', micErr);
          }
        }

        if (__DEV__) {
          console.log('[ScreenShare-Diag:SCREEN_SHARE_TRANSITION_COMPLETE]', {
            timestamp: new Date().toISOString(),
            transition: 'unpublishing',
            success: true,
          });
        }
      }
    } catch (error: any) {
      console.warn('[ScreenShare] Toggle operation failed:', error);
      isStartingScreenShareRef.current = false;
      prepareScreenShare(false);
      setPipConfig(true, false);
      setIsScreenSharing(false);
      releaseScreenShareWakeLock();

      const msg = (error?.message || error?.name || String(error) || '').toLowerCase();
      const isSignalingRecovery =
        msg.includes('cannot send signal') ||
        msg.includes('before connected') ||
        msg.includes('negotiation timed out') ||
        (room && room.state !== ConnectionState.Connected);

      if (isSignalingRecovery) {
        console.warn('[ScreenShare-Diag:SCREEN_SHARE_ACTION_DEFERRED_SIGNAL_RECONNECTING]', {
          timestamp: new Date().toISOString(),
          roomState: room?.state,
          error: msg,
        });
        pendingScreenShareActionRef.current = targetState ? 'start' : 'stop';
        return;
      }

      // Gracefully handle user cancelling the OS media projection prompt without loop
      if (
        msg.includes('cancel') ||
        msg.includes('reject') ||
        msg.includes('abort') ||
        msg.includes('notallowed') ||
        msg.includes('result_canceled') ||
        msg.includes('broadcast was cancelled') ||
        msg.includes('user cancelled')
      ) {
        return;
      }
      const platformName = Platform.OS === 'ios' ? 'iOS / iPhone' : 'Android';
      Alert.alert(
        'Screen Share Notice',
        `Could not share screen. Please allow screen recording/casting when prompted by ${platformName}.`
      );
    } finally {
      screenShareLifecycleRef.current = 'idle';
      isStartingScreenShareRef.current = false;
      isScreenShareActionInFlight.current = false;
      isTogglingScreenShareRef.current = false;
      setIsShareButtonBusy(false);
    }
  };

  executeToggleScreenShareRef.current = handleToggleScreenShare;

  // Automatically stop screen sharing if all other participants leave the meeting
  useEffect(() => {
    if (
      isScreenSharing &&
      screenShareLifecycleRef.current === 'idle' &&
      !isScreenShareActionInFlight.current &&
      !isStartingScreenShareRef.current &&
      hadRemoteParticipantsRef.current &&
      remoteParticipants.length === 0 &&
      localParticipant
    ) {
      if (__DEV__) {
        console.log('[ScreenShare-Diag:SCREEN_SHARE_TRANSITION_START]', {
          timestamp: new Date().toISOString(),
          transition: 'unpublishing',
          targetState: false,
          source: 'auto-stop:remoteParticipants=0',
        });
      }

      screenShareLifecycleRef.current = 'unpublishing';
      isScreenShareActionInFlight.current = true;
      setIsShareButtonBusy(true);
      prepareScreenShare(false);
      setPipConfig(true, false);

      teardownExistingScreenShare('auto-stop')
        .catch(err => {
          console.warn('[ScreenShare] Auto-stop failed:', err);
        })
        .finally(() => {
          screenShareLifecycleRef.current = 'idle';
          isScreenShareActionInFlight.current = false;
          setIsShareButtonBusy(false);
          setIsScreenSharing(false);
          releaseScreenShareWakeLock();

          if (__DEV__) {
            console.log('[ScreenShare-Diag:SCREEN_SHARE_TRANSITION_COMPLETE]', {
              timestamp: new Date().toISOString(),
              transition: 'unpublishing',
              source: 'auto-stop',
              success: true,
            });
          }

          if (!isMicMutedRef.current && localParticipant) {
            localParticipant.setMicrophoneEnabled(true).catch(() => {});
          }
        });

      Alert.alert(
        t('meeting.screenShareStoppedTitle'),
        t('meeting.screenShareStoppedDesc')
      );
    }
  }, [remoteParticipants.length, isScreenSharing, localParticipant, t]);

  // Keep phone screen awake while screen sharing is active
  useEffect(() => {
    console.log('[WakeLock] wakeLock effect ran, isScreenSharing=' + isScreenSharing);
    if (isScreenSharing) {
      acquireScreenShareWakeLock();
    } else {
      releaseScreenShareWakeLock();
    }
    return () => {
      releaseScreenShareWakeLock();
    };
  }, [isScreenSharing]);

  const handleParticipantPress = (identity: string) => {
    if (allParticipants.length <= 1) {
      setIsGridMode(false);
      return;
    }
    setPinnedParticipantIdentity(prev => prev === identity ? null : identity);
    setIsGridMode(false);
  };

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
              // 1. Mute local mic
              if (localParticipant) {
                await localParticipant.setMicrophoneEnabled(false);
                setIsMicMuted(true);
              }

              // 2. Broadcast MUTE_ALL via reliable LiveKit Data Channel
              const encoder = new TextEncoder();
              const payload = encoder.encode(
                JSON.stringify({
                  type: 'MUTE_ALL',
                  host: localParticipant?.name || 'Host',
                  timestamp: Date.now(),
                })
              );
              await localParticipant?.publishData(payload, {
                reliable: true,
              } as any);

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

  const handleSwitchCamera = async () => {
    console.log('[CameraSwitch] handleSwitchCamera triggered! Current facing:', cameraFacing);
    try {
      resetControlsTimer();
      const nextFacing: 'user' | 'environment' = cameraFacing === 'user' ? 'environment' : 'user';
      console.log('[CameraSwitch] Attempting switch to:', nextFacing);

      // 1. Get current video track publication & LocalVideoTrack
      const videoPubs = Array.from(localParticipant?.videoTrackPublications?.values() ?? []);
      const cameraPub = videoPubs.find(p => p.source === Track.Source.Camera);
      const videoTrack = (cameraPub?.videoTrack || cameraPub?.track) as any;
      const mediaTrack = videoTrack?.mediaStreamTrack;
      console.log('[CameraSwitch] videoTrack present:', Boolean(videoTrack), 'mediaTrack present:', Boolean(mediaTrack));

      // 2. Restart track with next facingMode
      if (videoTrack && typeof videoTrack.restartTrack === 'function') {
        console.log('[CameraSwitch] Calling videoTrack.restartTrack with facingMode:', nextFacing);
        await videoTrack.restartTrack({ facingMode: nextFacing });
        console.log('[CameraSwitch] videoTrack.restartTrack succeeded!');
      } else if (mediaTrack && typeof mediaTrack._switchCamera === 'function') {
        try {
          console.log('[CameraSwitch] Calling mediaTrack._switchCamera()...');
          mediaTrack._switchCamera();
          console.log('[CameraSwitch] mediaTrack._switchCamera() succeeded!');
        } catch (switchErr) {
          console.warn('[CameraSwitch] _switchCamera error:', switchErr);
        }
      }

      // 3. Update room videoCaptureDefaults for next activation
      if ((room as any)?.options?.videoCaptureDefaults) {
        (room as any).options.videoCaptureDefaults.facingMode = nextFacing;
        delete (room as any).options.videoCaptureDefaults.deviceId;
      }

      setCameraFacing(nextFacing);
      console.log('[CameraSwitch] Camera successfully switched to:', nextFacing);
    } catch (e) {
      console.error('[CameraSwitch] Failed to switch camera:', e);
    }
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

        {/* --- LEAVE CONFIRMATION MODAL --- */}
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

        {/* --- AUDIO OUTPUT DEVICE MODAL --- */}
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
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />

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
            if (onMinimize) {
              onMinimize();
            }
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

      {/* --- UNIFIED FULL-SCREEN TAP-TO-SHOW-CONTROLS SURFACE --- */}
      {!showControls && !isNativePip && !isMinimized && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleScreenTap}
          style={styles.fullScreenTapSurface}
        />
      )}

      {/* Meet / WhatsApp style: tap PiP to reveal mute, camera, end */}
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

      {/* --- MEETING INFO MODAL --- */}
      <MeetingInfoModal
        visible={!isNativePip && isInfoModalOpen}
        bottomInset={insets.bottom}
        meetingTitle={displayTitle}
        meetingLink={meetingLink}
        copied={copied}
        onCopyLink={copyToClipboard}
        onClose={() => setIsInfoModalOpen(false)}
      />

      {/* --- LEAVE CONFIRMATION MODAL --- */}
      <LeaveMeetingModal
        visible={!isNativePip && isLeaveModalOpen}
        isHost={isHost}
        bottomInset={insets.bottom}
        onConfirm={handleLeaveOrEndMeeting}
        onCancel={() => setIsLeaveModalOpen(false)}
      />

      {/* --- INVITE OTHERS MODAL --- */}
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

      {/* --- AUDIO OUTPUT DEVICE MODAL --- */}
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

      {/* --- IN-APP FULLSCREEN MEDIA PREVIEW MODAL --- */}
      <MediaPreviewModal
        visible={!isNativePip && Boolean(previewMedia)}
        media={previewMedia}
        onClose={() => setPreviewMedia(null)}
      />

      {/* --- NATIVE REPLAYKIT BROADCAST PICKER (iOS Only) --- */}
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
