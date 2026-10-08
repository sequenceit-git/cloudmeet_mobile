import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../../hooks/useTranslation';
import { UserPlus, X, Check, MonitorUp, MonitorOff } from 'lucide-react-native';
import { styles } from '../meetingRoomStyles';

export interface WaitingGuestInfo {
  identity: string;
  name: string;
}

export interface MeetingBannersProps {
  insets: EdgeInsets;
  showControls: boolean;
  showAdmittedBanner: boolean;
  isHost: boolean;
  latestWaitingGuest: WaitingGuestInfo | null;
  onAdmitGuest: (identity: string) => void;
  onDenyGuest: (identity: string) => void;
  isReconnectingUI: boolean;
  isRoomConnected: boolean;
  isScreenSharing: boolean;
  isScreenShareToggling: boolean;
  shouldShowScreenShareBanner: boolean;
  onStopScreenShare: () => void;
}

export const MeetingBanners: React.FC<MeetingBannersProps> = ({
  insets,
  showControls,
  showAdmittedBanner,
  isHost,
  latestWaitingGuest,
  onAdmitGuest,
  onDenyGuest,
  isReconnectingUI,
  isRoomConnected,
  isScreenSharing,
  isScreenShareToggling,
  shouldShowScreenShareBanner,
  onStopScreenShare,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {/* --- HOST ADMITTED TOAST BANNER --- */}
      {showAdmittedBanner && (
        <View
          nativeID="meeting-chrome"
          style={[styles.admittedBanner, { top: insets.top + (showControls ? 64 : 16) }]}
        >
          <View style={styles.admittedDot} />
          <Text style={styles.admittedBannerText}>{t('meeting.hostArrivedAdmitting')}</Text>
        </View>
      )}

      {/* --- GUEST ADMISSION PROMPT BANNER (FOR HOST) --- */}
      {isHost && latestWaitingGuest && (
        <View
          nativeID="meeting-chrome"
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
              onPress={() => onDenyGuest(latestWaitingGuest.identity)}
              activeOpacity={0.7}
            >
              <X color="#ef4444" size={15} />
              <Text style={styles.admissionDenyText}>{t('meeting.deny')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.admissionAdmitBtn}
              onPress={() => onAdmitGuest(latestWaitingGuest.identity)}
              activeOpacity={0.7}
            >
              <Check color="#FFF" size={15} />
              <Text style={styles.admissionAdmitText}>{t('meeting.admit')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* --- FLOATING RECONNECTING BANNER --- */}
      {isReconnectingUI && !isRoomConnected && (
        <View
          nativeID="meeting-chrome"
          style={[
            styles.reconnectingBanner,
            { top: insets.top + (showControls ? 58 : 14) },
          ]}
          pointerEvents="none"
        >
          <ActivityIndicator color="#FFFFFF" size="small" style={{ marginRight: 8 }} />
          <Text style={styles.reconnectingText}>
            {t('meeting.reconnecting') || 'Reconnecting to meeting...'}
          </Text>
        </View>
      )}

      {/* --- FLOATING SCREEN SHARE STOP BANNER --- */}
      {isScreenSharing && shouldShowScreenShareBanner && (
        <View
          nativeID="meeting-chrome"
          style={[
            styles.floatingScreenShareBanner,
            { top: insets.top + (showControls ? 58 : 12) },
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
            onPress={onStopScreenShare}
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
    </>
  );
};

export default MeetingBanners;
