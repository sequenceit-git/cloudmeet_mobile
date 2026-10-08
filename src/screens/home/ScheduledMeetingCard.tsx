import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Hash, Lock, Shield, Trash2 } from 'lucide-react-native';
import { ScheduledMeeting } from '../../services/api';
import { styles } from './homeScreenStyles';

interface ScheduledMeetingCardProps {
  meeting: ScheduledMeeting;
  status: { label: string; bg: string; color: string };
  isDark: boolean;
  colors: any;
  t: (key: string) => string;
  onDelete: (meeting: ScheduledMeeting) => void;
  onJoin: (meeting: ScheduledMeeting) => void;
}

export const ScheduledMeetingCard: React.FC<ScheduledMeetingCardProps> = ({
  meeting,
  status,
  isDark,
  colors,
  t,
  onDelete,
  onJoin,
}) => {
  const meetingDate = meeting.scheduled_at ? new Date(meeting.scheduled_at) : new Date();

  return (
    <View style={[styles.agendaItem, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.agendaTimeBox, !isDark && { backgroundColor: colors.iconBoxBg, borderColor: 'rgba(0, 140, 208, 0.2)' }]}>
        <Text style={[styles.agendaTime, !isDark && { color: colors.primary }]}>
          {meetingDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
        </Text>
        <Text style={[styles.agendaAmPm, !isDark && { color: colors.textSecondary }]}>
          {meetingDate.getHours() >= 12 ? 'PM' : 'AM'}
        </Text>
      </View>
      <View style={styles.agendaContent}>
        <View style={styles.titleRow}>
          <Text style={[styles.agendaTitle, !isDark && { color: colors.textPrimary }]} numberOfLines={1}>
            {meeting.title}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
        <View style={styles.agendaMeta}>
          <View style={styles.metaCodeWrap}>
            <Hash color={isDark ? '#64748b' : colors.textMuted} size={11} />
            <Text style={[styles.agendaSub, !isDark && { color: colors.textSecondary }]}>
              {meeting.meeting_code}
            </Text>
          </View>
          {Boolean(meeting.passcode || meeting.requires_passcode) && (
            <View style={styles.metaOptionBadge}>
              <Lock color={colors.primary} size={10} />
              <Text style={[styles.metaOptionBadgeText, !isDark && { color: colors.primary }]}>
                {meeting.passcode ? `P: ${meeting.passcode}` : 'Pass'}
              </Text>
            </View>
          )}
          {Boolean(meeting.waiting_room) && (
            <View style={[styles.metaOptionBadge, styles.metaOptionBadgeWaiting]}>
              <Shield color="#10b981" size={10} />
              <Text style={[styles.metaOptionBadgeText, { color: '#10b981' }]}>
                Wait Room
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.agendaActions}>
        {meeting.is_host && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => onDelete(meeting)}
          >
            <Trash2 color="#ef4444" size={18} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.joinBtnSmall, status.label === t('home.expired') && { opacity: 0.5 }]}
          onPress={() => onJoin(meeting)}
          disabled={status.label === t('home.expired')}
        >
          <Text style={styles.joinBtnSmallText}>{t('home.join')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default ScheduledMeetingCard;
