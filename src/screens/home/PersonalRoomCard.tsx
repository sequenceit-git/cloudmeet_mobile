import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Link2, Copy, Check, Play } from 'lucide-react-native';
import { styles } from './homeScreenStyles';

interface PersonalRoomCardProps {
  personalRoomDisplayUrl: string;
  personalRoomFullUrl: string;
  copied: boolean;
  isStartingPersonalRoom: boolean;
  onCopy: (url: string) => void;
  onStart: () => void;
  isDark: boolean;
  colors: any;
  t: (key: string) => string;
}

export const PersonalRoomCard: React.FC<PersonalRoomCardProps> = ({
  personalRoomDisplayUrl,
  personalRoomFullUrl,
  copied,
  isStartingPersonalRoom,
  onCopy,
  onStart,
  isDark,
  colors,
  t,
}) => {
  return (
    <View style={[styles.glassCard, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.headerIcon, !isDark && { backgroundColor: colors.iconBoxBg }]}>
            <Link2 color={colors.primary} size={18} />
          </View>
          <View>
            <Text style={[styles.cardTitle, !isDark && { color: colors.textPrimary }]}>
              {t('home.personalRoomLink')}
            </Text>
            <Text style={[styles.cardSub, !isDark && { color: colors.textSecondary }]}>
              {t('home.fixedId')}
            </Text>
          </View>
        </View>
        <View style={styles.onlineBadge}>
          <Text style={styles.onlineBadgeText}>{t('common.active')}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.urlBox, !isDark && { backgroundColor: colors.cardSubtle }]}
        onPress={() => onCopy(personalRoomFullUrl)}
        activeOpacity={0.7}
      >
        <Text style={[styles.urlText, !isDark && { color: colors.primary }]} numberOfLines={1}>
          {personalRoomDisplayUrl}
        </Text>
        <TouchableOpacity onPress={() => onCopy(personalRoomFullUrl)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          {copied ? <Check color="#10b981" size={14} /> : <Copy color={isDark ? '#94a3b8' : colors.textSecondary} size={14} />}
        </TouchableOpacity>
      </TouchableOpacity>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.secondaryBtn, !isDark && { backgroundColor: colors.cardSubtle, borderColor: colors.border }]}
          onPress={() => onCopy(personalRoomFullUrl)}
        >
          {copied ? <Check color="#10b981" size={16} /> : <Copy color={colors.primary} size={16} />}
          <Text style={[styles.secondaryBtnText, !isDark && { color: colors.textPrimary }]}>
            {copied ? t('common.copied') : t('home.copyLink')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtnSmall, isStartingPersonalRoom && { opacity: 0.8 }]}
          onPress={onStart}
          disabled={isStartingPersonalRoom}
        >
          {isStartingPersonalRoom ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Play color="#FFF" size={14} fill="#FFF" />
              <Text style={styles.primaryBtnSmallText}>{t('home.startRoom')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default PersonalRoomCard;
