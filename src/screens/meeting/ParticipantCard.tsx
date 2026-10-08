import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTracks, VideoTrack } from '@livekit/react-native';
import { Participant, Track, facingModeFromLocalTrack } from 'livekit-client';
import LinearGradient from 'react-native-linear-gradient';
import {
  LayoutGrid,
  Maximize2,
  Mic,
  MicOff,
  MonitorUp,
  SwitchCamera,
  Volume2,
} from 'lucide-react-native';
import { useTranslation } from '../../hooks/useTranslation';
import { getAvatarTextStyle, getInitials } from '../../utils/helpers';
import { styles } from './meetingRoomStyles';
import { checkIsParticipantHost } from './meetingRoomUtils';

export const ParticipantCard: React.FC<{
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
  compactPip?: boolean;
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
  compactPip = false,
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
          compactPip && styles.pipVideoOnly,
        ]}
      >
        {(cameraTrack?.publication?.track && (isCameraEnabled || compactPip)) ? (
          <>
            <VideoTrack
              trackRef={cameraTrack}
              style={styles.cardVideo}
              mirror={Boolean(isLocal && isFrontCamera)}
              zOrder={compactPip ? 1 : 0}
            />
            {showControls && !isSingleOrFullScreen && !compactPip && (
            <View nativeID="meeting-chrome" style={[styles.videoNamePill, { bottom: density === 'ultra-compact' ? 5 : 8, left: density === 'ultra-compact' ? 5 : 8 }]}>
              <Text style={[styles.videoNameText, { fontSize: avatarMetrics.nameSize }]} numberOfLines={1}>
                {displayName}
              </Text>
              {isMicEnabled ? (
                <Mic color="#10b981" size={avatarMetrics.micSize} style={{ marginLeft: 4 }} />
              ) : (
                <MicOff color="#ef4444" size={avatarMetrics.micSize} style={{ marginLeft: 4 }} />
              )}
            </View>
            )}
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
            {!(isSingleOrFullScreen && !showControls) && !compactPip && (
            <View
              nativeID="meeting-chrome"
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
            )}
          </View>
        )}

        <TouchableOpacity
          activeOpacity={isSingleOrFullScreen ? 1 : 0.9}
          onPress={onPress}
          style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
        />

        {/* Top badges and action buttons */}
        {(showControls && !compactPip) ? (
          <View
            nativeID="meeting-chrome"
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
        ) : null}
      </View>
    );
  };
