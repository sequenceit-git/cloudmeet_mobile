import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Video, Plus, CalendarPlus } from 'lucide-react-native';
import { styles } from './homeScreenStyles';

interface QuickActionGridProps {
  isDark: boolean;
  colors: any;
  t: (key: string) => string;
  onStartMeeting: () => void;
  onJoinMeeting: () => void;
  onSchedule: () => void;
}

export const QuickActionGrid: React.FC<QuickActionGridProps> = ({
  isDark,
  colors,
  t,
  onStartMeeting,
  onJoinMeeting,
  onSchedule,
}) => {
  return (
    <View style={styles.quickGrid}>
      <TouchableOpacity
        style={styles.quickCardLarge}
        onPress={onStartMeeting}
      >
        <LinearGradient
          colors={isDark ? ['rgba(0, 168, 255, 0.2)', 'rgba(0, 102, 204, 0.2)'] : ['rgba(0, 140, 208, 0.15)', 'rgba(0, 102, 204, 0.08)']}
          style={[styles.quickCardGradient, !isDark && { borderColor: 'rgba(0, 140, 208, 0.3)' }]}
        >
          <View style={[styles.iconBox, { backgroundColor: colors.primary }]}>
            <Video color="#FFF" size={22} />
          </View>
          <Text style={[styles.quickText, !isDark && { color: colors.primary }]}>
            {t('home.startMeeting')}
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.quickCard, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={onJoinMeeting}
      >
        <View style={[styles.iconBoxMuted, !isDark && { backgroundColor: colors.iconBoxBg }]}>
          <Plus color={colors.primary} size={22} />
        </View>
        <Text style={[styles.quickTextMuted, !isDark && { color: colors.textPrimary }]}>
          {t('home.joinMeeting')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.quickCard, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={onSchedule}
      >
        <View style={[styles.iconBoxMuted, !isDark && { backgroundColor: colors.iconBoxBg }]}>
          <CalendarPlus color="#10b981" size={22} />
        </View>
        <Text style={[styles.quickTextMuted, !isDark && { color: colors.textPrimary }]}>
          {t('home.schedule')}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default QuickActionGrid;
