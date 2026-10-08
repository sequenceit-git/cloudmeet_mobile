import React from 'react';
import { Animated, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../../hooks/useTranslation';
import {
  Mic,
  MicOff,
  Video as LucideVideo,
  VideoOff,
  MessageSquare,
  Users,
  MonitorUp,
  MonitorOff,
} from 'lucide-react-native';
import { styles } from '../meetingRoomStyles';

export interface MeetingControlsDockProps {
  insets: EdgeInsets;
  showControls: boolean;
  controlsOpacity: Animated.Value;
  footerTranslateY: Animated.Value;
  isMicMuted: boolean;
  isCameraOff: boolean;
  unreadChatCount: number;
  canScreenShare: boolean;
  isScreenSharing: boolean;
  isScreenShareToggling: boolean;
  participantBadgeText: string | number;
  isHostWaitingGuestsBadge: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onOpenChat: () => void;
  onToggleScreenShare: () => void;
  onOpenParticipants: () => void;
}

export const MeetingControlsDock: React.FC<MeetingControlsDockProps> = ({
  insets,
  showControls,
  controlsOpacity,
  footerTranslateY,
  isMicMuted,
  isCameraOff,
  unreadChatCount,
  canScreenShare,
  isScreenSharing,
  isScreenShareToggling,
  participantBadgeText,
  isHostWaitingGuestsBadge,
  onToggleMic,
  onToggleCamera,
  onOpenChat,
  onToggleScreenShare,
  onOpenParticipants,
}) => {
  const { t } = useTranslation();

  return (
    <Animated.View
      nativeID="meeting-chrome"
      pointerEvents={!showControls ? 'none' : 'auto'}
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
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onToggleMic}
        >
          <View style={[styles.controlIconBox, isMicMuted && styles.controlIconBoxMuted]}>
            {isMicMuted ? <MicOff color="#ef4444" size={22} /> : <Mic color="#10b981" size={22} />}
          </View>
          <Text style={styles.controlLabel}>{isMicMuted ? t('meeting.unmute') : t('meeting.mute')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlItem}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onToggleCamera}
        >
          <View style={[styles.controlIconBox, isCameraOff && styles.controlIconBoxMuted]}>
            {isCameraOff ? <VideoOff color="#ef4444" size={22} /> : <LucideVideo color="#10b981" size={22} />}
          </View>
          <Text style={styles.controlLabel}>{isCameraOff ? t('meeting.startVideo') : t('meeting.stopVideo')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlItem}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onOpenChat}
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

        {canScreenShare && (
          <TouchableOpacity
            style={[styles.controlItem, isScreenShareToggling && { opacity: 0.6 }]}
            onPress={onToggleScreenShare}
            disabled={isScreenShareToggling}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
                <MonitorUp color="#94a3b8" size={22} />
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
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onOpenParticipants}
        >
          <View style={styles.controlIconBox}>
            <Users color="#00A8FF" size={22} />
            <View
              style={[
                styles.badge,
                { backgroundColor: isHostWaitingGuestsBadge ? '#f59e0b' : '#00A8FF' },
              ]}
            >
              <Text style={styles.badgeText}>{participantBadgeText}</Text>
            </View>
          </View>
          <Text style={styles.controlLabel}>{t('meeting.members')}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

export default MeetingControlsDock;
