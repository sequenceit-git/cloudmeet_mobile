import { useNavigation, useRoute } from '@react-navigation/native';
import {
  ChevronLeft,
  Send,
  Paperclip,
  Video,
  MessageSquare,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { validateFileSize, formatBytes, MAX_FILE_SIZE_BYTES } from '../utils/fileValidation';
import { getInitials, getAvatarTextStyle } from '../utils/helpers';
import { useTranslation } from '../hooks/useTranslation';
import React, { useState, useRef, useEffect } from 'react';
import {
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackNavigationProp, RootStackRouteProp } from '../navigation/types';
import { useMeetingContext } from '../context/MeetingContext';
import { useUser } from '../context/UserContext';
import storage, { StorageKeys } from '../services/storage';
import { useTheme } from '../context/ThemeContext';
import { MediaPreviewModal, MediaPreviewItem } from '../components/meeting/MediaPreviewModal';
import { styles } from './chat/chatDetailStyles';
import { ChatMessageBubble } from './chat/ChatMessageBubble';
import { ChatMeetingInviteModal } from './chat/ChatMeetingInviteModal';

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'meeting_invite';

export interface Message {
  id: string;
  text?: string;
  isSelf: boolean;
  time: string;
  type?: MessageType;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: string;
  duration?: string;
  meetingCode?: string;
}

export const ChatDetailScreen: React.FC = () => {
  const navigation = useNavigation<RootStackNavigationProp<'ChatDetail'>>();
  const route = useRoute<RootStackRouteProp<'ChatDetail'>>();
  const insets = useSafeAreaInsets();
  const { userId, name } = route.params;
  const { startMeeting } = useMeetingContext();
  const { t } = useTranslation();
  const { user } = useUser();
  const { isDark, colors } = useTheme();

  const [input, setInput] = useState('');
  const [previewMedia, setPreviewMedia] = useState<MediaPreviewItem | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [showMeetingModal, setShowMeetingModal] = useState(false);

  const handlePickAndSendAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const fileSize = file.size || 0;
        const validation = validateFileSize(fileSize);

        if (!validation.isValid) {
          Alert.alert(
            t('messages.fileTooLargeTitle'),
            `${t('messages.fileTooLargeDesc')}\n\n(${validation.sizeFormatted} > 5 MB)`
          );
          return;
        }

        const fileName = file.name || 'Attachment';
        const mime = (file.mimeType || '').toLowerCase();
        const ext = fileName.split('.').pop()?.toLowerCase() || '';

        let category: 'image' | 'video' | 'audio' | 'document' = 'document';
        if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
          category = 'image';
        } else if (mime.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp'].includes(ext)) {
          category = 'video';
        } else if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext)) {
          category = 'audio';
        }

        const title = fileName;
        const defaultDuration =
          category === 'audio' ? '0:35' : category === 'video' ? '01:20' : undefined;

        sendMessage({
          type: category,
          text: title,
          fileName: title,
          fileSize: validation.sizeFormatted || '1.5 MB',
          mediaUrl: file.uri,
          duration: defaultDuration,
        });
      }
    } catch (err) {
      console.warn('[ChatDetailScreen] Error picking document:', err);
    }
  };

  // Load genuine messages from storage for this specific conversation
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const saved = await storage.getItem(`chat_history_${userId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setMessages(parsed);
            return;
          }
        }
        setMessages([]);
      } catch (e) {
        setMessages([]);
      }
    };
    loadHistory();
  }, [userId]);

  const scrollViewRef = useRef<ScrollView>(null);

  const sendMessage = async (customMessage?: Partial<Message>) => {
    if (!customMessage && !input.trim()) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newMessage: Message = {
      id: Date.now().toString(),
      text: customMessage?.text || input,
      isSelf: true,
      time: timeStr,
      type: customMessage?.type || 'text',
      mediaUrl: customMessage?.mediaUrl,
      fileName: customMessage?.fileName,
      fileSize: customMessage?.fileSize,
      duration: customMessage?.duration,
      meetingCode: customMessage?.meetingCode,
    };

    const updated = [...messages, newMessage];
    setMessages(updated);
    setInput('');

    // Persist real message history
    try {
      await storage.setItem(`chat_history_${userId}`, JSON.stringify(updated));

      // Update or insert conversation into RECENT_CONVERSATIONS
      const recentRaw = await storage.getItem(StorageKeys.RECENT_CONVERSATIONS);
      let recentList: any[] = recentRaw ? JSON.parse(recentRaw) : [];
      if (!Array.isArray(recentList)) recentList = [];

      const existingIndex = recentList.findIndex((c: any) => c.userId === userId);
      const convData = {
        id: existingIndex !== -1 ? recentList[existingIndex].id : `conv_${userId}_${Date.now()}`,
        userId,
        name,
        username: existingIndex !== -1 ? recentList[existingIndex].username : name.toLowerCase().replace(/\s+/g, '_'),
        lastMessage: newMessage.text || (newMessage.type ? `${newMessage.type.toUpperCase()} file` : 'New message'),
        lastMessageType: newMessage.type || 'text',
        time: timeStr,
        unreadCount: 0,
        online: true,
        mediaFileName: newMessage.fileName,
      };

      if (existingIndex !== -1) {
        recentList[existingIndex] = { ...recentList[existingIndex], ...convData };
      } else {
        recentList.unshift(convData);
      }
      await storage.setItem(StorageKeys.RECENT_CONVERSATIONS, JSON.stringify(recentList));
    } catch (err) {
      console.error('Error saving chat message:', err);
    }
  };

  const handleStartInstantMeeting = () => {
    setShowMeetingModal(false);
    const meetingCode = Math.floor(100000 + Math.random() * 900000).toString();
    const roomName = `room_${meetingCode}`;
    startMeeting({
      roomName,
      token: '',
      serverUrl: 'https://livekit.cloudnewsmeet.com',
      displayName: user?.name || 'Host',
      meetingCode,
      meetingTitle: `Sync with ${name}`,
      isHost: true,
    });
  };

  const handleSendMeetingInvite = () => {
    setShowMeetingModal(false);
    const meetingCode = `${Math.floor(100 + Math.random() * 900)}-${Math.floor(100 + Math.random() * 900)}`;
    sendMessage({
      type: 'meeting_invite',
      text: `Cloud News Meeting: Sync with ${name}`,
      meetingCode,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  };

  const handleJoinMeetingCard = (code?: string) => {
    const meetingCode = code || '123-456';
    startMeeting({
      roomName: `room_${meetingCode.replace('-', '')}`,
      token: '',
      serverUrl: 'https://livekit.cloudnewsmeet.com',
      displayName: 'Participant',
      meetingCode,
      meetingTitle: `Meeting ${meetingCode}`,
      isHost: false,
    });
  };

  const toggleAudioPlayback = (id: string) => {
    setPlayingAudioId(prev => (prev === id ? null : id));
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, !isDark && { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }, !isDark && { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('Home');
            }
          }}
          style={[styles.backBtn, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <ChevronLeft color={isDark ? '#94a3b8' : colors.textPrimary} size={24} />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <View style={styles.avatarMini}>
            <Text style={[styles.avatarTextMini, getAvatarTextStyle(name, 12)]}>
              {getInitials(name, 'U')}
            </Text>
          </View>
          <View>
            <Text style={[styles.headerTitle, !isDark && { color: colors.textPrimary }]}>{name}</Text>
            <Text style={[styles.onlineStatus, !isDark && { color: colors.textSecondary }]}>Online</Text>
          </View>
        </View>

        {/* Start Meeting Icon in Header */}
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.meetingHeaderBtn, !isDark && { backgroundColor: colors.iconBoxBg, borderColor: 'rgba(0, 140, 208, 0.3)' }]}
            onPress={() => setShowMeetingModal(true)}
            activeOpacity={0.7}
          >
            <Video color={colors.primary} size={20} />
            <Text style={[styles.meetingHeaderBtnText, !isDark && { color: colors.primary }]}>Meet</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.chatArea}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyChatContainer}>
            <View style={[styles.emptyChatIconBox, !isDark && { backgroundColor: colors.iconBoxBg }]}>
              <MessageSquare color={colors.primary} size={32} />
            </View>
            <Text style={[styles.emptyChatTitle, !isDark && { color: colors.textPrimary }]}>No messages yet</Text>
            <Text style={[styles.emptyChatSub, !isDark && { color: colors.textSecondary }]}>
              Say hello to {name} or start a meeting to begin chatting.
            </Text>
          </View>
        ) : (
          messages.map((msg) => (
            <ChatMessageBubble
              key={msg.id}
              msg={msg}
              name={name}
              isDark={isDark}
              colors={colors}
              playingAudioId={playingAudioId}
              onSetPreviewMedia={setPreviewMedia}
              onToggleAudioPlayback={toggleAudioPlayback}
              onJoinMeetingCard={handleJoinMeetingCard}
            />
          ))
      )}
      </ScrollView>

      {/* Input Row */}
      <View style={[styles.inputRow, { paddingBottom: insets.bottom + 10 }, !isDark && { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        {/* Attachment Paperclip button placed outside the typing box */}
        <TouchableOpacity
          style={[styles.attachBtnOutside, !isDark && { backgroundColor: colors.cardSubtle }]}
          onPress={handlePickAndSendAttachment}
          activeOpacity={0.7}
        >
          <Paperclip
            color={colors.primary}
            size={22}
          />
        </TouchableOpacity>

        <View style={[styles.inputWrapper, !isDark && { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
          <TextInput
            style={[styles.input, !isDark && { color: colors.textPrimary }]}
            placeholder="Type a message..."
            placeholderTextColor={isDark ? '#64748b' : colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
          />

          <TouchableOpacity style={[styles.sendBtn, !isDark && { backgroundColor: colors.primary }]} onPress={() => sendMessage()} activeOpacity={0.7}>
            <Send color="#FFF" size={18} />
          </TouchableOpacity>
        </View>
      </View>

      {/* In-App Fullscreen Media Preview Modal */}
      <MediaPreviewModal
        visible={Boolean(previewMedia)}
        media={previewMedia}
        onClose={() => setPreviewMedia(null)}
      />

      {/* Start Meeting Option Modal */}
      <ChatMeetingInviteModal
        visible={showMeetingModal}
        name={name}
        isDark={isDark}
        colors={colors}
        onStartInstantMeeting={handleStartInstantMeeting}
        onSendMeetingInvite={handleSendMeetingInvite}
        onClose={() => setShowMeetingModal(false)}
      />
    </KeyboardAvoidingView>
  );
};

export default ChatDetailScreen;

