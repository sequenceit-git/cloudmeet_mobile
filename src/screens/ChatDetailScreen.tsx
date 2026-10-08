import { useNavigation, useRoute } from '@react-navigation/native';
import {
  ChevronLeft,
  Send,
  Plus,
  Paperclip,
  X,
  Video,
  Image as ImageIcon,
  Film,
  Headphones,
  FileText,
  Play,
  Pause,
  Download,
  Calendar,
  MessageSquare,
  FolderOpen,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { validateFileSize, formatBytes, MAX_FILE_SIZE_BYTES } from '../utils/fileValidation';
import { getInitials, getAvatarTextStyle } from '../utils/helpers';
import { useTranslation } from '../hooks/useTranslation';
import React, { useState, useRef, useEffect } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackNavigationProp, RootStackRouteProp } from '../navigation/types';
import { useMeetingContext } from '../context/MeetingContext';
import { useUser } from '../context/UserContext';
import storage, { StorageKeys } from '../services/storage';
import { useTheme } from '../context/ThemeContext';
import { MediaPreviewModal, MediaPreviewItem, sanitizeMediaUrl } from '../components/meeting/MediaPreviewModal';

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
          messages.map((msg) => {
          const isSelf = msg.isSelf;

          if (msg.type === 'image') {
            const cleanedUrl = sanitizeMediaUrl(msg.mediaUrl);
            return (
              <View key={msg.id} style={[styles.msgRow, isSelf ? styles.msgRowSelf : styles.msgRowOther]}>
                <View style={[styles.mediaBubble, isSelf ? styles.mediaBubbleSelf : styles.mediaBubbleOther, !isDark && !isSelf && { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {Boolean(cleanedUrl) && (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setPreviewMedia({
                        uri: cleanedUrl,
                        type: 'image',
                        fileName: msg.fileName || msg.text,
                        fileSize: msg.fileSize,
                        sender: isSelf ? 'You' : name,
                        time: msg.time,
                        text: msg.text,
                      })}
                    >
                      <Image source={{ uri: cleanedUrl }} style={styles.imagePreview} />
                    </TouchableOpacity>
                  )}
                  {msg.text ? <Text style={[styles.mediaCaptionText, !isDark && !isSelf && { color: colors.textPrimary }]}>{msg.text}</Text> : null}
                  <Text style={[styles.mediaTimeText, !isDark && !isSelf && { color: colors.textSecondary }]}>{msg.time}</Text>
                </View>
              </View>
            );
          }

          if (msg.type === 'video') {
            const cleanedUrl = sanitizeMediaUrl(msg.mediaUrl);
            return (
              <View key={msg.id} style={[styles.msgRow, isSelf ? styles.msgRowSelf : styles.msgRowOther]}>
                <View style={[styles.mediaBubble, isSelf ? styles.mediaBubbleSelf : styles.mediaBubbleOther, !isDark && !isSelf && { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.videoCard}
                    onPress={() => setPreviewMedia({
                      uri: cleanedUrl,
                      type: 'video',
                      fileName: msg.fileName || msg.text,
                      fileSize: msg.fileSize,
                      sender: isSelf ? 'You' : name,
                      time: msg.time,
                      duration: msg.duration,
                      text: msg.text,
                    })}
                  >
                    {cleanedUrl ? (
                      <Image source={{ uri: cleanedUrl }} style={styles.videoThumbnail} />
                    ) : (
                      <View style={[styles.videoThumbnail, styles.videoPlaceholder]} />
                    )}
                    <View style={styles.videoOverlay}>
                      <View style={styles.playIconCircle}>
                        <Play color="#FFFFFF" size={20} fill="#FFFFFF" style={{ marginLeft: 2 }} />
                      </View>
                      <View style={styles.videoDurationBadge}>
                        <Text style={styles.videoDurationText}>{msg.duration || '01:45'}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.videoDetailsRow}>
                    <Film color="#10B981" size={16} />
                    <Text style={[styles.videoFilename, !isDark && !isSelf && { color: colors.textPrimary }]} numberOfLines={1}>
                      {msg.fileName || msg.text || 'Video Recording'}
                    </Text>
                  </View>
                  <Text style={[styles.mediaTimeText, !isDark && !isSelf && { color: colors.textSecondary }]}>{msg.time}</Text>
                </View>
              </View>
            );
          }

          if (msg.type === 'audio') {
            const isPlaying = playingAudioId === msg.id;
            const cleanedUrl = sanitizeMediaUrl(msg.mediaUrl);
            return (
              <View key={msg.id} style={[styles.msgRow, isSelf ? styles.msgRowSelf : styles.msgRowOther]}>
                <View style={[styles.audioBubble, isSelf ? styles.audioBubbleSelf : styles.audioBubbleOther, !isDark && !isSelf && { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TouchableOpacity
                    style={[styles.audioPlayBtn, isPlaying && styles.audioPlayBtnActive]}
                    onPress={() => {
                      if (cleanedUrl) {
                        setPreviewMedia({
                          uri: cleanedUrl,
                          type: 'audio',
                          fileName: msg.fileName || msg.text,
                          fileSize: msg.fileSize,
                          sender: isSelf ? 'You' : name,
                          time: msg.time,
                          duration: msg.duration,
                          text: msg.text,
                        });
                      } else {
                        toggleAudioPlayback(msg.id);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    {isPlaying ? (
                      <Pause color="#FFFFFF" size={16} fill="#FFFFFF" />
                    ) : (
                      <Play color="#FFFFFF" size={16} fill="#FFFFFF" style={{ marginLeft: 2 }} />
                    )}
                  </TouchableOpacity>

                  <View style={styles.audioWaveContainer}>
                    {/* Simulated visual waveform */}
                    <View style={styles.waveformBars}>
                      {[18, 28, 14, 32, 22, 38, 16, 26, 34, 18, 30, 20, 26, 14, 28, 22].map((height, i) => (
                        <View
                          key={i}
                          style={[
                            styles.waveBar,
                            {
                              height,
                              backgroundColor: isPlaying
                                ? i % 2 === 0
                                  ? colors.primary
                                  : '#38BDF8'
                                : isSelf
                                  ? 'rgba(255, 255, 255, 0.7)'
                                  : (isDark ? '#64748b' : colors.textMuted),
                            },
                          ]}
                        />
                      ))}
                    </View>
                    <View style={styles.audioMetaRow}>
                      <Text style={[styles.audioDurationText, !isDark && !isSelf && { color: colors.textSecondary }]}>
                        {isPlaying ? '0:14' : msg.duration || '0:38'}
                      </Text>
                      <Text style={[styles.audioSizeText, !isDark && !isSelf && { color: colors.textMuted }]}>{msg.fileSize || '620 KB'}</Text>
                    </View>
                  </View>
                  <Text style={[styles.audioTimeText, !isDark && !isSelf && { color: colors.textSecondary }]}>{msg.time}</Text>
                </View>
              </View>
            );
          }

          if (msg.type === 'document') {
            const cleanedUrl = sanitizeMediaUrl(msg.mediaUrl);
            return (
              <View key={msg.id} style={[styles.msgRow, isSelf ? styles.msgRowSelf : styles.msgRowOther]}>
                <View style={[styles.docBubble, isSelf ? styles.docBubbleSelf : styles.docBubbleOther, !isDark && !isSelf && { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.docTopRow}>
                    <View style={styles.docIconBox}>
                      <FileText color="#8B5CF6" size={22} />
                    </View>
                    <View style={styles.docInfo}>
                      <Text style={[styles.docFileName, !isDark && !isSelf && { color: colors.textPrimary }]} numberOfLines={1}>
                        {msg.fileName || msg.text || 'Document.pdf'}
                      </Text>
                      <Text style={[styles.docFileSize, !isDark && !isSelf && { color: colors.textSecondary }]}>{msg.fileSize || '2.4 MB'}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.docDownloadBtn, !isDark && { backgroundColor: colors.cardSubtle }]}
                    onPress={() => {
                      if (cleanedUrl) {
                        setPreviewMedia({
                          uri: cleanedUrl,
                          type: 'document',
                          fileName: msg.fileName || msg.text,
                          fileSize: msg.fileSize,
                          sender: isSelf ? 'You' : name,
                          time: msg.time,
                          text: msg.text,
                        });
                      } else {
                        Alert.alert('Document Ready', `Opening ${msg.fileName || 'file'}...`);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Download color={colors.primary} size={14} />
                    <Text style={[styles.docDownloadText, !isDark && { color: colors.primary }]}>Download & View</Text>
                  </TouchableOpacity>
                  <Text style={[styles.docTimeText, !isDark && !isSelf && { color: colors.textSecondary }]}>{msg.time}</Text>
                </View>
              </View>
            );
          }

          if (msg.type === 'meeting_invite') {
            return (
              <View key={msg.id} style={[styles.msgRow, isSelf ? styles.msgRowSelf : styles.msgRowOther]}>
                <View style={[styles.meetingCardBubble, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.meetingCardHeader}>
                    <View style={[styles.meetingCardIconCircle, !isDark && { backgroundColor: colors.iconBoxBg }]}>
                      <Video color={colors.primary} size={18} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.meetingCardTitle, !isDark && { color: colors.textPrimary }]}>{msg.text || 'Cloud News Meeting'}</Text>
                      <Text style={[styles.meetingCardCode, !isDark && { color: colors.textSecondary }]}>Code: {msg.meetingCode || '123-456'}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.meetingJoinBtn}
                    onPress={() => handleJoinMeetingCard(msg.meetingCode)}
                    activeOpacity={0.8}
                  >
                    <Video color="#FFFFFF" size={16} />
                    <Text style={styles.meetingJoinBtnText}>Join Meeting</Text>
                  </TouchableOpacity>
                  <Text style={[styles.meetingCardTime, !isDark && { color: colors.textSecondary }]}>{msg.time}</Text>
                </View>
              </View>
            );
          }

          // Default text bubble
          return (
            <View key={msg.id} style={[styles.msgRow, isSelf ? styles.msgRowSelf : styles.msgRowOther]}>
              <View style={[styles.bubble, isSelf ? styles.bubbleSelf : styles.bubbleOther, !isDark && !isSelf && { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.msgText, !isDark && !isSelf && { color: colors.textPrimary }]}>{msg.text}</Text>
                <Text style={[styles.msgTime, !isDark && !isSelf && { color: colors.textSecondary }]}>{msg.time}</Text>
              </View>
            </View>
          );
        })
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
      <Modal visible={showMeetingModal} transparent animationType="fade">
        <View style={[styles.meetingModalBackdrop, !isDark && { backgroundColor: colors.modalOverlay }]}>
          <View style={[styles.meetingModalCard, !isDark && { backgroundColor: colors.modalBg, borderColor: colors.border }]}>
            <View style={styles.meetingModalHeader}>
              <View style={[styles.meetingModalIcon, !isDark && { backgroundColor: colors.iconBoxBg }]}>
                <Video color={colors.primary} size={24} />
              </View>
              <Text style={[styles.meetingModalTitle, !isDark && { color: colors.textPrimary }]}>Meeting with {name}</Text>
              <Text style={[styles.meetingModalSubtitle, !isDark && { color: colors.textSecondary }]}>Choose how you want to connect</Text>
            </View>

            <TouchableOpacity
              style={styles.meetingModalPrimaryBtn}
              onPress={handleStartInstantMeeting}
              activeOpacity={0.8}
            >
              <Video color="#FFFFFF" size={18} />
              <Text style={styles.meetingModalPrimaryText}>Start Instant Meeting</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.meetingModalSecondaryBtn, !isDark && { backgroundColor: colors.iconBoxBg, borderColor: 'rgba(0, 140, 208, 0.3)' }]}
              onPress={handleSendMeetingInvite}
              activeOpacity={0.8}
            >
              <Calendar color={colors.primary} size={18} />
              <Text style={[styles.meetingModalSecondaryText, !isDark && { color: colors.primary }]}>Send Invite Card in Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.meetingModalCancelBtn, !isDark && { backgroundColor: colors.cardSubtle }]}
              onPress={() => setShowMeetingModal(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.meetingModalCancelText, !isDark && { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(5, 11, 20, 0.95)',
  },
  backBtn: {
    marginRight: 12,
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarMini: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#00A8FF20',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#00A8FF40',
  },
  avatarTextMini: {
    color: '#00A8FF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  onlineStatus: {
    color: '#10b981',
    fontSize: 10,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  meetingHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 168, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
  },
  meetingHeaderBtnText: {
    color: '#00A8FF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  chatArea: {
    flex: 1,
  },
  chatContent: {
    padding: 20,
    gap: 16,
  },
  msgRow: {
    flexDirection: 'row',
    width: '100%',
  },
  msgRowSelf: {
    justifyContent: 'flex-end',
  },
  msgRowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  bubbleSelf: {
    backgroundColor: '#00A8FF',
    borderTopRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  msgText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Medium',
    lineHeight: 20,
  },
  msgTime: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 9,
    marginTop: 4,
    alignSelf: 'flex-end',
    fontFamily: 'PlusJakartaSans-Regular',
  },
  // Media bubbles
  mediaBubble: {
    width: 240,
    borderRadius: 16,
    overflow: 'hidden',
    padding: 8,
  },
  mediaBubbleSelf: {
    backgroundColor: '#0B233D',
    borderTopRightRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
  },
  mediaBubbleOther: {
    backgroundColor: '#0B1728',
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  imagePreview: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  mediaCaptionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Medium',
    marginTop: 8,
    marginHorizontal: 4,
  },
  mediaTimeText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 9,
    marginTop: 6,
    marginRight: 4,
    alignSelf: 'flex-end',
    fontFamily: 'PlusJakartaSans-Regular',
  },
  // Video card
  videoCard: {
    position: 'relative',
    width: '100%',
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
  },
  videoPlaceholder: {
    backgroundColor: '#1E293B',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 168, 255, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  videoDurationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  videoDurationText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  videoDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginHorizontal: 4,
  },
  videoFilename: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  // Audio bubble
  audioBubble: {
    width: 250,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    gap: 10,
  },
  audioBubbleSelf: {
    backgroundColor: '#0B233D',
    borderTopRightRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
  },
  audioBubbleOther: {
    backgroundColor: '#0B1728',
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  audioPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioPlayBtnActive: {
    backgroundColor: '#EF4444',
  },
  audioWaveContainer: {
    flex: 1,
  },
  waveformBars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 38,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  audioMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  audioDurationText: {
    color: '#94A3B8',
    fontSize: 10,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  audioSizeText: {
    color: '#64748B',
    fontSize: 9,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  audioTimeText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 9,
    alignSelf: 'flex-end',
    fontFamily: 'PlusJakartaSans-Regular',
  },
  // Document bubble
  docBubble: {
    width: 250,
    padding: 12,
    borderRadius: 16,
    gap: 10,
  },
  docBubbleSelf: {
    backgroundColor: '#0B233D',
    borderTopRightRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
  },
  docBubbleOther: {
    backgroundColor: '#0B1728',
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  docTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  docIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  docInfo: {
    flex: 1,
  },
  docFileName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  docFileSize: {
    color: '#94A3B8',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Regular',
    marginTop: 2,
  },
  docDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 168, 255, 0.1)',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.25)',
  },
  docDownloadText: {
    color: '#00A8FF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  docTimeText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 9,
    alignSelf: 'flex-end',
    fontFamily: 'PlusJakartaSans-Regular',
  },
  // Meeting Invite Bubble
  meetingCardBubble: {
    width: 260,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#0B233D',
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.4)',
    gap: 12,
  },
  meetingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  meetingCardIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 168, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meetingCardTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  meetingCardCode: {
    color: '#38BDF8',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Medium',
    marginTop: 2,
  },
  meetingJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00A8FF',
    paddingVertical: 10,
    borderRadius: 12,
  },
  meetingJoinBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  meetingCardTime: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 9,
    alignSelf: 'flex-end',
    fontFamily: 'PlusJakartaSans-Regular',
  },
  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: 'rgba(5, 11, 20, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    gap: 10,
  },
  attachBtnOutside: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  input: {
    flex: 1,
    color: '#FFF',
    fontFamily: 'PlusJakartaSans-Medium',
    fontSize: 14,
    maxHeight: 100,
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    paddingBottom: Platform.OS === 'ios' ? 8 : 4,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#00A8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -10,
  },
  // Attachment sheet
  attachSheet: {
    backgroundColor: '#0B1728',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  attachSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  attachSheetTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  attachSheetClose: {
    padding: 4,
  },
  attachGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 4,
  },
  attachOption: {
    alignItems: 'center',
    gap: 8,
  },
  attachOptionIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  attachOptionLabel: {
    color: '#E2E8F0',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  // Picker modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: '#0B1728',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pickerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  pickerModalTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  pickerModalClose: {
    padding: 6,
  },
  pickerItemsList: {
    marginTop: 12,
  },
  pickerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    gap: 12,
  },
  pickerItemThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  pickerItemIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerItemInfo: {
    flex: 1,
  },
  pickerItemTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  pickerItemSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Regular',
    marginTop: 2,
  },
  pickerSendChip: {
    backgroundColor: '#00A8FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  pickerSendChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  // Fullscreen modals
  fullscreenModal: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenCloseBtn: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '80%',
  },
  videoPlayerBox: {
    width: '90%',
    height: 380,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0B1728',
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayerImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.65,
  },
  videoPlayerCenterBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#00A8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayerBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(5, 11, 20, 0.85)',
    padding: 16,
  },
  videoPlayerTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  videoPlayerDuration: {
    color: '#94A3B8',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Medium',
    marginTop: 4,
  },
  // Meeting option modal
  meetingModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  meetingModalCard: {
    width: '100%',
    backgroundColor: '#0B1728',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
    gap: 14,
  },
  meetingModalHeader: {
    alignItems: 'center',
    marginBottom: 8,
  },
  meetingModalIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0, 168, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
  },
  meetingModalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
    textAlign: 'center',
  },
  meetingModalSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Regular',
    marginTop: 4,
    textAlign: 'center',
  },
  meetingModalPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00A8FF',
    paddingVertical: 14,
    borderRadius: 14,
  },
  meetingModalPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  meetingModalSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 168, 255, 0.1)',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.25)',
  },
  meetingModalSecondaryText: {
    color: '#00A8FF',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  meetingModalCancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  meetingModalCancelText: {
    color: '#64748B',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  emptyChatContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
    paddingHorizontal: 32,
  },
  emptyChatIconBox: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(0, 168, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyChatTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans-Bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyChatSub: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Regular',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  customAttachForm: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  limitBadgeRow: {
    marginBottom: 12,
    alignItems: 'flex-start',
    paddingHorizontal: 20,
  },
  limitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 168, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 255, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  limitBadgeText: {
    color: '#00A8FF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  chooseFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 168, 255, 0.1)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(0, 168, 255, 0.4)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  chooseFileBtnText: {
    color: '#00A8FF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  inputErrorBorder: {
    borderColor: '#EF4444',
  },
  errorAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  errorAlertText: {
    color: '#EF4444',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Medium',
    flex: 1,
  },
  customAttachLabel: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: '#94A3B8',
    marginBottom: 8,
  },
  customAttachInput: {
    backgroundColor: '#050B14',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Medium',
    color: '#FFFFFF',
  },
  customAttachActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
  },
  customAttachCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customAttachCancelText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-SemiBold',
    color: '#94A3B8',
  },
  customAttachSendBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#00A8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customAttachSendText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Bold',
    color: '#FFFFFF',
  },
});

export default ChatDetailScreen;
