import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { VideoTrack } from '@livekit/react-native';
import * as Clipboard from 'expo-clipboard';
import LinearGradient from 'react-native-linear-gradient';
import {
  Check,
  ChevronLeft,
  Clock,
  Copy,
  LogOut,
  Mic,
  MicOff,
  SwitchCamera,
  Video as LucideVideo,
  VideoOff,
} from 'lucide-react-native';
import { useTranslation } from '../../hooks/useTranslation';
import { getAvatarTextStyle, getInitials } from '../../utils/helpers';
import { styles } from './meetingRoomStyles';

export interface WaitingRoomViewProps {
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

export const WaitingRoomView: React.FC<WaitingRoomViewProps> = ({
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
