import React from 'react';
import { View, Text, TouchableOpacity, Image, Alert } from 'react-native';
import {
  Film,
  Play,
  Pause,
  FileText,
  Download,
  Video,
} from 'lucide-react-native';
import { Message } from '../ChatDetailScreen';
import { MediaPreviewItem, sanitizeMediaUrl } from '../../components/meeting/MediaPreviewModal';
import { styles } from './chatDetailStyles';

interface ChatMessageBubbleProps {
  msg: Message;
  name: string;
  isDark: boolean;
  colors: any;
  playingAudioId: string | null;
  onSetPreviewMedia: (media: MediaPreviewItem) => void;
  onToggleAudioPlayback: (id: string) => void;
  onJoinMeetingCard: (code?: string) => void;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({
  msg,
  name,
  isDark,
  colors,
  playingAudioId,
  onSetPreviewMedia,
  onToggleAudioPlayback,
  onJoinMeetingCard,
}) => {
  const isSelf = msg.isSelf;

  if (msg.type === 'image') {
    const cleanedUrl = sanitizeMediaUrl(msg.mediaUrl);
    return (
      <View key={msg.id} style={[styles.msgRow, isSelf ? styles.msgRowSelf : styles.msgRowOther]}>
        <View style={[styles.mediaBubble, isSelf ? styles.mediaBubbleSelf : styles.mediaBubbleOther, !isDark && !isSelf && { backgroundColor: colors.card, borderColor: colors.border }]}>
          {cleanedUrl && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => onSetPreviewMedia({
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
            onPress={() => onSetPreviewMedia({
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
                onSetPreviewMedia({
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
                onToggleAudioPlayback(msg.id);
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
                onSetPreviewMedia({
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
            onPress={() => onJoinMeetingCard(msg.meetingCode)}
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
};

export default ChatMessageBubble;
