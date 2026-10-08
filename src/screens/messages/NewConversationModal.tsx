import React from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { X, Search, MessageSquare } from 'lucide-react-native';
import { User } from '../../services/api';
import { getInitials, getAvatarTextStyle } from '../../utils/helpers';
import { styles } from './messagesStyles';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface NewConversationModalProps {
  visible: boolean;
  isDark: boolean;
  colors: any;
  insets: { bottom: number };
  contactSearchQuery: string;
  loadingUsers: boolean;
  filteredUsers: User[];
  t: (key: string) => string;
  getAvatarStyle: (id: number) => { bg: string; border: string; text: string };
  onClose: () => void;
  onSearchChange: (text: string) => void;
  onUserSelect: (user: User) => void;
}

export const NewConversationModal: React.FC<NewConversationModalProps> = ({
  visible,
  isDark,
  colors,
  insets,
  contactSearchQuery,
  loadingUsers,
  filteredUsers,
  t,
  getAvatarStyle,
  onClose,
  onSearchChange,
  onUserSelect,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalDismissArea}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.modalContent,
            {
              width: SCREEN_WIDTH,
              height: SCREEN_HEIGHT * 0.82,
              paddingBottom: insets.bottom + 20,
            },
            !isDark && {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={[styles.modalDragHandle, !isDark && { backgroundColor: colors.border }]} />

          <View style={[styles.modalHeader, !isDark && { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, !isDark && { color: colors.textPrimary }]}>
              {t('messages.newMessage')}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.modalCloseBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X color={isDark ? '#94a3b8' : colors.textSecondary} size={22} />
            </TouchableOpacity>
          </View>

          {/* Modal Contact Search */}
          <View style={[styles.modalSearchBar, !isDark && { backgroundColor: colors.searchBg, borderColor: colors.border }]}>
            <Search color={isDark ? '#64748b' : colors.textMuted} size={16} />
            <TextInput
              placeholder={t('messages.searchUsers')}
              placeholderTextColor={isDark ? '#64748b' : colors.textMuted}
              style={[styles.modalSearchInput, !isDark && { color: colors.textPrimary }]}
              value={contactSearchQuery}
              onChangeText={onSearchChange}
            />
            {contactSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => onSearchChange('')} style={{ padding: 4 }}>
                <X color={isDark ? '#94a3b8' : colors.textSecondary} size={16} />
              </TouchableOpacity>
            )}
          </View>

          {loadingUsers ? (
            <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }} />
          ) : (
            <ScrollView
              style={styles.userList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {filteredUsers.length === 0 ? (
                <Text style={[styles.noUsers, !isDark && { color: colors.textMuted }]}>
                  {contactSearchQuery ? 'No contacts found.' : t('messages.noMessages')}
                </Text>
              ) : (
                filteredUsers.map(user => {
                  const palette = getAvatarStyle(user.id);
                  return (
                    <TouchableOpacity
                      key={user.id}
                      style={[styles.userItem, !isDark && { borderBottomColor: colors.borderSubtle }]}
                      onPress={() => onUserSelect(user)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.userAvatar,
                          { backgroundColor: palette.bg, borderColor: palette.border },
                        ]}
                      >
                        <Text style={[styles.userAvatarText, { color: palette.text }, getAvatarTextStyle(user.name, 15)]}>
                          {getInitials(user.name, 'U')}
                        </Text>
                      </View>
                      <View style={styles.userInfo}>
                        <Text style={[styles.userName, !isDark && { color: colors.textPrimary }]}>{user.name}</Text>
                        <Text style={[styles.userEmail, !isDark && { color: colors.textSecondary }]}>@{user.username}</Text>
                      </View>
                      <View style={[styles.userChatBtn, !isDark && { backgroundColor: colors.iconBoxBg }]}>
                        <MessageSquare color={colors.primary} size={18} />
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};
