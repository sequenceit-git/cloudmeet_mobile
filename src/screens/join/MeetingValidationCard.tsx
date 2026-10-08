import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { AlertCircle, Radio } from 'lucide-react-native';
import { styles } from './joinStyles';

export interface MeetingValidationInfo {
  isValid: boolean;
  title: string;
  code: string;
  roomName?: string;
  isActive?: boolean;
  requiresPasscode?: boolean;
}

interface MeetingValidationCardProps {
  isValidating: boolean;
  meetingInfo: MeetingValidationInfo | null;
  colors: any;
  isDark: boolean;
  t: (key: string) => string;
}

export const MeetingValidationCard: React.FC<MeetingValidationCardProps> = ({
  isValidating,
  meetingInfo,
  colors,
  isDark,
  t,
}) => {
  if (isValidating) {
    return (
      <View style={styles.validatingRow}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.validatingText, !isDark && { color: colors.primary }]}>{t('join.verifying')}</Text>
      </View>
    );
  }

  if (!meetingInfo) return null;

  return (
    <View
      style={[
        styles.infoCard,
        !isDark && { backgroundColor: colors.card, borderColor: colors.border },
        meetingInfo.isValid ? styles.infoCardValid : styles.infoCardInvalid,
      ]}
    >
      <View style={styles.infoHeaderRow}>
        {meetingInfo.isValid ? (
          <>
            <View style={styles.pulseDotContainer}>
              <View style={styles.pulseDot} />
            </View>
            <Text style={styles.infoBadgeValid}>
              {meetingInfo.isActive ? t('join.activeReady') : t('join.meetingFound')}
            </Text>
          </>
        ) : (
          <>
            <AlertCircle color="#EF4444" size={16} style={{ marginRight: 6 }} />
            <Text style={styles.infoBadgeInvalid}>{t('join.notFound')}</Text>
          </>
        )}
      </View>

      <Text style={[styles.infoMeetingTitle, !isDark && { color: colors.textPrimary }]} numberOfLines={2}>
        {meetingInfo.title}
      </Text>

      <View style={[styles.infoCodeTag, !isDark && { backgroundColor: colors.cardSubtle }]}>
        <Radio color={colors.primary} size={13} style={{ marginRight: 6 }} />
        <Text style={[styles.infoCodeTagText, !isDark && { color: colors.primary }]}>
          {t('join.idPrefix')} {meetingInfo.code}
        </Text>
      </View>
    </View>
  );
};

export default MeetingValidationCard;
