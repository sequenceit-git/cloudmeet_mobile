import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../../hooks/useTranslation';
import LinearGradient from 'react-native-linear-gradient';
import {
  MessageSquare,
  X,
  Image as ImageIcon,
  Play,
  Film,
  Eye,
  FileText,
  Paperclip,
  Send,
} from 'lucide-react-native';
import { styles } from '../meetingRoomStyles';
import { ChatMessage } from '../meetingRoomUtils';
import { MediaPreviewItem, sanitizeMediaUrl } from '../../../components/meeting/MediaPreviewModal';

export interface MeetingChatDrawerProps {
  insets: EdgeInsets;
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  chatScrollViewRef: React.RefObject<ScrollView | null>;
  chatInput: string;
  setChatInput: (text: string) => void;
  onSendMessage: () => void;
  onPickAndSendAttachment: () => void;
  isUploadingAttachment: boolean;
  uploadProgress: number;
  onPreviewMedia: (media: MediaPreviewItem) => void;
}

export const MeetingChatDrawer: React.FC<MeetingChatDrawerProps> = ({
  insets,
  isOpen,
  onClose,
  messages,
  chatScrollViewRef,
  chatInput,
  setChatInput,
  onSendMessage,
  onPickAndSendAttachment,
  isUploadingAttachment,
  uploadProgress,
  onPreviewMedia,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <View style={[styles.drawer, { paddingTop: insets.top }]}>
      <View style={styles.dragHandleWrapper}>
        <View style={styles.dragHandle} />
      </View>
      <View style={styles.drawerHeader}>
        <View style={styles.drawerTitleRow}>
          <MessageSquare color="#00A8FF" size={20} />
          <Text style={styles.drawerTitle}>In-Meeting Chat</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <X color="#94a3b8" size={22} />
        </TouchableOpacity>
      </View>
      <ScrollView
        ref={chatScrollViewRef as any}
        style={styles.chatList}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatText}>No messages yet. Start the conversation!</Text>
          </View>
        ) : (
          messages.map((msg) => {
            const isSelf = msg.isSelf;

            if (msg.type === 'image') {
              const cleanedUrl = sanitizeMediaUrl(msg.mediaUrl);
              return (
                <View key={msg.id} style={isSelf ? styles.msgRowUser : styles.msgRow}>
                  <View style={[styles.msgHeader, isSelf && { justifyContent: 'flex-end' }]}>
                    {!isSelf && <Text style={[styles.msgName, { color: '#00A8FF' }]}>{msg.sender}</Text>}
                    <Text style={styles.msgTime}>{msg.time}</Text>
                    {isSelf && <Text style={[styles.msgName, { color: '#38bdf8', marginLeft: 6 }]}>You</Text>}
                  </View>
                  <TouchableOpacity
                    style={[styles.mediaBubble, isSelf ? styles.mediaBubbleSelf : styles.mediaBubbleOther]}
                    activeOpacity={0.8}
                    onPress={() => {
                      onPreviewMedia({
                        uri: cleanedUrl,
                        type: 'image',
                        fileName: msg.fileName || msg.text,
                        fileSize: msg.fileSize,
                        sender: isSelf ? 'You' : msg.sender,
                        time: msg.time,
                        text: msg.text,
                      });
                    }}
                  >
                    {cleanedUrl ? (
                      <Image source={{ uri: cleanedUrl }} style={styles.imagePreview as any} resizeMode="cover" />
                    ) : (
                      <View style={styles.imagePlaceholder}>
                        <ImageIcon color="#00A8FF" size={30} />
                      </View>
                    )}
                    <Text style={styles.mediaCaptionText}>{msg.text}</Text>
                  </TouchableOpacity>
                </View>
              );
            }

            if (msg.type === 'video') {
              const cleanedUrl = sanitizeMediaUrl(msg.mediaUrl);
              return (
                <View key={msg.id} style={isSelf ? styles.msgRowUser : styles.msgRow}>
                  <View style={[styles.msgHeader, isSelf && { justifyContent: 'flex-end' }]}>
                    {!isSelf && <Text style={[styles.msgName, { color: '#00A8FF' }]}>{msg.sender}</Text>}
                    <Text style={styles.msgTime}>{msg.time}</Text>
                    {isSelf && <Text style={[styles.msgName, { color: '#38bdf8', marginLeft: 6 }]}>You</Text>}
                  </View>
                  <TouchableOpacity
                    style={[styles.mediaBubble, isSelf ? styles.mediaBubbleSelf : styles.mediaBubbleOther]}
                    activeOpacity={0.8}
                    onPress={() => {
                      onPreviewMedia({
                        uri: cleanedUrl,
                        type: 'video',
                        fileName: msg.fileName || msg.text,
                        fileSize: msg.fileSize,
                        sender: isSelf ? 'You' : msg.sender,
                        time: msg.time,
                        duration: msg.duration,
                        text: msg.text,
                      });
                    }}
                  >
                    <View style={styles.videoCard}>
                      <View style={[styles.videoThumbnail, styles.videoPlaceholder]} />
                      <View style={styles.videoOverlay}>
                        <View style={styles.playIconCircle}>
                          <Play color="#FFFFFF" size={18} fill="#FFFFFF" style={{ marginLeft: 2 }} />
                        </View>
                        <View style={styles.videoDurationBadge}>
                          <Text style={styles.videoDurationText}>{msg.duration || '01:20'}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.videoDetailsRow}>
                      <Film color="#10B981" size={15} />
                      <Text style={styles.videoFilename} numberOfLines={1}>
                        {msg.fileName || msg.text}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            }

            if (msg.type === 'audio') {
              const cleanedUrl = sanitizeMediaUrl(msg.mediaUrl);
              return (
                <View key={msg.id} style={isSelf ? styles.msgRowUser : styles.msgRow}>
                  <View style={[styles.msgHeader, isSelf && { justifyContent: 'flex-end' }]}>
                    {!isSelf && <Text style={[styles.msgName, { color: '#00A8FF' }]}>{msg.sender}</Text>}
                    <Text style={styles.msgTime}>{msg.time}</Text>
                    {isSelf && <Text style={[styles.msgName, { color: '#38bdf8', marginLeft: 6 }]}>You</Text>}
                  </View>
                  <TouchableOpacity
                    style={[styles.audioBubble, isSelf ? styles.audioBubbleSelf : styles.audioBubbleOther]}
                    activeOpacity={0.8}
                    onPress={() => {
                      onPreviewMedia({
                        uri: cleanedUrl,
                        type: 'audio',
                        fileName: msg.fileName || msg.text,
                        fileSize: msg.fileSize,
                        sender: isSelf ? 'You' : msg.sender,
                        time: msg.time,
                        duration: msg.duration,
                        text: msg.text,
                      });
                    }}
                  >
                    <View style={styles.audioPlayBtn}>
                      <Play color="#FFFFFF" size={16} fill="#FFFFFF" style={{ marginLeft: 2 }} />
                    </View>
                    <View style={styles.audioWaveContainer}>
                      <Text style={styles.audioTitleText} numberOfLines={1}>
                        {msg.fileName || msg.text}
                      </Text>
                      <Text style={styles.audioDurationText}>{msg.duration || '0:35'}</Text>
                    </View>
                    {Boolean(cleanedUrl) && (
                      <View style={{ padding: 6, backgroundColor: 'rgba(245, 158, 11, 0.2)', borderRadius: 8, marginLeft: 8 }}>
                        <Eye color="#F59E0B" size={16} />
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              );
            }

            if (msg.type === 'document') {
              const cleanedUrl = sanitizeMediaUrl(msg.mediaUrl);
              return (
                <View key={msg.id} style={isSelf ? styles.msgRowUser : styles.msgRow}>
                  <View style={[styles.msgHeader, isSelf && { justifyContent: 'flex-end' }]}>
                    {!isSelf && <Text style={[styles.msgName, { color: '#00A8FF' }]}>{msg.sender}</Text>}
                    <Text style={styles.msgTime}>{msg.time}</Text>
                    {isSelf && <Text style={[styles.msgName, { color: '#38bdf8', marginLeft: 6 }]}>You</Text>}
                  </View>
                  <TouchableOpacity
                    style={[styles.docBubble, isSelf ? styles.docBubbleSelf : styles.docBubbleOther]}
                    activeOpacity={0.8}
                    onPress={() => {
                      onPreviewMedia({
                        uri: cleanedUrl,
                        type: 'document',
                        fileName: msg.fileName || msg.text,
                        fileSize: msg.fileSize,
                        sender: isSelf ? 'You' : msg.sender,
                        time: msg.time,
                        text: msg.text,
                      });
                    }}
                  >
                    <View style={styles.docTopRow}>
                      <View style={styles.docIconBox}>
                        <FileText color="#8B5CF6" size={20} />
                      </View>
                      <View style={styles.docInfo}>
                        <Text style={styles.docFileName} numberOfLines={1}>
                          {msg.fileName || msg.text}
                        </Text>
                        <Text style={styles.docFileSize}>{msg.fileSize || '2.4 MB'}</Text>
                      </View>
                      {Boolean(cleanedUrl) && (
                        <View style={{ padding: 6, backgroundColor: 'rgba(0, 168, 255, 0.15)', borderRadius: 8, marginLeft: 8 }}>
                          <Eye color="#00A8FF" size={16} />
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              );
            }

            return (
              <View key={msg.id} style={msg.isSelf ? styles.msgRowUser : styles.msgRow}>
                <View style={[styles.msgHeader, msg.isSelf && { justifyContent: 'flex-end' }]}>
                  {!msg.isSelf && <Text style={[styles.msgName, { color: '#00A8FF' }]}>{msg.sender}</Text>}
                  <Text style={styles.msgTime}>{msg.time}</Text>
                  {msg.isSelf && <Text style={[styles.msgName, { color: '#38bdf8', marginLeft: 6 }]}>You</Text>}
                </View>
                <LinearGradient
                  colors={msg.isSelf ? ['#00A8FF', '#0066CC'] : ['#1E293B', '#1E293B']}
                  style={msg.isSelf ? styles.msgBubbleUser : styles.msgBubble}
                >
                  <Text style={styles.msgText}>{msg.text}</Text>
                </LinearGradient>
              </View>
            );
          })
        )}
      </ScrollView>

      {isUploadingAttachment && (
        <View style={styles.uploadingProgressBanner}>
          <ActivityIndicator size="small" color="#00A8FF" style={{ marginRight: 8 }} />
          <Text style={styles.uploadingProgressText}>
            Uploading attachment ({uploadProgress}%)...
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        <View style={[styles.chatInputRow, { marginBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={onPickAndSendAttachment}
            disabled={isUploadingAttachment}
            activeOpacity={0.7}
          >
            <Paperclip color="#00A8FF" size={20} />
          </TouchableOpacity>
          <TextInput
            style={styles.chatInput}
            placeholder={t('meeting.typeMessage')}
            placeholderTextColor="#64748b"
            value={chatInput}
            onChangeText={setChatInput}
            onSubmitEditing={onSendMessage}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !chatInput.trim() && { opacity: 0.45 }]}
            onPress={onSendMessage}
            disabled={!chatInput.trim()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Send color="#FFF" size={18} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

export default MeetingChatDrawer;
