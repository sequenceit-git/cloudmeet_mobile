import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { RecentConversation } from '../MessagesScreen';
import { getInitials, getAvatarTextStyle } from '../../utils/helpers';
import { styles } from './messagesStyles';

interface ConversationListItemProps {
  conversation: RecentConversation;
  isDark: boolean;
  colors: any;
  palette: { bg: string; border: string; text: string };
  renderLastMessageSnippet: (conv: RecentConversation) => React.ReactNode;
  onPress: () => void;
}

export const ConversationListItem: React.FC<ConversationListItemProps> = ({
  conversation: conv,
  isDark,
  colors,
  palette,
  renderLastMessageSnippet,
  onPress,
}) => {
  const isUnread = conv.unreadCount > 0;

  return (
    <TouchableOpacity
      style={[
        styles.convCard,
        !isDark && { backgroundColor: colors.card, borderColor: colors.border },
        isUnread && styles.convCardUnread,
        isUnread && !isDark && { borderColor: colors.borderActive, backgroundColor: colors.card },
      ]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      {/* Avatar & Online Dot */}
      <View style={styles.avatarWrap}>
        <View
          style={[
            styles.avatarBox,
            { backgroundColor: palette.bg, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.avatarText, { color: palette.text }, getAvatarTextStyle(conv.name, 16)]}>
            {getInitials(conv.name, 'U')}
          </Text>
        </View>
        {conv.online && <View style={[styles.onlineDot, !isDark && { borderColor: colors.card }]} />}
      </View>

      {/* Conversation Info */}
      <View style={styles.convInfo}>
        <View style={styles.convTopRow}>
          <Text style={[styles.convName, !isDark && { color: colors.textPrimary }]} numberOfLines={1}>
            {conv.name}
          </Text>
          <Text style={[styles.convTime, !isDark && { color: colors.textSecondary }, isUnread && styles.convTimeUnread]}>
            {conv.time}
          </Text>
        </View>

        <View style={styles.convBottomRow}>
          <View style={styles.snippetWrap}>
            {renderLastMessageSnippet(conv)}
          </View>

          {isUnread && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};
