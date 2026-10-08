import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  ChevronLeft,
  MessageSquare,
  Search,
  Plus,
  X,
  User as UserIcon,
  Image as ImageIcon,
  Film,
  Headphones,
  FileText,
  Video,
} from 'lucide-react-native';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../hooks/useTranslation';
import { RootStackNavigationProp } from '../navigation/types';
import { getUsers, User } from '../services/api';
import storage, { StorageKeys } from '../services/storage';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface RecentConversation {
  id: string;
  userId: number;
  name: string;
  username: string;
  lastMessage: string;
  lastMessageType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'meeting_invite';
  time: string;
  unreadCount: number;
  online: boolean;
  avatar?: string;
  mediaFileName?: string;
}

const AVATAR_PALETTES = [
  { bg: 'rgba(0, 168, 255, 0.18)', border: 'rgba(0, 168, 255, 0.35)', text: '#38BDF8' },
  { bg: 'rgba(16, 185, 129, 0.18)', border: 'rgba(16, 185, 129, 0.35)', text: '#34D399' },
  { bg: 'rgba(245, 158, 11, 0.18)', border: 'rgba(245, 158, 11, 0.35)', text: '#FBBF24' },
  { bg: 'rgba(139, 92, 246, 0.18)', border: 'rgba(139, 92, 246, 0.35)', text: '#A78BFA' },
  { bg: 'rgba(236, 72, 153, 0.18)', border: 'rgba(236, 72, 153, 0.35)', text: '#F472B6' },
  { bg: 'rgba(59, 130, 246, 0.18)', border: 'rgba(59, 130, 246, 0.35)', text: '#60A5FA' },
];

const getAvatarStyle = (userId: number) => {
  return AVATAR_PALETTES[Math.abs(userId) % AVATAR_PALETTES.length];
};

import { getInitials, getAvatarTextStyle } from '../utils/helpers';

export const MessagesScreen: React.FC = () => {
  const navigation = useNavigation<RootStackNavigationProp<'Messages'>>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { isDark, colors } = useTheme();

  const [conversations, setConversations] = useState<RecentConversation[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [contactSearchQuery, setContactSearchQuery] = useState('');

  // Load saved real conversations from storage
  useFocusEffect(
    useCallback(() => {
      const loadConversations = async () => {
        try {
          const saved = await storage.getItem(StorageKeys.RECENT_CONVERSATIONS);
          let list: RecentConversation[] = [];
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
              list = parsed;
            }
          }

          // Recover any conversations that have chat history saved on device
          try {
            const usersRes = await getUsers();
            if (usersRes.success && Array.isArray(usersRes.data)) {
              for (const u of usersRes.data) {
                const historyRaw = await storage.getItem(`chat_history_${u.id}`);
                if (historyRaw) {
                  const history = JSON.parse(historyRaw);
                  if (Array.isArray(history) && history.length > 0) {
                    const lastMsg = history[history.length - 1];
                    const existingIdx = list.findIndex(c => c.userId === u.id);
                    const convData: RecentConversation = {
                      id: existingIdx !== -1 ? list[existingIdx].id : `conv_${u.id}_${Date.now()}`,
                      userId: u.id,
                      name: u.name,
                      username: u.username || u.name.toLowerCase().replace(/\s+/g, '_'),
                      lastMessage: lastMsg.text || (lastMsg.type ? `${lastMsg.type.toUpperCase()} file` : 'New message'),
                      lastMessageType: lastMsg.type || 'text',
                      time: lastMsg.time || 'Recent',
                      unreadCount: 0,
                      online: true,
                      mediaFileName: lastMsg.fileName,
                    };
                    if (existingIdx !== -1) {
                      list[existingIdx] = { ...list[existingIdx], ...convData };
                    } else {
                      list.unshift(convData);
                    }
                  }
                }
              }
            }
          } catch (recoveryErr) {
            console.warn('Error checking chat histories:', recoveryErr);
          }

          setConversations(list);
          await storage.setItem(StorageKeys.RECENT_CONVERSATIONS, JSON.stringify(list));
        } catch (e) {
          console.error('Error loading conversations:', e);
          setConversations([]);
        }
      };
      loadConversations();
    }, [])
  );

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await getUsers();
      if (response.success && Array.isArray(response.data)) {
        setUsers(response.data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (showUserModal) {
      fetchUsers();
    }
  }, [showUserModal]);

  const handleOpenConversation = useCallback(
    async (conv: RecentConversation) => {
      // Mark as read in state & storage
      const updated = conversations.map(c =>
        c.id === conv.id ? { ...c, unreadCount: 0 } : c
      );
      setConversations(updated);
      try {
        await storage.setItem(StorageKeys.RECENT_CONVERSATIONS, JSON.stringify(updated));
      } catch (err) {
        console.error('Error saving updated conversations:', err);
      }

      navigation.navigate('ChatDetail', { userId: conv.userId, name: conv.name });
    },
    [conversations, navigation]
  );

  const handleUserSelect = useCallback(
    async (user: User) => {
      setShowUserModal(false);
      setContactSearchQuery('');

      const existingIndex = conversations.findIndex(c => c.userId === user.id);
      if (existingIndex !== -1) {
        handleOpenConversation(conversations[existingIndex]);
      } else {
        const newConv: RecentConversation = {
          id: `conv_${user.id}_${Date.now()}`,
          userId: user.id,
          name: user.name,
          username: user.username,
          lastMessage: 'Tap to start conversation',
          lastMessageType: 'text',
          time: 'Just now',
          unreadCount: 0,
          online: true,
        };
        const updated = [newConv, ...conversations];
        setConversations(updated);
        try {
          await storage.setItem(StorageKeys.RECENT_CONVERSATIONS, JSON.stringify(updated));
        } catch (err) {
          console.error('Error saving conversations:', err);
        }
        navigation.navigate('ChatDetail', { userId: user.id, name: user.name });
      }
    },
    [conversations, handleOpenConversation, navigation]
  );

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const filteredUsers = useMemo(() => {
    if (!contactSearchQuery.trim()) return users;
    const q = contactSearchQuery.toLowerCase().trim();
    return users.filter(
      u =>
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
    );
  }, [users, contactSearchQuery]);

  const renderLastMessageSnippet = (item: RecentConversation) => {
    const isUnread = item.unreadCount > 0;
    const textStyle = [styles.convLastMsg, isUnread && styles.convLastMsgUnread];

    switch (item.lastMessageType) {
      case 'image':
        return (
          <View style={styles.snippetRow}>
            <ImageIcon color="#00A8FF" size={14} style={{ marginRight: 5 }} />
            <Text style={textStyle} numberOfLines={1}>
              {item.mediaFileName || 'Photo'}
            </Text>
          </View>
        );
      case 'video':
        return (
          <View style={styles.snippetRow}>
            <Film color="#10B981" size={14} style={{ marginRight: 5 }} />
            <Text style={textStyle} numberOfLines={1}>
              {item.mediaFileName || item.lastMessage}
            </Text>
          </View>
        );
      case 'audio':
        return (
          <View style={styles.snippetRow}>
            <Headphones color="#F59E0B" size={14} style={{ marginRight: 5 }} />
            <Text style={textStyle} numberOfLines={1}>
              {item.lastMessage}
            </Text>
          </View>
        );
      case 'document':
        return (
          <View style={styles.snippetRow}>
            <FileText color="#8B5CF6" size={14} style={{ marginRight: 5 }} />
            <Text style={textStyle} numberOfLines={1}>
              {item.mediaFileName || item.lastMessage}
            </Text>
          </View>
        );
      case 'meeting_invite':
        return (
          <View style={styles.snippetRow}>
            <Video color="#00A8FF" size={14} style={{ marginRight: 5 }} />
            <Text style={[styles.convLastMsg, styles.convMeetingText]} numberOfLines={1}>
              {item.lastMessage}
            </Text>
          </View>
        );
      default:
        return (
          <Text style={textStyle} numberOfLines={1}>
            {item.lastMessage}
          </Text>
        );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      {/* Header */}
      <View style={[styles.header, !isDark && { backgroundColor: colors.headerBg }]}>
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('Home');
            }
          }}
          style={[
            styles.backBtn,
            !isDark && { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          activeOpacity={0.7}
        >
          <ChevronLeft color={isDark ? '#94a3b8' : colors.textPrimary} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, !isDark && { color: colors.textPrimary }]}>{t('messages.title')}</Text>
        <TouchableOpacity
          style={[
            styles.actionBtn,
            !isDark && { backgroundColor: colors.iconBoxBg, borderColor: 'rgba(0, 140, 208, 0.3)' },
          ]}
          onPress={() => setShowUserModal(true)}
          activeOpacity={0.7}
        >
          <Plus color={colors.primary} size={22} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Search Bar */}
        <View style={[styles.searchBar, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Search color={isDark ? '#64748b' : colors.textMuted} size={18} />
          <TextInput
            placeholder={t('messages.searchPlaceholder')}
            placeholderTextColor={isDark ? '#64748b' : colors.textMuted}
            style={[styles.searchInput, !isDark && { color: colors.textPrimary }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClearBtn}>
              <X color={isDark ? '#94a3b8' : colors.textSecondary} size={16} />
            </TouchableOpacity>
          )}
        </View>

        {/* Conversations List */}
        <ScrollView
          style={styles.chatList}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          {filteredConversations.length > 0 ? (
            filteredConversations.map(conv => {
              const palette = getAvatarStyle(conv.userId);
              const isUnread = conv.unreadCount > 0;

              return (
                <TouchableOpacity
                  key={conv.id}
                  style={[
                    styles.convCard,
                    !isDark && { backgroundColor: colors.card, borderColor: colors.border },
                    isUnread && styles.convCardUnread,
                    isUnread && !isDark && { borderColor: colors.borderActive, backgroundColor: colors.card },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => handleOpenConversation(conv)}
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
            })
          ) : (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconBox, !isDark && { backgroundColor: colors.iconBoxBg }]}>
                <MessageSquare color={colors.primary} size={36} />
              </View>
              <Text style={[styles.emptyTitle, !isDark && { color: colors.textPrimary }]}>
                {searchQuery ? 'No matching conversations' : t('messages.noMessages')}
              </Text>
              <Text style={[styles.emptySub, !isDark && { color: colors.textSecondary }]}>
                {searchQuery
                  ? 'Try searching with a different contact name or message keyword.'
                  : t('messages.startChat')}
              </Text>
              {!searchQuery && (
                <TouchableOpacity
                  style={[styles.emptyActionBtn, !isDark && { backgroundColor: colors.primary }]}
                  onPress={() => setShowUserModal(true)}
                  activeOpacity={0.7}
                >
                  <Plus color="#FFFFFF" size={18} />
                  <Text style={styles.emptyActionText}>Start New Conversation</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Select Contact Modal */}
      <Modal
        visible={showUserModal}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => {
          setShowUserModal(false);
          setContactSearchQuery('');
        }}
      >
        <View
          style={[
            styles.modalOverlay,
            { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
            !isDark && { backgroundColor: colors.modalOverlay },
          ]}
        >
          <TouchableOpacity
            style={[styles.modalDismissArea, { width: SCREEN_WIDTH }]}
            activeOpacity={1}
            onPress={() => {
              setShowUserModal(false);
              setContactSearchQuery('');
            }}
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
              <Text style={[styles.modalTitle, !isDark && { color: colors.textPrimary }]}>{t('messages.newMessage')}</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowUserModal(false);
                  setContactSearchQuery('');
                }}
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
                onChangeText={setContactSearchQuery}
              />
              {contactSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setContactSearchQuery('')} style={{ padding: 4 }}>
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
                        onPress={() => handleUserSelect(user)}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050B14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 168, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    height: 48,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    marginLeft: 10,
    fontFamily: 'PlusJakartaSans-Medium',
    fontSize: 14,
  },
  searchClearBtn: {
    padding: 4,
  },
  chatList: {
    flex: 1,
  },
  // Conversation item card
  convCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  convCardUnread: {
    backgroundColor: 'rgba(0, 168, 255, 0.04)',
    borderColor: 'rgba(0, 168, 255, 0.18)',
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 14,
  },
  avatarBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarText: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  onlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
    borderWidth: 2.5,
    borderColor: '#050B14',
  },
  convInfo: {
    flex: 1,
  },
  convTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  convName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-SemiBold',
    flex: 1,
    marginRight: 8,
  },
  convTime: {
    color: '#64748b',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  convTimeUnread: {
    color: '#00A8FF',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  convBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  snippetWrap: {
    flex: 1,
    marginRight: 10,
  },
  snippetRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  convLastMsg: {
    color: '#94a3b8',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Regular',
    flex: 1,
  },
  convLastMsgUnread: {
    color: '#E2E8F0',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  convMeetingText: {
    color: '#00A8FF',
    fontFamily: 'PlusJakartaSans-Medium',
  },
  unreadBadge: {
    backgroundColor: '#00A8FF',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    paddingHorizontal: 24,
  },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0, 168, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.2)',
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    color: '#94a3b8',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Medium',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00A8FF',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
  },
  emptyActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  // Contact Picker Modal
  modalOverlay: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
    width: '100%',
  },
  modalContent: {
    width: SCREEN_WIDTH,
    backgroundColor: '#0B1728',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 20,
    alignSelf: 'stretch',
  },
  modalDragHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  modalHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalSearchBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    height: 44,
    paddingHorizontal: 14,
    marginTop: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalSearchInput: {
    flex: 1,
    color: '#FFF',
    marginLeft: 8,
    fontFamily: 'PlusJakartaSans-Medium',
    fontSize: 13,
  },
  userList: {
    flex: 1,
    width: '100%',
    marginTop: 6,
  },
  userItem: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    gap: 12,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  userAvatarText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  userEmail: {
    color: '#94a3b8',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Regular',
    marginTop: 2,
  },
  userChatBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 168, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noUsers: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 40,
    fontFamily: 'PlusJakartaSans-Medium',
  },
});

export default MessagesScreen;

