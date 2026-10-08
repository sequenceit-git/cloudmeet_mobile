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
import { styles } from './messages/messagesStyles';
import { NewConversationModal } from './messages/NewConversationModal';
import { ConversationListItem } from './messages/ConversationListItem';

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
              return (
                <ConversationListItem
                  key={conv.id}
                  conversation={conv}
                  isDark={isDark}
                  colors={colors}
                  palette={palette}
                  renderLastMessageSnippet={renderLastMessageSnippet}
                  onPress={() => handleOpenConversation(conv)}
                />
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
      <NewConversationModal
        visible={showUserModal}
        isDark={isDark}
        colors={colors}
        insets={insets}
        contactSearchQuery={contactSearchQuery}
        loadingUsers={loadingUsers}
        filteredUsers={filteredUsers}
        t={t}
        getAvatarStyle={getAvatarStyle}
        onClose={() => {
          setShowUserModal(false);
          setContactSearchQuery('');
        }}
        onSearchChange={setContactSearchQuery}
        onUserSelect={handleUserSelect}
      />
    </View>
  );
};

export default MessagesScreen;


