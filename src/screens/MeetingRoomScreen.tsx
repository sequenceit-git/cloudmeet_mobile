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
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { validateFileSize, formatBytes, MAX_FILE_SIZE_BYTES } from '../utils/fileValidation';
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  useWindowDimensions,
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
import { RootStackNavigationProp, RootStackRouteProp } from '../navigation/types';
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
} from '../services/api';
import { useTranslation } from '../hooks/useTranslation';
import storage, { StorageKeys } from '../services/storage';
import { useMeeting } from '../context/MeetingContext';
import {
  acquireScreenShareWakeLock,
  releaseScreenShareWakeLock,
  startMeetingForegroundService,
  stopMeetingForegroundService,
} from '../utils/wakeLock';
import { startAudioSession, stopAudioSession } from '../services/livekit';
import { MediaPreviewModal, MediaPreviewItem, sanitizeMediaUrl } from '../components/meeting/MediaPreviewModal';
import { setPipConfig, prepareScreenShare, addPipListener, isInPipMode } from '../utils/pip';

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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

import { getInitials, getAvatarTextStyle } from '../utils/helpers';

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `00:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ];

      // Add notification permission for Android 13+ (API 33+)
      if (Platform.Version >= 33) {
        // @ts-ignore
        permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }

      await PermissionsAndroid.requestMultiple(permissions);

      // We only strictly require Camera and Mic to enter the room.
      // Notifications are needed for screen share service but shouldn't block entry.
      const cameraGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      const audioGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);

      return cameraGranted && audioGranted;
    } catch (err) {
      console.warn('[Permissions] Error:', err);
      return false;
    }
  }
  return true;
}

interface ChatMessage {
  id: string;
  clientMsgId?: string;
  sender: string;
  text: string;
  time: string;
  isSelf: boolean;
  type?: 'text' | 'image' | 'video' | 'audio' | 'document';
  fileName?: string;
  fileSize?: string;
  mediaUrl?: string;
  duration?: string;
}

const checkIsParticipantHost = (p?: Participant | null): boolean => {
  if (!p) return false;
  if (p.metadata === 'host') return true;
  if (p.metadata) {
    try {
      const meta = JSON.parse(p.metadata);
      if (meta.is_host === true || meta.role === 'host' || meta.type === 'host' || meta.roomAdmin === true) {
        return true;
      }
      if (meta.is_host === false) {
        return false;
      }
    } catch {}
  }
  return false;
};

const ParticipantCard: React.FC<{
  participant: Participant;
  isLocal?: boolean;
  cameraFacing?: 'user' | 'environment';
  isSingleOrFullScreen?: boolean;
  showControls?: boolean;
  isGridMode?: boolean;
  density?: 'spacious' | 'normal' | 'compact' | 'ultra-compact';
  insets?: { top: number; bottom: number; left: number; right: number };
  onSwitchCamera?: () => void;
  onToggleLayout?: () => void;
  onAudioPress?: () => void;
  renderAudioIcon?: () => React.ReactNode;
  onPress?: () => void;
  style?: any;
}> = ({
  participant,
  isLocal,
  cameraFacing = 'user',
  isSingleOrFullScreen = false,
  showControls = true,
  isGridMode = false,
  density = 'normal',
  insets,
  onSwitchCamera,
  onToggleLayout,
  onAudioPress,
  renderAudioIcon,
  onPress,
  style,
}) => {
    const { t } = useTranslation();
    const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], { onlySubscribed: false });
    const cameraTrack = tracks.find(t => t.participant?.identity === participant.identity && t.source === Track.Source.Camera);
    const screenShareTrack = tracks.find(t => t.participant?.identity === participant.identity && t.source === Track.Source.ScreenShare);

    const [isCameraEnabled, setIsCameraEnabled] = useState(participant.isCameraEnabled);
    const [isMicEnabled, setIsMicEnabled] = useState(participant.isMicrophoneEnabled);
    const [isSpeaking, setIsSpeaking] = useState(participant.isSpeaking);
    const [isScreenShareEnabled, setIsScreenShareEnabled] = useState(Boolean(participant.isScreenShareEnabled));

    useEffect(() => {
      console.log(`[ParticipantCard-Diagnostic] Mounted for ${participant.identity} (isLocal: ${isLocal})`);
    }, [participant.identity, isLocal]);

    useEffect(() => {
      const onUpdate = () => {
        setIsCameraEnabled(participant.isCameraEnabled);
        setIsMicEnabled(participant.isMicrophoneEnabled);
        setIsSpeaking(participant.isSpeaking);
        setIsScreenShareEnabled(Boolean(participant.isScreenShareEnabled));
      };
      participant.on('trackPublished', onUpdate);
      participant.on('trackUnpublished', onUpdate);
      participant.on('trackMuted', onUpdate);
      participant.on('trackUnmuted', onUpdate);
      participant.on('isSpeakingChanged', onUpdate);

      return () => {
        participant.off('trackPublished', onUpdate);
        participant.off('trackUnpublished', onUpdate);
        participant.off('trackMuted', onUpdate);
        participant.off('trackUnmuted', onUpdate);
        participant.off('isSpeakingChanged', onUpdate);
      };
    }, [participant]);

    const displayName = participant.name || participant.identity || 'Participant';
    const isHost = checkIsParticipantHost(participant);

    const isFrontCamera = useMemo(() => {
      if (!isLocal) return false;
      if (cameraTrack?.publication?.track) {
        try {
          const info = facingModeFromLocalTrack(cameraTrack.publication.track as any);
          if (info?.facingMode) {
            return info.facingMode === 'user';
          }
        } catch {
          // fallback
        }
      }
      return cameraFacing === 'user';
    }, [isLocal, cameraFacing, cameraTrack]);

    const avatarMetrics = useMemo(() => {
      if (isSingleOrFullScreen) {
        return {
          circleSize: 96,
          radius: 48,
          fontSize: 32,
          nameSize: 18,
          nameMarginTop: 14,
          micSize: 17,
          hostBadgePaddingH: 12,
          hostBadgePaddingV: 5,
          hostBadgeFontSize: 12,
          actionBtnSize: 44,
          actionIconSize: 20,
        };
      }
      switch (density) {
        case 'spacious':
          return {
            circleSize: 72,
            radius: 36,
            fontSize: 24,
            nameSize: 16,
            nameMarginTop: 10,
            micSize: 16,
            hostBadgePaddingH: 10,
            hostBadgePaddingV: 4,
            hostBadgeFontSize: 11,
            actionBtnSize: 36,
            actionIconSize: 16,
          };
        case 'compact':
          return {
            circleSize: 48,
            radius: 24,
            fontSize: 16,
            nameSize: 12,
            nameMarginTop: 6,
            micSize: 13,
            hostBadgePaddingH: 7,
            hostBadgePaddingV: 2.5,
            hostBadgeFontSize: 10,
            actionBtnSize: 28,
            actionIconSize: 13,
          };
        case 'ultra-compact':
          return {
            circleSize: 38,
            radius: 19,
            fontSize: 13,
            nameSize: 11,
            nameMarginTop: 4,
            micSize: 11,
            hostBadgePaddingH: 6,
            hostBadgePaddingV: 2,
            hostBadgeFontSize: 9,
            actionBtnSize: 24,
            actionIconSize: 11,
          };
        case 'normal':
        default:
          return {
            circleSize: 58,
            radius: 29,
            fontSize: 19,
            nameSize: 14,
            nameMarginTop: 8,
            micSize: 14,
            hostBadgePaddingH: 8,
            hostBadgePaddingV: 3,
            hostBadgeFontSize: 10.5,
            actionBtnSize: 32,
            actionIconSize: 15,
          };
      }
    }, [isSingleOrFullScreen, density]);

    return (
      <View
        style={[
          styles.participantCard,
          isSingleOrFullScreen
            ? styles.fullScreenCard
            : (isSpeaking && styles.activeSpeakerCard),
          style,
        ]}
      >
        {isCameraEnabled && cameraTrack?.publication?.track ? (
          <>
            <VideoTrack
              trackRef={cameraTrack}
              style={styles.cardVideo}
              mirror={Boolean(isLocal && isFrontCamera)}
            />
            {/* Bottom translucent name pill so participant name & mic are always visible on video */}
            <View style={[styles.videoNamePill, { bottom: density === 'ultra-compact' ? 5 : 8, left: density === 'ultra-compact' ? 5 : 8 }]}>
              <Text style={[styles.videoNameText, { fontSize: avatarMetrics.nameSize }]} numberOfLines={1}>
                {displayName}
              </Text>
              {isMicEnabled ? (
                <Mic color="#10b981" size={avatarMetrics.micSize} style={{ marginLeft: 4 }} />
              ) : (
                <MicOff color="#ef4444" size={avatarMetrics.micSize} style={{ marginLeft: 4 }} />
              )}
            </View>
          </>
        ) : (
          <View style={[styles.avatarContainer, isSingleOrFullScreen && styles.fullScreenAvatarContainer]}>
            <LinearGradient
              colors={isLocal ? ['#00A8FF', '#0066CC'] : ['#10b981', '#059669']}
              style={[
                isSingleOrFullScreen ? styles.largeAvatarCircle : styles.avatarCircle,
                !isSingleOrFullScreen && {
                  width: avatarMetrics.circleSize,
                  height: avatarMetrics.circleSize,
                  borderRadius: avatarMetrics.radius,
                },
              ]}
            >
              <Text
                style={[
                  isSingleOrFullScreen ? styles.largeAvatarText : styles.avatarText,
                  { fontSize: avatarMetrics.fontSize },
                  getAvatarTextStyle(displayName, avatarMetrics.fontSize),
                ]}
              >
                {getInitials(displayName)}
              </Text>
            </LinearGradient>
            <View
              style={[
                isSingleOrFullScreen ? styles.largeAvatarNameRow : styles.gridAvatarNameRow,
                !isSingleOrFullScreen && { marginTop: avatarMetrics.nameMarginTop },
              ]}
            >
              <Text
                style={[
                  isSingleOrFullScreen ? styles.largeAvatarName : styles.gridAvatarName,
                  !isSingleOrFullScreen && { fontSize: avatarMetrics.nameSize },
                ]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              {isMicEnabled ? (
                <Mic color="#10b981" size={avatarMetrics.micSize} style={{ marginLeft: 4 }} />
              ) : (
                <MicOff color="#ef4444" size={avatarMetrics.micSize} style={{ marginLeft: 4 }} />
              )}
            </View>
          </View>
        )}

        <TouchableOpacity
          activeOpacity={isSingleOrFullScreen ? 1 : 0.9}
          onPress={onPress}
          style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
        />

        {/* Top badges and action buttons */}
        {showControls && (
          <View
            style={[
              styles.cardTopRow,
              isSingleOrFullScreen
                ? { top: (insets?.top ?? 0) + (showControls ? 64 : 16) }
                : {
                    top: density === 'ultra-compact' ? 6 : 8,
                    left: density === 'ultra-compact' ? 8 : 10,
                    right: density === 'ultra-compact' ? 8 : 10,
                  },
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.leftBadgeContainer} pointerEvents="box-none">
              {onAudioPress && isSingleOrFullScreen && (
                <TouchableOpacity
                  style={styles.actionIconBtn}
                  onPress={onAudioPress}
                  hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                  activeOpacity={0.7}
                >
                  {renderAudioIcon ? renderAudioIcon() : <Volume2 color="#00A8FF" size={20} />}
                </TouchableOpacity>
              )}
              {isHost && (
                <View
                  style={[
                    styles.hostBadge,
                    !isSingleOrFullScreen && {
                      paddingHorizontal: avatarMetrics.hostBadgePaddingH,
                      paddingVertical: avatarMetrics.hostBadgePaddingV,
                      borderRadius: density === 'ultra-compact' ? 4 : 6,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.hostBadgeText,
                      !isSingleOrFullScreen && { fontSize: avatarMetrics.hostBadgeFontSize },
                    ]}
                  >
                    {t('meeting.host')}
                  </Text>
                </View>
              )}
              {Boolean(screenShareTrack?.publication?.track || (isLocal && isScreenShareEnabled)) && (
                <View
                  style={[
                    styles.participantScreenShareBadge,
                    !isSingleOrFullScreen && {
                      paddingHorizontal: avatarMetrics.hostBadgePaddingH,
                      paddingVertical: avatarMetrics.hostBadgePaddingV,
                      borderRadius: density === 'ultra-compact' ? 4 : 6,
                    },
                  ]}
                >
                  <MonitorUp color="#00A8FF" size={avatarMetrics.hostBadgeFontSize} style={{ marginRight: 3 }} />
                  <Text
                    style={[
                      styles.participantScreenShareBadgeText,
                      !isSingleOrFullScreen && { fontSize: avatarMetrics.hostBadgeFontSize },
                    ]}
                  >
                    {t('meeting.sharingYourScreenSub') || 'Screen'}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.rightBadgeActions} pointerEvents="auto">
              {isLocal && isCameraEnabled && (
                <TouchableOpacity
                  style={[
                    styles.actionIconBtn,
                    !isSingleOrFullScreen && {
                      width: avatarMetrics.actionBtnSize,
                      height: avatarMetrics.actionBtnSize,
                      borderRadius: avatarMetrics.actionBtnSize / 2,
                    },
                  ]}
                  onPress={() => {
                    console.log('[CameraSwitch] Button pressed in ParticipantCard!');
                    onSwitchCamera?.();
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.7}
                >
                  <SwitchCamera color="#FFF" size={avatarMetrics.actionIconSize} />
                </TouchableOpacity>
              )}

              {onToggleLayout && (
                <TouchableOpacity
                  style={[
                    styles.actionIconBtn,
                    !isSingleOrFullScreen && {
                      width: avatarMetrics.actionBtnSize,
                      height: avatarMetrics.actionBtnSize,
                      borderRadius: avatarMetrics.actionBtnSize / 2,
                    },
                  ]}
                  onPress={onToggleLayout}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.7}
                >
                  {isGridMode ? (
                    <Maximize2 color="#FFF" size={avatarMetrics.actionIconSize} />
                  ) : (
                    <LayoutGrid color="#FFF" size={avatarMetrics.actionIconSize} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

const ScreenShareStage: React.FC<{
  track: any;
  insets?: { top: number; bottom: number; left: number; right: number };
  showControls?: boolean;
  isGridMode?: boolean;
  onToggleLayout?: () => void;
  onAudioPress?: () => void;
  renderAudioIcon?: () => React.ReactNode;
  onPress?: () => void;
  onStopScreenShare?: () => void;
  isSelf?: boolean;
}> = ({
  track,
  insets,
  showControls = true,
  isGridMode = false,
  onToggleLayout,
  onAudioPress,
  renderAudioIcon,
  onPress,
  onStopScreenShare,
  isSelf: isSelfProp,
}) => {
  const { t } = useTranslation();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const isSelf = Boolean(
    isSelfProp ??
    (track?.participant?.isLocal || (localParticipant && track?.participant?.identity === localParticipant?.identity))
  );

  const presenter = track?.participant;
  const presenterName = presenter?.name || presenter?.identity || 'Participant';

  const [subscribedTrack, setSubscribedTrack] = useState<RemoteTrack | LocalVideoTrack | undefined>(
    track?.publication?.track
  );
  const [isSubscribed, setIsSubscribed] = useState<boolean>(
    Boolean(track?.publication?.isSubscribed && track?.publication?.track)
  );

  useEffect(() => {
    const pub = track?.publication;
    const participant = track?.participant;

    const syncTrackState = () => {
      const currentTrack = pub?.track;
      const ready = Boolean(pub?.isSubscribed && currentTrack);
      setSubscribedTrack(currentTrack);
      setIsSubscribed(ready);

      if (__DEV__ && ready) {
        console.log('[ScreenShare-Diag:SCREEN_SHARE_TRACK_AVAILABLE]', {
          identity: participant?.identity,
          trackSid: pub?.trackSid,
          isSubscribed: Boolean(pub?.isSubscribed),
          hasTrack: Boolean(currentTrack),
          mediaStreamTrackReady: Boolean((currentTrack as any)?.mediaStreamTrack),
        });
      }
    };

    syncTrackState();

    if (pub) {
      pub.on(TrackEvent.Subscribed, syncTrackState);
      pub.on(TrackEvent.Unsubscribed, syncTrackState);
      pub.on(TrackEvent.SubscriptionStatusChanged, syncTrackState);
    }

    if (participant) {
      participant.on(ParticipantEvent.TrackSubscribed, syncTrackState);
      participant.on(ParticipantEvent.TrackUnsubscribed, syncTrackState);
    }

    if (room) {
      room.on(RoomEvent.Reconnected, syncTrackState);
      room.on(RoomEvent.Connected, syncTrackState);
    }

    return () => {
      if (pub) {
        pub.off(TrackEvent.Subscribed, syncTrackState);
        pub.off(TrackEvent.Unsubscribed, syncTrackState);
        pub.off(TrackEvent.SubscriptionStatusChanged, syncTrackState);
      }
      if (participant) {
        participant.off(ParticipantEvent.TrackSubscribed, syncTrackState);
        participant.off(ParticipantEvent.TrackUnsubscribed, syncTrackState);
      }
      if (room) {
        room.off(RoomEvent.Reconnected, syncTrackState);
        room.off(RoomEvent.Connected, syncTrackState);
      }
    };
  }, [track?.publication, track?.participant, room]);

  useEffect(() => {
    console.log('[ScreenShare-Diag:SCREEN_SHARE_STAGE_MOUNTED]', {
      identity: presenter?.identity,
      isLocal: presenter?.isLocal,
      isSelf,
      publicationExists: Boolean(track?.publication),
      isSubscribed: Boolean((track?.publication as any)?.isSubscribed),
      hasTrack: Boolean(track?.publication?.track),
      trackSid: track?.publication?.trackSid,
      source: track?.source,
    });
  }, [track?.publication?.trackSid, isSelf, presenter?.identity]);

  const isSubscribedAndReady = Boolean(
    isSubscribed && subscribedTrack
  );



  return (
    <View style={styles.screenShareStageContainer}>
      {isSelf ? (
        /* Dedicated Broadcaster View when local user is sharing screen.
           CRITICAL: Do NOT render VideoTrack here to prevent infinite recursive screen mirroring! */
        <TouchableOpacity
          activeOpacity={1}
          onPress={onPress}
          style={styles.screenSharePresenterCard}
        >
          {/* Subtle Ambient Radial Glow */}
          <View style={styles.screenSharePresenterGlow} pointerEvents="none" />

          {/* Central Pulsing Icon */}
          <View style={styles.screenSharePresenterIconWrapper} pointerEvents="none">
            <View style={styles.screenSharePresenterPulseRing2} />
            <View style={styles.screenSharePresenterPulseRing1} />
            <LinearGradient
              colors={['#00A8FF', '#0066CC']}
              style={styles.screenSharePresenterIconCircle}
            >
              <Monitor color="#FFF" size={44} />
            </LinearGradient>
          </View>

          {/* Live Broadcast Badge */}
          <View style={styles.screenShareLiveBadge} pointerEvents="none">
            <View style={styles.screenShareLiveDot} />
            <Text style={styles.screenShareLiveBadgeText}>
              {t('meeting.sharingYourScreenSub')}
            </Text>
          </View>

          {/* Headline & Description */}
          <Text style={styles.screenSharePresenterTitle}>
            {t('meeting.sharingYourScreenTitle')}
          </Text>
          <Text style={styles.screenSharePresenterDesc}>
            {t('meeting.sharingYourScreenDesc')}
          </Text>

          {/* Prominent Stop Sharing Button */}
          {onStopScreenShare && (
            <TouchableOpacity
              style={styles.screenSharePresenterStopBtn}
              onPress={onStopScreenShare}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#ef4444', '#dc2626']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.screenSharePresenterStopBtnGradient}
              >
                <MonitorOff color="#FFF" size={18} style={{ marginRight: 8 }} />
                <Text style={styles.screenSharePresenterStopBtnText}>
                  {t('meeting.stopSharing')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      ) : (
        /* Remote Screen Share Stage: Displays the video stream shared by other participants */
        <>
          {isSubscribedAndReady ? (
            <View
              style={styles.fullStageVideo}
              onLayout={(e: any) => {
                console.log('[ScreenShare-Diag:SCREEN_SHARE_STAGE_LAYOUT_READY]', {
                  layout: e?.nativeEvent?.layout,
                  trackSid: track?.publication?.trackSid,
                  identity: presenter?.identity,
                });
              }}
            >
              <VideoTrack
                trackRef={track}
                style={styles.fullStageVideo}
                objectFit="contain"
                mirror={false}
                zOrder={1}
              />
            </View>
          ) : (
            <View style={styles.screenShareLoadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#00A8FF" style={{ marginBottom: 12 }} />
              <Text style={styles.screenShareLoadingText}>
                {t('meeting.connectingScreenShare') || 'Connecting to screen share...'}
              </Text>
            </View>
          )}
          <TouchableOpacity
            activeOpacity={1}
            onPress={onPress}
            style={[StyleSheet.absoluteFill, { zIndex: 2 }]}
          />
        </>
      )}

      {/* Top Action Controls Row */}
      <View
        style={[
          styles.cardTopRow,
          { top: showControls ? 64 : 16 },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.leftBadgeContainer} pointerEvents="box-none">
          {onAudioPress && (
            <TouchableOpacity
              style={styles.actionIconBtn}
              onPress={onAudioPress}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              activeOpacity={0.7}
            >
              {renderAudioIcon ? renderAudioIcon() : <Volume2 color="#00A8FF" size={20} />}
            </TouchableOpacity>
          )}
          {!isSelf && (
            <View style={styles.screenShareBadge}>
              <MonitorUp color="#00A8FF" size={16} style={{ marginRight: 6 }} />
              <Text style={styles.screenShareBadgeText}>
                {`${t('meeting.share')} (${presenterName})`}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.rightBadgeActions} pointerEvents="box-none">
          {onToggleLayout && (
            <TouchableOpacity
              style={styles.actionIconBtn}
              onPress={onToggleLayout}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              {isGridMode ? (
                <Maximize2 color="#FFF" size={20} />
              ) : (
                <LayoutGrid color="#FFF" size={20} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const ScreenShareView = ScreenShareStage;

const formatMeetingCode = (rawCode?: string): string => {
  if (!rawCode) return '';
  let clean = rawCode.replace(/^cloudnews-/i, '').trim();
  const plain = clean.replace(/[^a-zA-Z0-9]/g, '');
  if (plain.length === 6 && !clean.includes('-')) {
    return `${plain.slice(0, 3)}-${plain.slice(3, 6)}`;
  }
  if (plain.length === 9 && !clean.includes('-')) {
    return `${plain.slice(0, 3)}-${plain.slice(3, 6)}-${plain.slice(6, 9)}`;
  }
  return clean;
};

const AUDIO_DEVICE_CONFIG: Record<
  string,
  {
    name: string;
    description: string;
    icon: React.ComponentType<any>;
  }
> = {
  speaker: {
    name: 'Phone Speaker',
    description: 'High volume loudspeaker for meetings',
    icon: Volume2,
  },
  force_speaker: {
    name: 'Phone Speaker',
    description: 'High volume loudspeaker for meetings',
    icon: Volume2,
  },
  earpiece: {
    name: 'Ear Speaker',
    description: 'Private audio via phone top earpiece',
    icon: Smartphone,
  },
  default: {
    name: 'Ear Speaker / Receiver',
    description: 'Private audio via phone receiver',
    icon: Smartphone,
  },
  headset: {
    name: 'Wired Headphones',
    description: 'Connected via 3.5mm jack or USB-C',
    icon: Headphones,
  },
  bluetooth: {
    name: 'Bluetooth Earphones',
    description: 'Connected wireless audio device',
    icon: Bluetooth,
  },
};

interface WaitingRoomViewProps {
  insets: any;
  meetingTitle: string;
  meetingCode: string;
  displayName: string;
  isMicMuted: boolean;
  isCameraOff: boolean;
  cameraTrack?: any;
  cameraFacing: 'user' | 'environment';
  isHostPresent?: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => void;
  onOpenAudioModal: () => void;
  renderCurrentAudioIcon: () => React.ReactNode;
  onLeave: () => void;
  onMinimize?: () => void;
}

const WaitingRoomView: React.FC<WaitingRoomViewProps> = ({
  insets,
  meetingTitle,
  meetingCode,
  displayName,
  isMicMuted,
  isCameraOff,
  cameraTrack,
  cameraFacing,
  isHostPresent = false,
  onToggleMic,
  onToggleCamera,
  onSwitchCamera,
  onOpenAudioModal,
  renderCurrentAudioIcon,
  onLeave,
  onMinimize,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.14,
          duration: 1300,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1300,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const copyCode = async () => {
    if (meetingCode) {
      await Clipboard.setStringAsync(meetingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <View style={[styles.waitingRoomRoot, { paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 12) }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Top Header */}
      <View style={styles.waitingRoomHeader}>
        {onMinimize ? (
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={onMinimize}
            activeOpacity={0.7}
          >
            <ChevronLeft color="#FFF" size={20} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}

        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={onOpenAudioModal}
          activeOpacity={0.7}
        >
          {renderCurrentAudioIcon()}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.waitingRoomScrollView}
        contentContainerStyle={styles.waitingRoomScroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Center Animated Radar & Hero */}
        <View style={styles.waitingHeroBox}>
          <Animated.View style={[styles.waitingGlowCircle, { transform: [{ scale: pulseAnim }] }]} />
          <View style={styles.waitingRadarIconBox}>
            <Clock color="#00A8FF" size={36} />
          </View>

          <View style={styles.waitingStatusPill}>
            <View style={styles.waitingPulsingDot} />
            <Text style={styles.waitingStatusPillText}>
              {t('meeting.waitingRoomTitle')} • {t('common.active')}
            </Text>
          </View>

          <Text style={styles.waitingTitleText}>
            {isHostPresent ? t('meeting.waitingForAdmission') : t('meeting.waitingForHost')}
          </Text>

          <Text style={styles.waitingSubText}>
            {isHostPresent ? t('meeting.waitingForAdmissionDesc') : t('meeting.waitingForHostDesc')}
          </Text>
        </View>

        {/* Meeting Information Card */}
        <View style={styles.waitingInfoCard}>
          <View style={styles.waitingInfoCardHeader}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.waitingInfoLabel}>MEETING TITLE</Text>
              <Text style={styles.waitingInfoTitle} numberOfLines={1}>
                {meetingTitle || 'Live Meeting'}
              </Text>
            </View>
            <TouchableOpacity style={styles.waitingCodeBadge} onPress={copyCode} activeOpacity={0.7}>
              <Text style={styles.waitingCodeText}>{meetingCode}</Text>
              {copied ? <Check color="#10b981" size={14} /> : <Copy color="#00A8FF" size={14} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Guest Preview & Identity Card */}
        <View style={styles.waitingPreviewCard}>
          {!isCameraOff && cameraTrack?.publication?.track ? (
            <View style={styles.waitingCameraContainer}>
              <VideoTrack
                trackRef={cameraTrack}
                style={styles.waitingCameraVideo}
                mirror={cameraFacing === 'user'}
              />
              <TouchableOpacity
                style={styles.waitingFlipCameraBtn}
                onPress={onSwitchCamera}
                activeOpacity={0.7}
              >
                <SwitchCamera color="#FFF" size={18} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.waitingAvatarBox}>
              <LinearGradient colors={['#00A8FF', '#0066CC']} style={styles.waitingAvatarCircle}>
                <Text style={[styles.waitingAvatarText, getAvatarTextStyle(displayName, 32)]}>
                  {getInitials(displayName)}
                </Text>
              </LinearGradient>
              <Text style={styles.waitingDisplayName}>{displayName} ({t('meeting.you')})</Text>
              <Text style={styles.waitingRoleTag}>{t('meeting.participant')}</Text>
            </View>
          )}
        </View>

        {/* Device Setup Controls */}
        <View style={styles.waitingSetupSection}>
          <Text style={styles.waitingSetupTitle}>PREPARE YOUR AUDIO & VIDEO</Text>

          <View style={styles.waitingSetupButtonsRow}>
            {/* Mic Toggle */}
            <TouchableOpacity
              style={[
                styles.waitingSetupBtn,
                isMicMuted ? styles.waitingSetupBtnMuted : styles.waitingSetupBtnActive,
              ]}
              onPress={onToggleMic}
              activeOpacity={0.8}
            >
              <View style={[styles.waitingIconCircle, isMicMuted ? styles.iconCircleMuted : styles.iconCircleMic]}>
                {isMicMuted ? <MicOff color="#ef4444" size={20} /> : <Mic color="#10b981" size={20} />}
              </View>
              <Text style={styles.waitingBtnLabel}>
                {isMicMuted ? t('meeting.unmute') : t('meeting.mute')}
              </Text>
              <Text style={[styles.waitingBtnSub, isMicMuted ? { color: '#ef4444' } : { color: '#10b981' }]}>
                {isMicMuted ? 'Muted' : 'Ready'}
              </Text>
            </TouchableOpacity>

            {/* Camera Toggle */}
            <TouchableOpacity
              style={[
                styles.waitingSetupBtn,
                isCameraOff ? styles.waitingSetupBtnMuted : styles.waitingSetupBtnActive,
              ]}
              onPress={onToggleCamera}
              activeOpacity={0.8}
            >
              <View style={[styles.waitingIconCircle, isCameraOff ? styles.iconCircleMuted : styles.iconCircleVideo]}>
                {isCameraOff ? <VideoOff color="#ef4444" size={20} /> : <LucideVideo color="#00A8FF" size={20} />}
              </View>
              <Text style={styles.waitingBtnLabel}>
                {isCameraOff ? t('meeting.startVideo') : t('meeting.stopVideo')}
              </Text>
              <Text style={[styles.waitingBtnSub, isCameraOff ? { color: '#ef4444' } : { color: '#00A8FF' }]}>
                {isCameraOff ? 'Off' : 'Active'}
              </Text>
            </TouchableOpacity>

            {/* Audio Device or Flip Camera */}
            {!isCameraOff ? (
              <TouchableOpacity
                style={styles.waitingSetupBtn}
                onPress={onSwitchCamera}
                activeOpacity={0.8}
              >
                <View style={[styles.waitingIconCircle, styles.iconCircleNeutral]}>
                  <SwitchCamera color="#94a3b8" size={20} />
                </View>
                <Text style={styles.waitingBtnLabel}>Flip</Text>
                <Text style={styles.waitingBtnSub}>{cameraFacing === 'user' ? 'Front' : 'Back'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.waitingSetupBtn}
                onPress={onOpenAudioModal}
                activeOpacity={0.8}
              >
                <View style={[styles.waitingIconCircle, styles.iconCircleNeutral]}>
                  {renderCurrentAudioIcon()}
                </View>
                <Text style={styles.waitingBtnLabel}>{t('meeting.outputDevices')}</Text>
                <Text style={styles.waitingBtnSub}>Speaker</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Sticky Bottom Footer: Leave Waiting Room */}
      <View style={styles.waitingFooter}>
        <TouchableOpacity
          style={styles.waitingFullLeaveBtn}
          onPress={onLeave}
          activeOpacity={0.8}
        >
          <LogOut color="#ef4444" size={18} />
          <Text style={styles.waitingFullLeaveBtnText}>{t('meeting.leaveWaitingRoom')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
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
  const [currentAppState, setCurrentAppState] = useState<AppStateStatus>(AppState.currentState);
  const [isNativePipState, setIsNativePipState] = useState<boolean>(false);
  // Physical certainty: A smartphone screen width is always >= 320dp. Any window < 300dp or non-active AppState is guaranteed to be in PiP / background.
  const isWindowPip = windowWidth < 300 || windowHeight < 400;
  const isNativePip = isNativePipState || isWindowPip || currentAppState !== 'active';
  const isUserLeavingRef = useRef<boolean>(false);

  // Subscribe to LiveKit room reconnection to re-sync local audio/video publish state if active
  useEffect(() => {
    if (!room) return;

    const handleReconnected = () => {
      if (__DEV__) console.log('[MeetingRoomScreen] Successfully reconnected to room:', room.name);

      // Re-sync local audio/video publish state if active
      const lp = room.localParticipant;
      if (lp) {
        if (!isMicMutedRef.current && !lp.isMicrophoneEnabled) {
          lp.setMicrophoneEnabled(true).catch(() => {});
        }
        if (!isCameraOffRef.current && !lp.isCameraEnabled) {
          lp.setCameraEnabled(true).catch(() => {});
        }
      }
    };

    room.on(RoomEvent.Reconnected, handleReconnected);

    return () => {
      room.off(RoomEvent.Reconnected, handleReconnected);
    };
  }, [room]);

  // Subscribe to native Android Picture-in-Picture mode changes and AppState transitions
  useEffect(() => {
    const unsubscribe = addPipListener(inPip => {
      if (__DEV__) console.log('[PiP] Native Picture-in-Picture state changed:', inPip);
      setIsNativePipState(inPip);
    });

    // Directly query native module on mount and AppState transitions for zero-lag sync
    isInPipMode().then(inMode => {
      if (inMode) setIsNativePipState(true);
    }).catch(() => {});

    const appStateSub = AppState.addEventListener('change', nextState => {
      setCurrentAppState(nextState);
      isInPipMode().then(inMode => {
        setIsNativePipState(inMode);
      }).catch(() => {});
    });

    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, []);

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

  const handleScreenTap = useCallback(() => {
    console.log('[MeetingRoomScreen] Screen tapped!');
    setShowControls(prev => {
      const next = !prev;
      console.log('[MeetingRoomScreen] Toggling showControls to:', next);
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
  }, [resetControlsTimer]);

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
  // - When remote presentation is active or in normal meeting, enable native PiP
  useEffect(() => {
    setPipConfig(true, isLocalScreenSharing);
    return () => {
      setPipConfig(false, false);
    };
  }, [isLocalScreenSharing]);

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

    if (localParticipant.isMicrophoneEnabled !== undefined) {
      setIsMicMuted(!localParticipant.isMicrophoneEnabled);
    }

    const syncMic = (pub?: any) => {
      if (pub && pub.source && pub.source !== Track.Source.Microphone) {
        return;
      }
      setIsMicMuted(!localParticipant.isMicrophoneEnabled);
    };

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

    if (localParticipant.isCameraEnabled !== undefined) {
      setIsCameraOff(!localParticipant.isCameraEnabled);
    }

    const syncCamera = (pub?: any) => {
      if (pub && pub.source && pub.source !== Track.Source.Camera) {
        return;
      }
      setIsCameraOff(!localParticipant.isCameraEnabled);
    };

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
        if (localParticipant && !isMicMutedRef.current && !localParticipant.isMicrophoneEnabled && room?.state === ConnectionState.Connected) {
          console.log('[AppState] Ensuring microphone track is preserved in background');
          localParticipant.setMicrophoneEnabled(true).catch(err => {
            console.warn('[AppState] Background microphone preserve warning:', err);
          });
        }
      } else if (nextAppState === 'active') {
        // Returned to foreground, re-verify audio output and mic state without redundant renegotiation
        if (localParticipant && !isMicMutedRef.current && !localParticipant.isMicrophoneEnabled && room?.state === ConnectionState.Connected) {
          localParticipant.setMicrophoneEnabled(true).catch(() => {});
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
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
        <Modal
          visible={isLeaveModalOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIsLeaveModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
              <View style={styles.modalDragHandle} />
              <Text style={styles.leaveModalTitle}>
                {isHost ? t('meeting.endConfirm') : t('meeting.leaveConfirm')}
              </Text>
              <Text style={styles.leaveModalSub}>
                {isHost ? t('meeting.endConfirmHost') : t('meeting.stay')}
              </Text>

              <View style={styles.leaveModalActions}>
                <TouchableOpacity
                  style={[styles.confirmLeaveBtn, isHost && { backgroundColor: '#ef4444' }]}
                  onPress={() => {
                    setIsLeaveModalOpen(false);
                    handleLeaveWaitingRoom();
                  }}
                >
                  <Text style={styles.confirmLeaveText}>
                    {isHost ? t('meeting.endCallHost') : t('meeting.leave')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelLeaveBtn}
                  onPress={() => setIsLeaveModalOpen(false)}
                >
                  <Text style={styles.cancelLeaveText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* --- AUDIO OUTPUT DEVICE MODAL --- */}
        <Modal
          visible={isAudioModalOpen}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsAudioModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.audioModalContent, { paddingBottom: insets.bottom + 20 }]}>
              <View style={styles.modalDragHandle} />
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{t('meeting.outputDevices')}</Text>
                  <Text style={styles.modalSubtitle}>{t('meeting.outputDevices')}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TouchableOpacity
                    style={styles.refreshIconBtn}
                    onPress={() => fetchAudioOutputs(false)}
                    activeOpacity={0.7}
                    disabled={isRefreshingOutputs}
                  >
                    {isRefreshingOutputs ? (
                      <ActivityIndicator size="small" color="#00A8FF" />
                    ) : (
                      <RefreshCw color="#94a3b8" size={18} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={() => setIsAudioModalOpen(false)}
                  >
                    <X color="#94a3b8" size={20} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.audioDeviceList}>
                {availableOutputs.map((deviceId) => {
                  const config = getAudioDeviceDisplay(deviceId);
                  const IconComp = config.icon;
                  const isSelected = selectedAudioOutput === deviceId;

                  return (
                    <TouchableOpacity
                      key={deviceId}
                      style={[
                        styles.audioDeviceItem,
                        isSelected && styles.audioDeviceItemSelected,
                      ]}
                      onPress={() => handleSelectAudioOutput(deviceId)}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        styles.audioDeviceIconBox,
                        isSelected && styles.audioDeviceIconBoxSelected,
                      ]}>
                        <IconComp
                          color={isSelected ? '#00A8FF' : '#94a3b8'}
                          size={22}
                        />
                      </View>

                      <View style={styles.audioDeviceInfo}>
                        <Text style={[
                          styles.audioDeviceName,
                          isSelected && styles.audioDeviceNameSelected,
                        ]}>
                          {config.name}
                        </Text>
                        <Text style={styles.audioDeviceDesc}>
                          {config.description}
                        </Text>
                      </View>

                      <View style={styles.audioDeviceCheckContainer}>
                        {isSelected ? (
                          <View style={styles.audioActiveCheckBadge}>
                            <Check color="#FFF" size={14} />
                          </View>
                        ) : (
                          <View style={styles.audioUncheckedCircle} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.audioTipFooter}>
                <Text style={styles.audioTipText}>
                  {t('meeting.audioDeviceTip')}
                </Text>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.contentContainer}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* --- HOST ADMITTED TOAST BANNER --- */}
      {showAdmittedBanner && (
        <View style={[styles.admittedBanner, { top: insets.top + (showControls ? 64 : 16) }]}>
          <View style={styles.admittedDot} />
          <Text style={styles.admittedBannerText}>{t('meeting.hostArrivedAdmitting')}</Text>
        </View>
      )}

      {/* --- GUEST ADMISSION PROMPT BANNER (FOR HOST) --- */}
      {isHost && latestWaitingGuest && (
        <View
          style={[
            styles.hostAdmissionBanner,
            { top: insets.top + (showControls ? 64 : 16) },
          ]}
        >
          <View style={styles.admissionBannerLeft}>
            <View style={styles.admissionBellBox}>
              <UserPlus color="#00A8FF" size={18} />
            </View>
            <View style={styles.admissionMeta}>
              <Text style={styles.admissionGuestName} numberOfLines={1}>
                {latestWaitingGuest.name}
              </Text>
              <Text style={styles.admissionSubtitle} numberOfLines={1}>
                {t('meeting.wantsToJoin')}
              </Text>
            </View>
          </View>
          <View style={styles.admissionActions}>
            <TouchableOpacity
              style={styles.admissionDenyBtn}
              onPress={() => handleDenyGuest(latestWaitingGuest.identity)}
              activeOpacity={0.7}
            >
              <X color="#ef4444" size={15} />
              <Text style={styles.admissionDenyText}>{t('meeting.deny')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.admissionAdmitBtn}
              onPress={() => handleAdmitGuest(latestWaitingGuest.identity)}
              activeOpacity={0.7}
            >
              <Check color="#FFF" size={15} />
              <Text style={styles.admissionAdmitText}>{t('meeting.admit')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* --- TOP HEADER --- */}
      {!isNativePip && (
        <Animated.View
          pointerEvents={showControls ? 'auto' : 'none'}
          style={[
            styles.header,
            {
              paddingTop: insets.top + 8,
              opacity: controlsOpacity,
              transform: [{ translateY: headerTranslateY }],
            },
          ]}
        >
          <View style={styles.headerLeft}>
            {isGridMode && (
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={() => {
                  resetControlsTimer();
                  fetchAudioOutputs(false);
                  setIsAudioModalOpen(true);
                }}
                activeOpacity={0.7}
              >
                {renderCurrentAudioIcon()}
              </TouchableOpacity>
            )}

            {/* Back arrow to minimize meeting inside app to App Home Screen */}
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => {
                resetControlsTimer();
                if (onMinimize) {
                  onMinimize();
                }
              }}
              activeOpacity={0.7}
            >
              <ChevronLeft color="#FFF" size={20} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.headerCenter}
            onPress={() => {
              resetControlsTimer();
              setIsInfoModalOpen(true);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.titleRow}>
              <Text style={styles.meetingTitle}>{displayTitle || 'Meeting'}</Text>
              <ChevronDown color="#94a3b8" size={14} />
            </View>
            <Text style={styles.timerText}>{formatTime(callDuration)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.leaveBtn}
            onPress={() => {
              resetControlsTimer();
              setIsLeaveModalOpen(true);
            }}
          >
            <LogOut color="#ef4444" size={16} />
            <Text style={styles.leaveText}>{t('meeting.leave')}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* --- FLOATING RECONNECTING BANNER (Zoom-Style Non-Blocking Auto-Recovery) --- */}
      {isReconnectingUI && room.state !== ConnectionState.Connected && (
        <View
          style={[
            styles.reconnectingBanner,
            {
              top: insets.top + (showControls ? 58 : 14),
            },
          ]}
          pointerEvents="none"
        >
          <ActivityIndicator color="#FFFFFF" size="small" style={{ marginRight: 8 }} />
          <Text style={styles.reconnectingText}>
            {t('meeting.reconnecting') || 'Reconnecting to meeting...'}
          </Text>
        </View>
      )}

      {/* --- FLOATING SCREEN SHARE STOP BANNER (One-Tap In-App Stop) --- */}
      {!isNativePip && isScreenSharing && (isGridMode || pinnedParticipantIdentity || !activeScreenShare) && (
        <View
          style={[
            styles.floatingScreenShareBanner,
            {
              top: insets.top + (showControls ? 58 : 12),
            },
          ]}
          pointerEvents="auto"
        >
          <View style={styles.floatingBannerLeft}>
            <View style={styles.pulseDot} />
            <MonitorUp color="#00A8FF" size={14} style={{ marginRight: 6 }} />
            <Text style={styles.floatingBannerText}>{t('meeting.screenShareBanner')}</Text>
          </View>
          <TouchableOpacity
            style={[styles.floatingStopBtn, isScreenShareToggling && { opacity: 0.6 }]}
            onPress={() => {
              if (isScreenShareActionInFlight.current || screenShareLifecycleRef.current !== 'idle') return;
              handleToggleScreenShare();
            }}
            disabled={isScreenShareToggling}
            activeOpacity={0.8}
          >
            {isScreenShareToggling ? (
              <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 5 }} />
            ) : (
              <MonitorOff color="#FFF" size={13} style={{ marginRight: 5 }} />
            )}
            <Text style={styles.floatingStopBtnText}>{t('meeting.stopSharing')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* --- DYNAMIC PARTICIPANTS / SCREEN SHARE VIEW --- */}
      <View
        style={[
          styles.gridContainer,
          (isFullScreen || isNativePip) ? styles.fullScreenGridContainer : [
            styles.multiGridContainer,
            { paddingTop: insets.top + 68, paddingBottom: insets.bottom + 92 },
          ],
        ]}
      >
        {activeScreenShare && !isGridMode ? (
          <View style={[styles.presentationContainer, { paddingTop: insets.top }]}>
            {/* Dedicated Presentation Stage: Takes 100% available presentation area */}
            <View style={styles.screenShareStageContainer}>
              <ScreenShareStage
                track={activeScreenShare}
                insets={insets}
                showControls={isNativePip ? false : showControls}
                isGridMode={isGridMode}
                onToggleLayout={handleToggleLayout}
                onAudioPress={() => {
                  resetControlsTimer();
                  fetchAudioOutputs(false);
                  setIsAudioModalOpen(true);
                }}
                renderAudioIcon={renderCurrentAudioIcon}
                onPress={handleScreenTap}
                onStopScreenShare={() => {
                  if (isScreenShareActionInFlight.current || screenShareLifecycleRef.current !== 'idle') return;
                  handleToggleScreenShare();
                }}
                isSelf={Boolean(
                  isScreenSharing ||
                  activeScreenShare.participant?.isLocal ||
                  (localParticipant && activeScreenShare.participant?.identity === localParticipant.identity)
                )}
              />
            </View>
          </View>
        ) : !isGridMode && activeMeetingParticipants.length === 1 ? (
          <ParticipantCard
            key={`solo-${activeMeetingParticipants[0]?.identity || 'local'}`}
            participant={activeMeetingParticipants[0] || (localParticipant as any)}
            isLocal={true}
            cameraFacing={cameraFacing}
            isSingleOrFullScreen={true}
            showControls={isNativePip ? false : showControls}
            isGridMode={false}
            onToggleLayout={handleToggleLayout}
            onAudioPress={() => {
              resetControlsTimer();
              fetchAudioOutputs(false);
              setIsAudioModalOpen(true);
            }}
            renderAudioIcon={renderCurrentAudioIcon}
            insets={insets}
            onSwitchCamera={handleSwitchCamera}
            onPress={handleScreenTap}
            style={styles.fullScreenCard}
          />
        ) : !isGridMode && pinnedParticipantIdentity && activeMeetingParticipants.find(p => p.identity === pinnedParticipantIdentity) ? (
          <ParticipantCard
            key={`pinned-${pinnedParticipantIdentity}`}
            participant={activeMeetingParticipants.find(p => p.identity === pinnedParticipantIdentity)!}
            isLocal={localParticipant && pinnedParticipantIdentity === localParticipant.identity}
            cameraFacing={cameraFacing}
            isSingleOrFullScreen={true}
            showControls={isNativePip ? false : showControls}
            isGridMode={false}
            onToggleLayout={handleToggleLayout}
            onAudioPress={() => {
              resetControlsTimer();
              fetchAudioOutputs(false);
              setIsAudioModalOpen(true);
            }}
            renderAudioIcon={renderCurrentAudioIcon}
            insets={insets}
            onSwitchCamera={handleSwitchCamera}
            onPress={handleScreenTap}
            style={styles.fullScreenCard}
          />
        ) : (
          <ScrollView
            style={styles.gridScrollView}
            contentContainerStyle={[
              styles.gridContentContainer,
              !gridLayout.isScrollable && styles.gridContentCenter,
            ]}
            showsVerticalScrollIndicator={gridLayout.isScrollable}
            bounces={gridLayout.isScrollable}
            overScrollMode="always"
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity
              activeOpacity={1}
              style={[
                styles.grid,
                { gap: gridLayout.gap },
              ]}
              onPress={handleScreenTap}
            >
              {activeMeetingParticipants.map((p) => (
                <ParticipantCard
                  key={`participant-${p.identity}`}
                  participant={p}
                  isLocal={localParticipant && p.identity === localParticipant.identity}
                  cameraFacing={cameraFacing}
                  isSingleOrFullScreen={false}
                  showControls={isNativePip ? false : showControls}
                  isGridMode={true}
                  density={gridLayout.density}
                  onToggleLayout={handleToggleLayout}
                  insets={insets}
                  onSwitchCamera={handleSwitchCamera}
                  onPress={() => handleParticipantPress(p.identity)}
                  style={{
                    width: gridLayout.cardWidth,
                    height: gridLayout.cardHeight,
                    borderRadius: gridLayout.density === 'ultra-compact' ? 12 : gridLayout.density === 'compact' ? 14 : 16,
                  }}
                />
              ))}
            </TouchableOpacity>
          </ScrollView>
        )}
        {activeMeetingParticipants.length === 0 && !activeScreenShare && (
          <View style={styles.waitingContainer}>
            <ActivityIndicator color="#00A8FF" />
            <Text style={styles.waitingText}>Joining Meeting Room...</Text>
          </View>
        )}
      </View>

      {/* --- CHAT DRAWER --- */}
      {!isNativePip && isChatOpen && (
        <View style={[styles.drawer, { paddingTop: insets.top }]}>
          <View style={styles.dragHandleWrapper}><View style={styles.dragHandle} /></View>
          <View style={styles.drawerHeader}>
            <View style={styles.drawerTitleRow}>
              <MessageSquare color="#00A8FF" size={20} />
              <Text style={styles.drawerTitle}>In-Meeting Chat</Text>
            </View>
            <TouchableOpacity onPress={() => setIsChatOpen(false)} style={styles.closeBtn}>
              <X color="#94a3b8" size={22} />
            </TouchableOpacity>
          </View>
          <ScrollView
            ref={chatScrollViewRef}
            style={styles.chatList}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatText}>No messages yet. Start the conversation!</Text>
              </View>
            ) : (
              messages.map(msg => {
                const isSelf = msg.isSelf;

                if (msg.type === 'image') {
                  const cleanedUrl = sanitizeMediaUrl(msg.mediaUrl);
                  return (
                    <View key={msg.id} style={isSelf ? styles.msgRowUser : styles.msgRow}>
                      <View style={[styles.msgHeader, isSelf && { justifyContent: 'flex-end' }]}>
                        {!isSelf && <Text style={[styles.msgName, { color: '#00A8FF' }]}>{msg.sender}</Text>}
                        <Text style={styles.msgTime}>{msg.time}</Text>
                        {isSelf && <Text style={[styles.msgName, { color: '#38bdf8', marginLeft: 6 }]}>You</Text>}
                      </View>
                      <TouchableOpacity
                        style={[styles.mediaBubble, isSelf ? styles.mediaBubbleSelf : styles.mediaBubbleOther]}
                        activeOpacity={0.8}
                        onPress={() => {
                          setPreviewMedia({
                            uri: cleanedUrl,
                            type: 'image',
                            fileName: msg.fileName || msg.text,
                            fileSize: msg.fileSize,
                            sender: isSelf ? 'You' : msg.sender,
                            time: msg.time,
                            text: msg.text,
                          });
                        }}
                      >
                        {cleanedUrl ? (
                          <Image source={{ uri: cleanedUrl }} style={styles.imagePreview} resizeMode="cover" />
                        ) : (
                          <View style={styles.imagePlaceholder}>
                            <ImageIcon color="#00A8FF" size={30} />
                          </View>
                        )}
                        <Text style={styles.mediaCaptionText}>{msg.text}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }

                if (msg.type === 'video') {
                  const cleanedUrl = sanitizeMediaUrl(msg.mediaUrl);
                  return (
                    <View key={msg.id} style={isSelf ? styles.msgRowUser : styles.msgRow}>
                      <View style={[styles.msgHeader, isSelf && { justifyContent: 'flex-end' }]}>
                        {!isSelf && <Text style={[styles.msgName, { color: '#00A8FF' }]}>{msg.sender}</Text>}
                        <Text style={styles.msgTime}>{msg.time}</Text>
                        {isSelf && <Text style={[styles.msgName, { color: '#38bdf8', marginLeft: 6 }]}>You</Text>}
                      </View>
                      <TouchableOpacity
                        style={[styles.mediaBubble, isSelf ? styles.mediaBubbleSelf : styles.mediaBubbleOther]}
                        activeOpacity={0.8}
                        onPress={() => {
                          setPreviewMedia({
                            uri: cleanedUrl,
                            type: 'video',
                            fileName: msg.fileName || msg.text,
                            fileSize: msg.fileSize,
                            sender: isSelf ? 'You' : msg.sender,
                            time: msg.time,
                            duration: msg.duration,
                            text: msg.text,
                          });
                        }}
                      >
                        <View style={styles.videoCard}>
                          <View style={[styles.videoThumbnail, styles.videoPlaceholder]} />
                          <View style={styles.videoOverlay}>
                            <View style={styles.playIconCircle}>
                              <Play color="#FFFFFF" size={18} fill="#FFFFFF" style={{ marginLeft: 2 }} />
                            </View>
                            <View style={styles.videoDurationBadge}>
                              <Text style={styles.videoDurationText}>{msg.duration || '01:20'}</Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.videoDetailsRow}>
                          <Film color="#10B981" size={15} />
                          <Text style={styles.videoFilename} numberOfLines={1}>
                            {msg.fileName || msg.text}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                }

                if (msg.type === 'audio') {
                  const cleanedUrl = sanitizeMediaUrl(msg.mediaUrl);
                  return (
                    <View key={msg.id} style={isSelf ? styles.msgRowUser : styles.msgRow}>
                      <View style={[styles.msgHeader, isSelf && { justifyContent: 'flex-end' }]}>
                        {!isSelf && <Text style={[styles.msgName, { color: '#00A8FF' }]}>{msg.sender}</Text>}
                        <Text style={styles.msgTime}>{msg.time}</Text>
                        {isSelf && <Text style={[styles.msgName, { color: '#38bdf8', marginLeft: 6 }]}>You</Text>}
                      </View>
                      <TouchableOpacity
                        style={[styles.audioBubble, isSelf ? styles.audioBubbleSelf : styles.audioBubbleOther]}
                        activeOpacity={0.8}
                        onPress={() => {
                          setPreviewMedia({
                            uri: cleanedUrl,
                            type: 'audio',
                            fileName: msg.fileName || msg.text,
                            fileSize: msg.fileSize,
                            sender: isSelf ? 'You' : msg.sender,
                            time: msg.time,
                            duration: msg.duration,
                            text: msg.text,
                          });
                        }}
                      >
                        <View style={styles.audioPlayBtn}>
                          <Play color="#FFFFFF" size={16} fill="#FFFFFF" style={{ marginLeft: 2 }} />
                        </View>
                        <View style={styles.audioWaveContainer}>
                          <Text style={styles.audioTitleText} numberOfLines={1}>
                            {msg.fileName || msg.text}
                          </Text>
                          <Text style={styles.audioDurationText}>{msg.duration || '0:35'}</Text>
                        </View>
                        {Boolean(cleanedUrl) && (
                          <View style={{ padding: 6, backgroundColor: 'rgba(245, 158, 11, 0.2)', borderRadius: 8, marginLeft: 8 }}>
                            <Eye color="#F59E0B" size={16} />
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                }

                if (msg.type === 'document') {
                  const cleanedUrl = sanitizeMediaUrl(msg.mediaUrl);
                  return (
                    <View key={msg.id} style={isSelf ? styles.msgRowUser : styles.msgRow}>
                      <View style={[styles.msgHeader, isSelf && { justifyContent: 'flex-end' }]}>
                        {!isSelf && <Text style={[styles.msgName, { color: '#00A8FF' }]}>{msg.sender}</Text>}
                        <Text style={styles.msgTime}>{msg.time}</Text>
                        {isSelf && <Text style={[styles.msgName, { color: '#38bdf8', marginLeft: 6 }]}>You</Text>}
                      </View>
                      <TouchableOpacity
                        style={[styles.docBubble, isSelf ? styles.docBubbleSelf : styles.docBubbleOther]}
                        activeOpacity={0.8}
                        onPress={() => {
                          setPreviewMedia({
                            uri: cleanedUrl,
                            type: 'document',
                            fileName: msg.fileName || msg.text,
                            fileSize: msg.fileSize,
                            sender: isSelf ? 'You' : msg.sender,
                            time: msg.time,
                            text: msg.text,
                          });
                        }}
                      >
                        <View style={styles.docTopRow}>
                          <View style={styles.docIconBox}>
                            <FileText color="#8B5CF6" size={20} />
                          </View>
                          <View style={styles.docInfo}>
                            <Text style={styles.docFileName} numberOfLines={1}>
                              {msg.fileName || msg.text}
                            </Text>
                            <Text style={styles.docFileSize}>{msg.fileSize || '2.4 MB'}</Text>
                          </View>
                          {Boolean(cleanedUrl) && (
                            <View style={{ padding: 6, backgroundColor: 'rgba(0, 168, 255, 0.15)', borderRadius: 8, marginLeft: 8 }}>
                              <Eye color="#00A8FF" size={16} />
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                }

                return (
                  <View key={msg.id} style={msg.isSelf ? styles.msgRowUser : styles.msgRow}>
                    <View style={[styles.msgHeader, msg.isSelf && { justifyContent: 'flex-end' }]}>
                      {!msg.isSelf && <Text style={[styles.msgName, { color: '#00A8FF' }]}>{msg.sender}</Text>}
                      <Text style={styles.msgTime}>{msg.time}</Text>
                      {msg.isSelf && <Text style={[styles.msgName, { color: '#38bdf8', marginLeft: 6 }]}>You</Text>}
                    </View>
                    <LinearGradient
                      colors={msg.isSelf ? ['#00A8FF', '#0066CC'] : ['#1E293B', '#1E293B']}
                      style={msg.isSelf ? styles.msgBubbleUser : styles.msgBubble}
                    >
                      <Text style={styles.msgText}>{msg.text}</Text>
                    </LinearGradient>
                  </View>
                );
              })
            )}
          </ScrollView>

          {isUploadingAttachment && (
            <View style={styles.uploadingProgressBanner}>
              <ActivityIndicator size="small" color="#00A8FF" style={{ marginRight: 8 }} />
              <Text style={styles.uploadingProgressText}>
                Uploading attachment ({uploadProgress}%)...
              </Text>
            </View>
          )}

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
          >
            <View style={[styles.chatInputRow, { marginBottom: insets.bottom + 12 }]}>
              <TouchableOpacity
                style={styles.attachBtn}
                onPress={handlePickAndSendAttachment}
                disabled={isUploadingAttachment}
                activeOpacity={0.7}
              >
                <Paperclip color="#00A8FF" size={20} />
              </TouchableOpacity>
              <TextInput
                style={styles.chatInput}
                placeholder={t('meeting.typeMessage')}
                placeholderTextColor="#64748b"
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={sendChatMessage}
                returnKeyType="send"
                blurOnSubmit={false}
              />
              <TouchableOpacity
                style={[styles.sendBtn, !chatInput.trim() && { opacity: 0.45 }]}
                onPress={sendChatMessage}
                disabled={!chatInput.trim()}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.7}
              >
                <Send color="#FFF" size={18} />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}

      {/* --- PARTICIPANTS DRAWER --- */}
      {!isNativePip && isParticipantsOpen && (
        <View style={[styles.drawer, { paddingTop: insets.top }]}>
          <View style={styles.dragHandleWrapper}><View style={styles.dragHandle} /></View>
          <View style={styles.drawerHeader}>
            <View>
              <Text style={styles.drawerTitle}>{t('meeting.participants')} ({activeMeetingParticipants.length})</Text>
            </View>
            <TouchableOpacity onPress={() => setIsParticipantsOpen(false)} style={styles.closeBtn}>
              <X color="#94a3b8" size={22} />
            </TouchableOpacity>
          </View>

          <View style={styles.hostActionRow}>
            <TouchableOpacity
              style={[styles.muteAllBtn, !isHost && { opacity: 0.5 }]}
              onPress={handleMuteAllPress}
              activeOpacity={0.7}
            >
              <MicOff color="#ef4444" size={16} />
              <Text style={styles.muteAllText}>{t('meeting.muteAll')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.inviteOthersBtn}
              onPress={() => setIsInviteModalOpen(true)}
              activeOpacity={0.7}
            >
              <UserPlus color="#00A8FF" size={16} />
              <Text style={styles.inviteOthersText}>{t('meeting.inviteOthers')}</Text>
            </TouchableOpacity>
          </View>

          {/* Waiting Room Section for Host */}
          {isHost && waitingGuests.length > 0 && (
            <View style={styles.waitingDrawerCard}>
              <View style={styles.waitingDrawerHeader}>
                <View style={styles.waitingDrawerTitleRow}>
                  <Clock color="#00A8FF" size={15} />
                  <Text style={styles.waitingDrawerTitle}>
                    {t('meeting.waitingRoomTitle')} ({waitingGuests.length})
                  </Text>
                </View>
                {waitingGuests.length > 1 && (
                  <TouchableOpacity
                    style={styles.admitAllBtn}
                    onPress={handleAdmitAll}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.admitAllBtnText}>{t('meeting.admitAll')}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.waitingDrawerList}>
                {waitingGuests.map(g => (
                  <View key={g.identity} style={styles.waitingDrawerItem}>
                    <View style={styles.waitingDrawerAvatar}>
                      <Text style={[styles.waitingDrawerAvatarText, getAvatarTextStyle(g.name, 14)]}>
                        {getInitials(g.name)}
                      </Text>
                    </View>
                    <View style={styles.waitingDrawerInfo}>
                      <Text style={styles.waitingDrawerName} numberOfLines={1}>{g.name}</Text>
                      <Text style={styles.waitingDrawerStatus}>{t('meeting.waitingToJoin')}</Text>
                    </View>
                    <View style={styles.waitingDrawerActions}>
                      <TouchableOpacity
                        style={styles.drawerDenyBtn}
                        onPress={() => handleDenyGuest(g.identity)}
                        activeOpacity={0.7}
                      >
                        <X color="#ef4444" size={15} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.drawerAdmitBtn}
                        onPress={() => handleAdmitGuest(g.identity)}
                        activeOpacity={0.7}
                      >
                        <Check color="#FFF" size={14} />
                        <Text style={styles.drawerAdmitText}>{t('meeting.admit')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          <ScrollView style={styles.partList} showsVerticalScrollIndicator={false}>
            {activeMeetingParticipants.map(p => (
              <View key={p.sid || p.identity} style={[styles.partItem, p.identity === localParticipant?.identity && styles.partItemBg]}>
                <View style={styles.partAvatarContainer}>
                  <View style={[styles.partAvatar, { borderColor: p.isCameraEnabled ? '#10b981' : '#ef4444', borderWidth: 1 }]}>
                    <Text style={[styles.partAvatarText, getAvatarTextStyle(p.name || p.identity, 14)]}>
                      {getInitials(p.name || p.identity)}
                    </Text>
                  </View>
                </View>
                <View style={styles.partInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.partName}>{p.name || p.identity}</Text>
                    {p.identity === localParticipant?.identity && (
                      <View style={styles.meBadge}><Text style={styles.meBadgeText}>{t('meeting.you')}</Text></View>
                    )}
                  </View>
                  <Text style={styles.partRole}>{t('meeting.members')}</Text>
                </View>
                <View style={styles.partIcons}>
                  {isHost && p.identity !== localParticipant?.identity && !checkIsParticipantHost(p) && (
                    <TouchableOpacity
                      style={styles.partRemoveBtn}
                      onPress={() => handlePromptRemoveParticipant(p)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Remove participant"
                    >
                      <UserX color="#ef4444" size={17} />
                    </TouchableOpacity>
                  )}
                  <Mic color={p.isMicrophoneEnabled ? "#10b981" : "#ef4444"} size={18} style={{ marginRight: 8 }} />
                  <LucideVideo color={p.isCameraEnabled ? "#10b981" : "#ef4444"} size={18} />
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* --- BOTTOM CONTROLS --- */}
      {!isNativePip && (
        <Animated.View
          pointerEvents={showControls ? 'auto' : 'none'}
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + 14,
              opacity: controlsOpacity,
              transform: [{ translateY: footerTranslateY }],
            },
          ]}
        >
          <View style={styles.controlsDock}>
            <TouchableOpacity
              style={styles.controlItem}
              onPress={() => {
                resetControlsTimer();
                handleToggleMic();
              }}
            >
              <View style={[styles.controlIconBox, isMicMuted && styles.controlIconBoxMuted]}>
                {isMicMuted ? <MicOff color="#ef4444" size={22} /> : <Mic color="#10b981" size={22} />}
              </View>
              <Text style={styles.controlLabel}>{isMicMuted ? t('meeting.unmute') : t('meeting.mute')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlItem}
              onPress={() => {
                resetControlsTimer();
                handleToggleCamera();
              }}
            >
              <View style={[styles.controlIconBox, isCameraOff && styles.controlIconBoxMuted]}>
                {isCameraOff ? <VideoOff color="#ef4444" size={22} /> : <LucideVideo color="#10b981" size={22} />}
              </View>
              <Text style={styles.controlLabel}>{isCameraOff ? t('meeting.startVideo') : t('meeting.stopVideo')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlItem}
              onPress={() => {
                resetControlsTimer();
                setIsChatOpen(true);
                setUnreadChatCount(0);
              }}
            >
              <View style={styles.controlIconBox}>
                <MessageSquare color="#00A8FF" size={22} />
                {unreadChatCount > 0 && (
                  <View style={styles.chatBadge}>
                    <Text style={styles.chatBadgeText}>
                      {unreadChatCount > 99 ? '99+' : unreadChatCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.controlLabel}>{t('meeting.chat')}</Text>
            </TouchableOpacity>

            {(allParticipants.length > 1 || isScreenSharing) && (
              <TouchableOpacity
                style={[styles.controlItem, isScreenShareToggling && { opacity: 0.6 }]}
                onPress={() => {
                  if (isScreenShareActionInFlight.current || screenShareLifecycleRef.current !== 'idle') return;
                  resetControlsTimer();
                  handleToggleScreenShare();
                }}
                disabled={isScreenShareToggling}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.controlIconBox,
                    isScreenSharing && {
                      backgroundColor: 'rgba(239, 68, 68, 0.2)',
                      borderColor: '#ef4444',
                    },
                  ]}
                >
                  {isScreenShareToggling ? (
                    <ActivityIndicator size="small" color={isScreenSharing ? '#ef4444' : '#00A8FF'} />
                  ) : isScreenSharing ? (
                    <MonitorOff color="#ef4444" size={22} />
                  ) : (
                    <MonitorUp
                      color="#94a3b8"
                      size={22}
                    />
                  )}
                </View>
                <Text
                  style={[
                    styles.controlLabel,
                    isScreenSharing && { color: '#ef4444', fontFamily: 'PlusJakartaSans-Bold' },
                  ]}
                >
                  {isScreenSharing ? t('meeting.stopShare') : t('meeting.share')}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.controlItem}
              onPress={() => {
                resetControlsTimer();
                setIsParticipantsOpen(true);
              }}
            >
              <View style={styles.controlIconBox}>
                <Users color="#00A8FF" size={22} />
                <View style={[styles.badge, { backgroundColor: isHost && waitingGuests.length > 0 ? '#f59e0b' : '#00A8FF' }]}>
                  <Text style={styles.badgeText}>
                    {isHost && waitingGuests.length > 0 ? `+${waitingGuests.length}` : activeMeetingParticipants.length}
                  </Text>
                </View>
              </View>
              <Text style={styles.controlLabel}>{t('meeting.members')}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* --- UNIFIED FULL-SCREEN TAP-TO-SHOW-CONTROLS SURFACE --- */}
      {!showControls && !isNativePip && !isMinimized && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleScreenTap}
          style={styles.fullScreenTapSurface}
        />
      )}

      {/* --- MEETING INFO MODAL --- */}
      <Modal
        visible={!isNativePip && isInfoModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsInfoModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Meeting Information</Text>
              <TouchableOpacity onPress={() => setIsInfoModalOpen(false)}>
                <X color="#94a3b8" size={24} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Meeting Title</Text>
                <Text style={styles.infoValue}>{displayTitle}</Text>
              </View>

              <View style={styles.linkSection}>
                <Text style={styles.infoLabel}>Invite Link</Text>
                <View style={[styles.linkDisplayBox, copied && { borderColor: '#10b981' }]}>
                  <Text style={styles.linkDisplayText} numberOfLines={1}>{meetingLink}</Text>
                  <TouchableOpacity onPress={() => copyToClipboard(meetingLink)}>
                    {copied ? <Check color="#10b981" size={20} /> : <Copy color="#00A8FF" size={20} />}
                  </TouchableOpacity>
                </View>
                <Text style={styles.copyHint}>
                  {copied ? 'Copied to clipboard!' : 'Share this link to invite others'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- LEAVE CONFIRMATION MODAL --- */}
      <Modal
        visible={!isNativePip && isLeaveModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsLeaveModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalDragHandle} />
            <Text style={styles.leaveModalTitle}>
              {isHost ? t('meeting.endConfirm') : t('meeting.leaveConfirm')}
            </Text>
            <Text style={styles.leaveModalSub}>
              {isHost ? t('meeting.endConfirmHost') : t('meeting.stay')}
            </Text>

            <View style={styles.leaveModalActions}>
              <TouchableOpacity
                style={[styles.confirmLeaveBtn, isHost && { backgroundColor: '#ef4444' }]}
                onPress={handleLeaveOrEndMeeting}
              >
                <Text style={styles.confirmLeaveText}>
                  {isHost ? t('meeting.endCallHost') : t('meeting.leave')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelLeaveBtn}
                onPress={() => setIsLeaveModalOpen(false)}
              >
                <Text style={styles.cancelLeaveText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* --- INVITE OTHERS MODAL --- */}
      <Modal
        visible={!isNativePip && isInviteModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsInviteModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.inviteModalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalDragHandle} />

            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Invite to Meeting</Text>
                <Text style={styles.modalSubtitle}>Search by username or invite registered contacts</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsInviteModalOpen(false)}
                style={styles.closeBtn}
              >
                <X color="#94a3b8" size={20} />
              </TouchableOpacity>
            </View>

            {/* Username Search Input */}
            <View style={styles.inviteSearchBox}>
              <Search color="#00A8FF" size={18} style={{ marginRight: 10 }} />
              <TextInput
                style={styles.inviteSearchInput}
                placeholder="Enter username (e.g. @imtiaz-cnits)..."
                placeholderTextColor="#64748b"
                value={inviteSearchQuery}
                onChangeText={setInviteSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {inviteSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setInviteSearchQuery('')}>
                  <X color="#64748b" size={16} />
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Action when typing custom username */}
            {inviteSearchQuery.trim().length > 0 && (
              <TouchableOpacity
                style={styles.quickInviteRow}
                onPress={() => handleSendInvite(inviteSearchQuery)}
                activeOpacity={0.7}
              >
                <View style={styles.quickInviteIcon}>
                  <UserPlus color="#00A8FF" size={16} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.quickInviteTitle}>
                    Invite "@{inviteSearchQuery.replace(/^@/, '').trim()}"
                  </Text>
                  <Text style={styles.quickInviteSub}>Tap to send direct meeting invite</Text>
                </View>
                <View style={styles.inviteBtnBadge}>
                  <Text style={styles.inviteBtnText}>Send</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Registered Users List */}
            <Text style={styles.sectionHeaderLabel}>REGISTERED USERS</Text>
            {isLoadingUsers ? (
              <View style={styles.loadingUsersBox}>
                <ActivityIndicator color="#00A8FF" size="small" />
                <Text style={styles.loadingUsersText}>Loading users...</Text>
              </View>
            ) : filteredInviteUsers.length === 0 ? (
              <View style={styles.emptyUsersBox}>
                <Text style={styles.emptyUsersText}>
                  {inviteSearchQuery.trim()
                    ? `No users found matching "${inviteSearchQuery}". Use the card above to invite directly.`
                    : 'No users available.'}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.inviteUsersList}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {filteredInviteUsers.map((user) => {
                  const isInvited = invitedUsernames.has(user.username);
                  return (
                    <View key={user.id} style={styles.inviteUserItem}>
                      <View style={styles.inviteAvatar}>
                        <Text style={[styles.inviteAvatarText, getAvatarTextStyle(user.name || user.username, 14)]}>
                          {getInitials(user.name || user.username)}
                        </Text>
                      </View>
                      <View style={styles.inviteUserInfo}>
                        <Text style={styles.inviteUserName}>{user.name}</Text>
                        <Text style={styles.inviteUserHandle}>@{user.username}</Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.inviteActionButton,
                          isInvited && styles.inviteActionButtonSuccess,
                        ]}
                        onPress={() => handleSendInvite(user.username, user.name)}
                        disabled={isInvited}
                        activeOpacity={0.7}
                      >
                        {isInvited ? (
                          <>
                            <Check color="#10b981" size={14} style={{ marginRight: 4 }} />
                            <Text style={styles.inviteActionButtonTextSuccess}>Invited</Text>
                          </>
                        ) : (
                          <>
                            <UserPlus color="#00A8FF" size={14} style={{ marginRight: 4 }} />
                            <Text style={styles.inviteActionButtonText}>Invite</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {/* Bottom Quick Share Link Section */}
            <View style={styles.inviteFooterShare}>
              <View style={styles.inviteFooterLeft}>
                <Text style={styles.inviteFooterTitle}>Meeting Link</Text>
                <Text style={styles.inviteFooterCode} numberOfLines={1}>
                  {meetingLink}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.inviteShareBtn}
                onPress={handleShareInviteLink}
                activeOpacity={0.7}
              >
                <Copy color="#FFF" size={16} />
                <Text style={styles.inviteShareBtnText}>{copied ? 'Copied' : 'Copy'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- AUDIO OUTPUT DEVICE MODAL --- */}
      <Modal
        visible={!isNativePip && isAudioModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAudioModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.audioModalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{t('meeting.outputDevices')}</Text>
                <Text style={styles.modalSubtitle}>{t('meeting.outputDevices')}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity
                  style={styles.refreshIconBtn}
                  onPress={() => fetchAudioOutputs(false)}
                  activeOpacity={0.7}
                  disabled={isRefreshingOutputs}
                >
                  {isRefreshingOutputs ? (
                    <ActivityIndicator size="small" color="#00A8FF" />
                  ) : (
                    <RefreshCw color="#94a3b8" size={18} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setIsAudioModalOpen(false)}
                >
                  <X color="#94a3b8" size={20} />
                </TouchableOpacity>
              </View>
            </View>

            {/* List of Available Output Devices */}
            <View style={styles.audioDeviceList}>
              {availableOutputs.map((deviceId) => {
                const config = getAudioDeviceDisplay(deviceId);
                const IconComp = config.icon;
                const isSelected = selectedAudioOutput === deviceId;

                return (
                  <TouchableOpacity
                    key={deviceId}
                    style={[
                      styles.audioDeviceItem,
                      isSelected && styles.audioDeviceItemSelected,
                    ]}
                    onPress={() => handleSelectAudioOutput(deviceId)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.audioDeviceIconBox,
                      isSelected && styles.audioDeviceIconBoxSelected,
                    ]}>
                      <IconComp
                        color={isSelected ? '#00A8FF' : '#94a3b8'}
                        size={22}
                      />
                    </View>

                    <View style={styles.audioDeviceInfo}>
                      <Text style={[
                        styles.audioDeviceName,
                        isSelected && styles.audioDeviceNameSelected,
                      ]}>
                        {config.name}
                      </Text>
                      <Text style={styles.audioDeviceDesc}>
                        {config.description}
                      </Text>
                    </View>

                    <View style={styles.audioDeviceCheckContainer}>
                      {isSelected ? (
                        <View style={styles.audioActiveCheckBadge}>
                          <Check color="#FFF" size={14} />
                        </View>
                      ) : (
                        <View style={styles.audioUncheckedCircle} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Tip Footer */}
            <View style={styles.audioTipFooter}>
              <Text style={styles.audioTipText}>
                {t('meeting.audioDeviceTip')}
              </Text>
            </View>
          </View>
        </View>
      </Modal>

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050B14', alignItems: 'center', justifyContent: 'center' },
  reconnectingPill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(11, 23, 40, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.4)',
    zIndex: 9999,
    elevation: 8,
  },
  reconnectingPillText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  contentContainer: { flex: 1, width: '100%', backgroundColor: '#050B14' },
  fullScreenTapSurface: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 25,
  },
  loadingOverlay: { flex: 1, backgroundColor: '#050B14', alignItems: 'center', justifyContent: 'center', gap: 15 },
  loadingText: { color: '#FFF', fontSize: 16, fontFamily: 'PlusJakartaSans-Bold' },
  subLoadingText: { color: '#64748b', fontSize: 12, fontFamily: 'PlusJakartaSans-Medium' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.06)', backgroundColor: '#050B14', zIndex: 20 },
  headerLeft: { flexDirection: 'row', gap: 8 },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255, 255, 255, 0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  headerCenter: { alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meetingTitle: { color: '#FFF', fontSize: 13, fontFamily: 'PlusJakartaSans-Bold' },
  timerText: { color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
  leaveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(239, 68, 68, 0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.35)' },
  leaveText: { color: '#ef4444', fontSize: 12, fontFamily: 'PlusJakartaSans-Bold' },
  gridContainer: { flex: 1, width: '100%', height: '100%', backgroundColor: '#050B14' },
  fullScreenGridContainer: { padding: 0, backgroundColor: '#050B14' },
  multiGridContainer: { padding: 10, backgroundColor: '#050B14' },
  gridScrollView: { flex: 1, width: '100%' },
  gridContentContainer: { flexGrow: 1, paddingVertical: 2 },
  gridContentCenter: { justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', alignContent: 'center', backgroundColor: '#050B14', minHeight: '100%', width: '100%' },
  participantCard: { width: (SCREEN_WIDTH - 30) / 2, height: '48%', backgroundColor: '#0B1728', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  videoNamePill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 11, 20, 0.72)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    maxWidth: '85%',
    zIndex: 2,
  },
  videoNameText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-Bold',
    letterSpacing: -0.2,
  },
  fullScreenCard: { width: '100%', height: '100%', borderRadius: 0, borderWidth: 0, backgroundColor: '#050B14', overflow: 'hidden' },
  activeSpeakerCard: { borderColor: '#10b981', borderWidth: 2 },
  cardVideo: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  // Floating Presenter Card on Screen Share
  floatingPresenterCard: {
    position: 'absolute',
    right: 16,
    width: 110,
    height: 145,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(11, 23, 40, 0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingPresenterCardCollapsed: {
    width: 'auto',
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  floatingPresenterTouchable: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  floatingPresenterMediaBox: {
    flex: 1,
    width: '100%',
    position: 'relative',
    backgroundColor: '#050B14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingPresenterVideo: {
    width: '100%',
    height: '100%',
  },
  floatingPresenterAvatarBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingPresenterAvatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0, 168, 255, 0.2)',
    borderWidth: 1,
    borderColor: '#00A8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircleSpeaking: {
    borderColor: '#10b981',
    borderWidth: 2,
  },
  floatingPresenterAvatarText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  floatingPresenterRoleBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  floatingPresenterHostBadge: {
    backgroundColor: 'rgba(0, 168, 255, 0.85)',
  },
  floatingPresenterRoleText: {
    color: '#FFF',
    fontSize: 8,
    fontFamily: 'PlusJakartaSans-Bold',
    letterSpacing: 0.5,
  },
  floatingPresenterMicBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(5, 11, 20, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingPresenterNameBanner: {
    width: '100%',
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(5, 11, 20, 0.85)',
    alignItems: 'center',
  },
  floatingPresenterNameText: {
    color: '#FFF',
    fontSize: 10,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  floatingPresenterCollapsedContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  floatingPresenterCollapsedName: {
    color: '#FFF',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-SemiBold',
    maxWidth: 100,
  },
  miniAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#00A8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAvatarSpeaking: {
    backgroundColor: '#10b981',
  },
  miniAvatarText: {
    color: '#FFF',
    fontSize: 10,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  gridScreenShareCard: {
    width: '100%',
    height: 200,
    marginBottom: 8,
    borderColor: '#00A8FF',
    borderWidth: 1.5,
  },
  gridScreenShareBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(5, 11, 20, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.4)',
  },
  gridScreenShareText: {
    color: '#FFF',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  gridScreenShareLocalPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#070d18',
  },
  gridScreenShareIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 168, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.4)',
  },
  gridScreenShareLocalTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Bold',
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 3,
  },
  gridScreenShareLocalSubtitle: {
    color: '#94a3b8',
    fontSize: 10.5,
    fontFamily: 'PlusJakartaSans-Medium',
    lineHeight: 15,
    textAlign: 'center',
    marginBottom: 8,
    paddingBottom: 2,
  },
  gridScreenShareTapHint: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  gridScreenShareTapHintText: {
    color: '#38bdf8',
    fontSize: 10,
    fontFamily: 'PlusJakartaSans-SemiBold',
    lineHeight: 14,
    paddingBottom: 1,
  },
  cardOverlay: { ...StyleSheet.absoluteFillObject, paddingHorizontal: 14, justifyContent: 'space-between' },
  cardTopRow: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 50,
    elevation: 10,
  },
  leftBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  hostBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.45)',
  },
  hostBadgeText: {
    color: '#10b981',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  youBadge: {
    backgroundColor: 'rgba(0, 168, 255, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.45)',
  },
  youBadgeText: {
    color: '#00A8FF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  screenShareBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0, 168, 255, 0.25)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0, 168, 255, 0.4)' },
  screenShareBadgeText: { color: '#00A8FF', fontSize: 12, fontFamily: 'PlusJakartaSans-Bold' },
  participantScreenShareBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 168, 255, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.45)',
  },
  participantScreenShareBadgeText: {
    color: '#00A8FF',
    fontFamily: 'PlusJakartaSans-SemiBold',
    fontSize: 10.5,
  },
  screenShareStopBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  presentationContainer: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    height: '100%',
    backgroundColor: '#050B14',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  screenShareStageContainer: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    height: '100%',
    backgroundColor: '#050B14',
    position: 'relative',
    overflow: 'hidden',
  },
  fullStageVideo: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    backgroundColor: '#050B14',
  },
  participantThumbnailStripWrapper: {
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: 'rgba(5, 11, 20, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 6,
  },
  participantThumbnailStrip: {
    paddingHorizontal: 10,
    gap: 8,
    alignItems: 'center',
  },
  stripParticipantCard: {
    width: 84,
    height: 96,
    borderRadius: 10,
    overflow: 'hidden',
  },
  screenShareStopBadgeBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  screenSharePresenterCard: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#050B14',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  screenSharePresenterGlow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(0, 168, 255, 0.08)',
    shadowColor: '#00A8FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 60,
  },
  screenSharePresenterIconWrapper: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  screenSharePresenterPulseRing2: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 168, 255, 0.15)',
  },
  screenSharePresenterPulseRing1: {
    position: 'absolute',
    width: 102,
    height: 102,
    borderRadius: 51,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 168, 255, 0.3)',
  },
  screenSharePresenterIconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00A8FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  screenShareLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  screenShareLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 8,
  },
  screenShareLiveBadgeText: {
    color: '#10b981',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
    letterSpacing: 0.5,
  },
  screenSharePresenterTitle: {
    color: '#FFF',
    fontSize: 20,
    fontFamily: 'PlusJakartaSans-Bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  screenSharePresenterDesc: {
    color: '#94a3b8',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 12,
  },
  screenSharePresenterStopBtn: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  screenSharePresenterStopBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  screenSharePresenterStopBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  screenShareLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050B14',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  screenShareLoadingText: {
    color: '#94a3b8',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  floatingScreenShareBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 99,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(11, 23, 40, 0.94)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginRight: 8,
  },
  floatingBannerText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  floatingStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  floatingStopBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  rightBadgeActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 'auto' },
  actionIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(11, 23, 40, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },
  cardBottomRow: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 50,
    elevation: 10,
  },
  namePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(11, 23, 40, 0.78)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  participantName: {
    color: '#FFF',
    fontSize: 13,
    flex: 1,
    marginRight: 8,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  waveContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginRight: 6 },
  waveBar: { width: 2, backgroundColor: '#10b981', borderRadius: 1 },
  avatarContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fullScreenAvatarContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  largeAvatarCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFF', fontSize: 20, fontFamily: 'PlusJakartaSans-Bold' },
  largeAvatarText: { color: '#FFF', fontSize: 32, fontFamily: 'PlusJakartaSans-Bold' },
  largeAvatarNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  largeAvatarName: { color: '#FFFFFF', fontSize: 18, fontFamily: 'PlusJakartaSans-Bold', letterSpacing: -0.2 },
  gridAvatarNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingHorizontal: 8 },
  gridAvatarName: { color: '#FFFFFF', fontSize: 15, fontFamily: 'PlusJakartaSans-Bold', letterSpacing: -0.2 },
  roleSubtext: { color: '#94a3b8', fontSize: 9, marginTop: 8, fontFamily: 'PlusJakartaSans-Medium' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#050B14', borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.06)', zIndex: 20 },
  controlsDock: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingTop: 10 },
  controlItem: { alignItems: 'center', gap: 6 },
  controlIconBox: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  controlIconBoxMuted: { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  controlLabel: { color: '#94a3b8', fontSize: 10, fontFamily: 'PlusJakartaSans-SemiBold' },
  badge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { color: '#FFF', fontSize: 9, fontFamily: 'PlusJakartaSans-Bold' },
  chatBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#0B1728',
  },
  chatBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: 'PlusJakartaSans-Bold',
    includeFontPadding: false,
  },
  waitingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  waitingText: { color: '#94a3b8', fontSize: 14, fontFamily: 'PlusJakartaSans-Medium' },

  // Drawer Styles
  drawer: { position: 'absolute', inset: 0, backgroundColor: '#091322', zIndex: 100, paddingHorizontal: 20 },
  dragHandleWrapper: { alignItems: 'center', paddingVertical: 12 },
  dragHandle: { width: 48, height: 4, backgroundColor: '#334155', borderRadius: 2 },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.1)' },
  drawerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  drawerTitle: { color: '#FFF', fontSize: 18, fontFamily: 'PlusJakartaSans-ExtraBold' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255, 255, 255, 0.05)', alignItems: 'center', justifyContent: 'center' },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyChatText: { color: '#64748b', fontSize: 13, textAlign: 'center', fontFamily: 'PlusJakartaSans-Medium' },
  chatList: { flex: 1, marginTop: 10 },

  chatInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 10, backgroundColor: '#0B1728', padding: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
  attachBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  chatInput: { flex: 1, height: 48, color: '#FFF', paddingHorizontal: 10, fontSize: 14, fontFamily: 'PlusJakartaSans-Medium' },
  sendBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#00A8FF', alignItems: 'center', justifyContent: 'center' },

  attachSheet: {
    backgroundColor: '#0B1728',
    borderRadius: 18,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  attachSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  attachSheetTitle: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  attachSheetClose: {
    padding: 4,
  },
  attachGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  attachOption: {
    alignItems: 'center',
    gap: 6,
  },
  attachOptionIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  attachOptionLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  uploadingProgressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 168, 255, 0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
  },
  uploadingProgressText: {
    color: '#00A8FF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  // Attachment creator modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: '#0B1728',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pickerModalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  pickerModalClose: {
    padding: 4,
  },
  customAttachForm: {
    gap: 10,
  },
  limitBadgeRow: {
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  limitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 168, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  limitBadgeText: {
    color: '#00A8FF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  chooseFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 168, 255, 0.1)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(0, 168, 255, 0.4)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  chooseFileBtnText: {
    color: '#00A8FF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  inputErrorBorder: {
    borderColor: '#EF4444',
  },
  errorAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  errorAlertText: {
    color: '#EF4444',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Medium',
    flex: 1,
  },
  customAttachLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  customAttachInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  customAttachActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  customAttachCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  customAttachCancelText: {
    color: '#94a3b8',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  customAttachSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#00A8FF',
  },
  customAttachSendText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  // Media bubbles in chat
  mediaBubble: {
    width: 220,
    borderRadius: 16,
    overflow: 'hidden',
    padding: 8,
  },
  mediaBubbleSelf: {
    backgroundColor: '#0B233D',
    borderTopRightRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
  },
  mediaBubbleOther: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  imagePreview: {
    width: '100%',
    height: 130,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  imagePlaceholder: {
    width: '100%',
    height: 100,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 168, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaCaptionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Medium',
    marginTop: 8,
    marginHorizontal: 4,
  },
  videoCard: {
    position: 'relative',
    width: '100%',
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
  },
  videoPlaceholder: {
    backgroundColor: '#0F172A',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 168, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoDurationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoDurationText: {
    color: '#FFF',
    fontSize: 10,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  videoDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginHorizontal: 4,
  },
  videoFilename: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  audioBubble: {
    width: 220,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    gap: 10,
  },
  audioBubbleSelf: {
    backgroundColor: '#0B233D',
    borderTopRightRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
  },
  audioBubbleOther: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  audioPlayBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioWaveContainer: {
    flex: 1,
  },
  audioTitleText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  audioDurationText: {
    color: '#94a3b8',
    fontSize: 10,
    fontFamily: 'PlusJakartaSans-Medium',
    marginTop: 2,
  },
  docBubble: {
    width: 220,
    padding: 12,
    borderRadius: 16,
  },
  docBubbleSelf: {
    backgroundColor: '#0B233D',
    borderTopRightRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
  },
  docBubbleOther: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  docTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  docIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  docInfo: {
    flex: 1,
  },
  docFileName: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  docFileSize: {
    color: '#94a3b8',
    fontSize: 10,
    fontFamily: 'PlusJakartaSans-Medium',
    marginTop: 2,
  },

  hostActionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  muteAllBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)' },
  muteAllText: { color: '#ef4444', fontSize: 13, fontFamily: 'PlusJakartaSans-Bold' },
  inviteOthersBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(0, 168, 255, 0.15)', paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0, 168, 255, 0.3)' },
  inviteOthersText: { color: '#00A8FF', fontSize: 13, fontFamily: 'PlusJakartaSans-Bold' },

  partList: { flex: 1, marginTop: 20 },
  partItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 18, marginBottom: 12 },
  partItemBg: { backgroundColor: 'rgba(255, 255, 255, 0.03)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
  partAvatarContainer: { position: 'relative' },
  partAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  partAvatarText: { color: '#FFF', fontSize: 14, fontFamily: 'PlusJakartaSans-Bold' },
  partInfo: { flex: 1, marginLeft: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  partName: { color: '#FFF', fontSize: 14, fontFamily: 'PlusJakartaSans-Bold' },
  meBadge: { backgroundColor: 'rgba(0, 168, 255, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 8 },
  meBadgeText: { color: '#38bdf8', fontSize: 9, fontFamily: 'PlusJakartaSans-Bold' },
  partRole: { color: '#64748b', fontSize: 11, marginTop: 2, fontFamily: 'PlusJakartaSans-Medium' },
  partIcons: { flexDirection: 'row', alignItems: 'center' },
  partRemoveBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  msgRow: { marginBottom: 20, alignItems: 'flex-start' },
  msgRowUser: { marginBottom: 20, alignItems: 'flex-end' },
  msgHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  msgName: { fontSize: 12, fontFamily: 'PlusJakartaSans-Bold' },
  msgTime: { color: '#475569', fontSize: 10, marginLeft: 8, fontFamily: 'PlusJakartaSans-Medium' },
  msgBubble: { backgroundColor: 'rgba(255, 255, 255, 0.08)', padding: 14, borderRadius: 20, borderTopLeftRadius: 4, maxWidth: '85%', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
  msgBubbleUser: { padding: 14, borderRadius: 20, borderTopRightRadius: 4, maxWidth: '85%', shadowColor: '#00A8FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  msgText: { color: '#FFF', fontSize: 13, lineHeight: 18, fontFamily: 'PlusJakartaSans-Medium' },

  // Info Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#0B1728', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 24, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  modalDragHandle: { width: 40, height: 4, backgroundColor: '#334155', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { color: '#FFF', fontSize: 18, fontFamily: 'PlusJakartaSans-Bold' },
  modalBody: { gap: 20, marginBottom: 10 },
  infoRow: { gap: 6 },
  infoLabel: { color: '#94a3b8', fontSize: 12, fontFamily: 'PlusJakartaSans-Bold', textTransform: 'uppercase', letterSpacing: 1 },
  infoValue: { color: '#FFF', fontSize: 15, fontFamily: 'PlusJakartaSans-SemiBold' },
  linkSection: { gap: 10 },
  linkDisplayBox: { height: 56, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(0, 168, 255, 0.2)' },
  linkDisplayText: { color: '#00A8FF', fontSize: 14, fontFamily: 'monospace', flex: 1, marginRight: 12 },
  copyHint: { color: '#64748b', fontSize: 11, fontFamily: 'PlusJakartaSans-Medium', textAlign: 'center' },

  // Leave Modal Styles
  leaveModalTitle: { color: '#FFF', fontSize: 18, fontFamily: 'PlusJakartaSans-Bold', textAlign: 'center', marginBottom: 8 },
  leaveModalSub: { color: '#94a3b8', fontSize: 14, fontFamily: 'PlusJakartaSans-Medium', textAlign: 'center', marginBottom: 24 },
  leaveModalActions: { gap: 12 },
  confirmLeaveBtn: { backgroundColor: '#ef4444', height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#ef4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  confirmLeaveText: { color: '#FFF', fontSize: 16, fontFamily: 'PlusJakartaSans-Bold' },
  cancelLeaveBtn: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cancelLeaveText: { color: '#94a3b8', fontSize: 16, fontFamily: 'PlusJakartaSans-Bold' },

  switchCameraBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginLeft: 'auto',
  },

  // Invite Modal Styles
  inviteModalContent: {
    backgroundColor: '#0B1728',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: '85%',
  },
  modalSubtitle: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  inviteSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 12,
  },
  inviteSearchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  quickInviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 168, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.25)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  quickInviteIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0, 168, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickInviteTitle: {
    color: '#FFF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  quickInviteSub: {
    color: '#00A8FF',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  inviteBtnBadge: {
    backgroundColor: '#00A8FF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  inviteBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  sectionHeaderLabel: {
    color: '#64748b',
    fontSize: 10,
    fontFamily: 'PlusJakartaSans-Bold',
    letterSpacing: 1,
    marginBottom: 8,
  },
  loadingUsersBox: {
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingUsersText: {
    color: '#94a3b8',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  emptyUsersBox: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyUsersText: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-Medium',
  },
  inviteUsersList: {
    maxHeight: 240,
    marginBottom: 14,
  },
  inviteUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  inviteAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
  },
  inviteAvatarText: {
    color: '#00A8FF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  inviteUserInfo: {
    flex: 1,
    marginLeft: 12,
  },
  inviteUserName: {
    color: '#FFF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  inviteUserHandle: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  inviteActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 168, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
  },
  inviteActionButtonSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  inviteActionButtonText: {
    color: '#00A8FF',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  inviteActionButtonTextSuccess: {
    color: '#10b981',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  inviteFooterShare: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  inviteFooterLeft: {
    flex: 1,
    marginRight: 10,
  },
  inviteFooterTitle: {
    color: '#64748b',
    fontSize: 10,
    fontFamily: 'PlusJakartaSans-Bold',
    textTransform: 'uppercase',
  },
  inviteFooterCode: {
    color: '#00A8FF',
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  inviteShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#00A8FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  inviteShareBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  // Audio Modal Styles
  audioModalContent: {
    backgroundColor: '#0B1728',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  refreshIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioDeviceList: {
    gap: 10,
    marginVertical: 12,
  },
  audioDeviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  audioDeviceItemSelected: {
    backgroundColor: 'rgba(0, 168, 255, 0.08)',
    borderColor: '#00A8FF',
  },
  audioDeviceIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  audioDeviceIconBoxSelected: {
    backgroundColor: 'rgba(0, 168, 255, 0.2)',
  },
  audioDeviceInfo: {
    flex: 1,
  },
  audioDeviceName: {
    color: '#E2E8F0',
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  audioDeviceNameSelected: {
    color: '#00A8FF',
  },
  audioDeviceDesc: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  audioDeviceCheckContainer: {
    marginLeft: 10,
  },
  audioActiveCheckBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#00A8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioUncheckedCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  audioTipFooter: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 14,
    padding: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  audioTipText: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-Medium',
    lineHeight: 16,
  },

  // Waiting Room Styles
  waitingRoomRoot: {
    flex: 1,
    backgroundColor: '#050B14',
    paddingHorizontal: 20,
  },
  waitingRoomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  waitingRoomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    gap: 6,
  },
  waitingRoomBadgeText: {
    color: '#10b981',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  waitingRoomHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  waitingRoomScrollView: {
    flex: 1,
    width: '100%',
  },
  waitingRoomScroll: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  waitingHeroBox: {
    alignItems: 'center',
    marginTop: 36,
    marginBottom: 20,
    position: 'relative',
    width: '100%',
  },
  waitingFooter: {
    width: '100%',
    paddingTop: 12,
    backgroundColor: '#050B14',
  },
  waitingGlowCircle: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(0, 168, 255, 0.14)',
    top: -5,
  },
  waitingRadarIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0B1728',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0, 168, 255, 0.4)',
    marginBottom: 14,
  },
  waitingStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 168, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.25)',
    gap: 6,
    marginBottom: 10,
  },
  waitingPulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00A8FF',
  },
  waitingStatusPillText: {
    color: '#00A8FF',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  waitingTitleText: {
    color: '#FFF',
    fontSize: 19,
    fontFamily: 'PlusJakartaSans-Bold',
    textAlign: 'center',
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  waitingSubText: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: 'PlusJakartaSans-Medium',
    paddingHorizontal: 16,
  },
  waitingInfoCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    marginBottom: 14,
  },
  waitingInfoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  waitingInfoLabel: {
    color: '#64748b',
    fontSize: 10,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 3,
  },
  waitingInfoTitle: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  waitingCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 168, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.25)',
    gap: 6,
  },
  waitingCodeText: {
    color: '#00A8FF',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  waitingPreviewCard: {
    width: '100%',
    height: 170,
    backgroundColor: '#0B1728',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 168, 255, 0.25)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  waitingCameraContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  waitingCameraVideo: {
    width: '100%',
    height: '100%',
  },
  waitingFlipCameraBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  waitingAvatarBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  waitingAvatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  waitingAvatarText: {
    color: '#FFF',
    fontSize: 22,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  waitingDisplayName: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  waitingRoleTag: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  waitingSetupSection: {
    width: '100%',
    marginBottom: 18,
  },
  waitingSetupTitle: {
    color: '#64748b',
    fontSize: 10,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 8,
  },
  waitingSetupButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  waitingSetupBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 3,
  },
  waitingSetupBtnActive: {
    borderColor: 'rgba(0, 168, 255, 0.35)',
  },
  waitingSetupBtnMuted: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  waitingIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  iconCircleMuted: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  iconCircleMic: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  iconCircleVideo: {
    backgroundColor: 'rgba(0, 168, 255, 0.2)',
  },
  iconCircleNeutral: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  waitingBtnLabel: {
    color: '#FFF',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  waitingBtnSub: {
    fontSize: 10,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  waitingFullLeaveBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 16,
    height: 46,
  },
  waitingFullLeaveBtnText: {
    color: '#ef4444',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  admittedBanner: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.92)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 999,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  admittedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFF',
  },
  admittedBannerText: {
    color: '#FFF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  // Host Admission Top Floating Prompt Banner
  hostAdmissionBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#0c1a2e',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 999,
    elevation: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 168, 255, 0.4)',
    shadowColor: '#00A8FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  admissionBannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 10,
  },
  admissionBellBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 168, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
  },
  admissionMeta: {
    flex: 1,
  },
  admissionGuestName: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  admissionSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  admissionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  admissionDenyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  admissionDenyText: {
    color: '#ef4444',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  admissionAdmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#00A8FF',
  },
  admissionAdmitText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },

  // Waiting Room Section inside Participants Drawer
  waitingDrawerCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(0, 168, 255, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.25)',
    padding: 12,
  },
  waitingDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  waitingDrawerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  waitingDrawerTitle: {
    color: '#00A8FF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  admitAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#00A8FF',
  },
  admitAllBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  waitingDrawerList: {
    gap: 8,
  },
  waitingDrawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  waitingDrawerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 168, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  waitingDrawerAvatarText: {
    color: '#00A8FF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  waitingDrawerInfo: {
    flex: 1,
    marginRight: 8,
  },
  waitingDrawerName: {
    color: '#FFF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  waitingDrawerStatus: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  waitingDrawerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  drawerDenyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  drawerAdmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#00A8FF',
  },
  drawerAdmitText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  iosBroadcastPicker: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    bottom: -100,
  },
  reconnectingBanner: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(234, 88, 12, 0.95)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  reconnectingText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
});

export default MeetingRoomScreen;
