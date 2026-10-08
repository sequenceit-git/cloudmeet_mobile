import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { ChevronLeft, Clock, Radio, X } from 'lucide-react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { styles } from './joinStyles';

interface HostWaitingStandbyProps {
  insets: EdgeInsets;
  isDark: boolean;
  colors: any;
  t: (key: string) => string;
  radarAnim: Animated.Value;
  waitingMeetingCode: string;
  waitingMeetingTitle: string;
  meetingId: string;
  onBack: () => void;
  onCancelWaiting: () => void;
}

export const HostWaitingStandby: React.FC<HostWaitingStandbyProps> = ({
  insets,
  isDark,
  colors,
  t,
  radarAnim,
  waitingMeetingCode,
  waitingMeetingTitle,
  meetingId,
  onBack,
  onCancelWaiting,
}) => {
  return (
    <View style={[styles.standbyContainer, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
      {/* Standby Header */}
      <View style={styles.standbyHeader}>
        <TouchableOpacity
          onPress={onBack}
          style={[styles.backBtn, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <ChevronLeft color={isDark ? '#F8FAFC' : colors.textPrimary} size={22} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, !isDark && { color: colors.textPrimary }]}>
          {t('join.waitingForHostTitle')}
        </Text>
        <View style={{ width: 42 }} />
      </View>

      {/* Standby Content */}
      <View style={styles.standbyContent}>
        {/* Pulsating Radar Concentric Rings */}
        <View style={styles.radarContainer}>
          <Animated.View
            style={[
              styles.radarWave,
              {
                borderColor: colors.primary,
                transform: [
                  {
                    scale: radarAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 2.4],
                    }),
                  },
                ],
                opacity: radarAnim.interpolate({
                  inputRange: [0, 0.4, 1],
                  outputRange: [0.6, 0.25, 0],
                }),
              },
            ]}
          />
          <Animated.View
            style={[
              styles.radarWave,
              {
                borderColor: colors.primary,
                transform: [
                  {
                    scale: radarAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1.7],
                    }),
                  },
                ],
                opacity: radarAnim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.8, 0.4, 0],
                }),
              },
            ]}
          />
          <View style={[styles.radarCenterCircle, { backgroundColor: colors.primary }]}>
            <Clock color="#FFFFFF" size={36} />
          </View>
        </View>

        {/* Standby Card Info */}
        <View style={[styles.standbyCard, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.standbyTitle, !isDark && { color: colors.textPrimary }]}>
            {t('join.waitingForHostTitle')}
          </Text>
          <Text style={[styles.standbySubtitle, !isDark && { color: colors.textSecondary }]}>
            {t('join.waitingForHostSubtitle')}
          </Text>

          {/* Meeting Details Pill */}
          <View style={[styles.standbyInfoPill, !isDark && { backgroundColor: colors.cardSubtle }]}>
            <Radio color={colors.primary} size={15} style={{ marginRight: 8 }} />
            <Text style={[styles.standbyCodeText, !isDark && { color: colors.textPrimary }]}>
              {t('join.idPrefix')} {waitingMeetingCode || meetingId}
            </Text>
          </View>

          {waitingMeetingTitle ? (
            <Text style={[styles.standbyMeetingTitle, !isDark && { color: colors.textMuted }]} numberOfLines={1}>
              {waitingMeetingTitle}
            </Text>
          ) : null}

          {/* Live Polling Status Indicator */}
          <View style={styles.standbyStatusRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.standbyStatusText, !isDark && { color: colors.textSecondary }]}>
              {t('join.waitingForHostChecking')}
            </Text>
          </View>
        </View>
      </View>

      {/* Action Button: Leave / Cancel */}
      <View style={styles.standbyBottom}>
        <TouchableOpacity
          onPress={onCancelWaiting}
          style={[styles.cancelStandbyBtn, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <X color="#EF4444" size={18} style={{ marginRight: 8 }} />
          <Text style={styles.cancelStandbyText}>{t('join.cancelWaiting')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default HostWaitingStandby;
