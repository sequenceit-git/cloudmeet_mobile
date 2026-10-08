import { useState, useRef, useEffect, useCallback } from 'react';
import { Alert, ScrollView } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { RoomEvent, ConnectionState } from 'livekit-client';
import { getMeetingMessages, sendMeetingMessage, uploadMeetingFile, normalizeMeetingCode } from '../../../services/api';
import { sanitizeMediaUrl, MediaPreviewItem } from '../../../components/meeting/MediaPreviewModal';
import { validateFileSize } from '../../../utils/fileValidation';
import { ChatMessage } from '../meetingRoomUtils';

export interface UseMeetingChatHandlerProps {
  room: any;
  localParticipant: any;
  isHost: boolean;
  currentUserName: string;
  meetingCode?: string;
  roomName?: string;
  isChatOpen: boolean;
  t: (key: string, options?: any) => string;
}

export const useMeetingChatHandler = ({
  room,
  localParticipant,
  isHost,
  currentUserName,
  meetingCode,
  roomName,
  isChatOpen,
  t,
}: UseMeetingChatHandlerProps) => {
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [previewMedia, setPreviewMedia] = useState<MediaPreviewItem | null>(null);

  const chatScrollViewRef = useRef<ScrollView>(null);
  const isChatOpenRef = useRef(isChatOpen);

  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
    if (isChatOpen) {
      setUnreadChatCount(0);
      setTimeout(() => {
        chatScrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [isChatOpen, messages.length]);

  const localParticipantRef = useRef(localParticipant);
  localParticipantRef.current = localParticipant;

  const currentUserNameRef = useRef(currentUserName);
  currentUserNameRef.current = currentUserName;

  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  const isFetchingHistoryRef = useRef(false);
  const lastFetchedMeetingCodeRef = useRef<string | null>(null);

  // Fetch previous chat messages and shared files from server
  const fetchMeetingMessages = useCallback(async () => {
    const code = meetingCode || roomName;
    if (!code) return;

    if (isFetchingHistoryRef.current) {
      return;
    }
    isFetchingHistoryRef.current = true;

    try {
      const res = await getMeetingMessages(code);
      if (res.success && Array.isArray(res.data)) {
        const historyMessages: ChatMessage[] = res.data.map(m => {
          const isSenderSelf = Boolean(
            (localParticipantRef.current?.name && m.sender_name === localParticipantRef.current.name) ||
            (currentUserNameRef.current && m.sender_name === currentUserNameRef.current) ||
            (isHostRef.current && (m.sender_name === 'Host' || m.sender_name === currentUserNameRef.current))
          );
          const rawTime = m.timestamp || m.created_at;
          const timeFormatted = rawTime
            ? new Date(rawTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          const messageText = m.message || m.text || '';
          const msgType = m.file_type || m.type || 'text';
          const mediaUrl = m.file_url || m.media_url;
          const clientMsgId = m.client_msg_id;
          const resolvedId = clientMsgId || String(m.id);

          return {
            id: resolvedId,
            clientMsgId: clientMsgId,
            sender: m.sender_name || 'Participant',
            text: messageText,
            time: timeFormatted,
            isSelf: isSenderSelf,
            type: msgType,
            fileName: m.file_name,
            fileSize: m.file_size,
            mediaUrl: sanitizeMediaUrl(mediaUrl),
            duration: m.duration,
          };
        });

        setMessages(prev => {
          const map = new Map<string, ChatMessage>();
          historyMessages.forEach(msg => {
            map.set(msg.id, msg);
            if (msg.clientMsgId) {
              map.set(msg.clientMsgId, msg);
            }
          });
          prev.forEach(msg => {
            const alreadyInHistory = historyMessages.some(
              h =>
                h.id === msg.id ||
                (msg.clientMsgId && (h.clientMsgId === msg.clientMsgId || h.id === msg.clientMsgId)) ||
                (h.clientMsgId && h.clientMsgId === msg.id) ||
                (h.text === msg.text && h.sender === msg.sender && h.type === msg.type && h.time === msg.time)
            );
            if (!alreadyInHistory) {
              map.set(msg.id, msg);
            }
          });
          return Array.from(new Set(map.values()));
        });
        lastFetchedMeetingCodeRef.current = code;
      }
    } catch (err: any) {
      console.warn('[Chat] Error fetching meeting messages history:', err);
    } finally {
      isFetchingHistoryRef.current = false;
    }
  }, [meetingCode, roomName]);

  useEffect(() => {
    const code = meetingCode || roomName;
    if (code && lastFetchedMeetingCodeRef.current && lastFetchedMeetingCodeRef.current !== code) {
      setMessages([]);
    }
  }, [meetingCode, roomName]);

  useEffect(() => {
    fetchMeetingMessages();
  }, [fetchMeetingMessages]);

  useEffect(() => {
    if (isChatOpen) {
      fetchMeetingMessages();
    }
  }, [isChatOpen, fetchMeetingMessages]);

  useEffect(() => {
    if (!room) return;
    const onConnected = () => {
      fetchMeetingMessages();
    };
    room.on(RoomEvent.Connected, onConnected);
    return () => {
      room.off(RoomEvent.Connected, onConnected);
    };
  }, [room, fetchMeetingMessages]);

  const sendChatMessage = useCallback(async () => {
    const textToSend = chatInput.trim();
    if (!textToSend) return;

    const activeParticipant = localParticipant || room?.localParticipant;
    if (!activeParticipant) {
      Alert.alert('Chat', 'Connecting to room... Please try again.');
      return;
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgId = 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
    const senderName = activeParticipant.name || currentUserName || (isHost ? 'Host' : 'Participant');

    const payload = JSON.stringify({
      type: 'CHAT',
      id: msgId,
      client_msg_id: msgId,
      sender: senderName,
      text: textToSend,
      message: textToSend,
      time: timeStr,
      msgType: 'text',
    });

    const newMessage: ChatMessage = {
      id: msgId,
      clientMsgId: msgId,
      sender: senderName,
      text: textToSend,
      time: timeStr,
      isSelf: true,
      type: 'text',
    };

    setMessages(prev => [...prev, newMessage]);
    setChatInput('');

    if (room?.state === ConnectionState.Connected) {
      const encoder = new TextEncoder();
      const data = encoder.encode(payload);

      try {
        await activeParticipant.publishData(data, { reliable: true } as any);
      } catch (e) {
        try {
          if ((room as any)?.engine) {
            (room as any).engine.publisherConnectionPromise = undefined;
          }
          await activeParticipant.publishData(data, { reliable: false } as any);
        } catch (e2) {
          if ((room as any)?.engine) {
            (room as any).engine.publisherConnectionPromise = undefined;
          }
          console.warn('[Chat] Notice: message broadcast deferred:', e2);
        }
      }
    }

    const code = meetingCode || roomName;
    if (code) {
      sendMeetingMessage(code, {
        type: 'text',
        file_type: 'text',
        text: textToSend,
        message: textToSend,
        sender_name: senderName,
        client_msg_id: msgId,
      }).catch(err => {
        console.warn('[Chat] Failed to persist chat message to server:', err);
      });
    }
  }, [chatInput, localParticipant, room, isHost, currentUserName, meetingCode, roomName]);

  const handlePickAndSendAttachment = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];
      const fileSize = file.size || 0;
      const validation = validateFileSize(fileSize);

      if (!validation.isValid) {
        Alert.alert(
          t('meeting.fileTooLargeTitle'),
          `${t('meeting.fileTooLargeDesc')}\n\n(${validation.sizeFormatted} > 5 MB)`
        );
        return;
      }

      const activeParticipant = localParticipant || room?.localParticipant;
      if (!activeParticipant) {
        Alert.alert('Chat', 'Connecting to room... Please wait.');
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
      const resolvedSize = validation.sizeFormatted || '1.5 MB';
      const defaultDuration = category === 'audio' ? '0:35' : category === 'video' ? '01:20' : undefined;
      const senderName = activeParticipant.name || currentUserName || (isHost ? 'Host' : 'Participant');
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const msgId = 'att_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);

      let finalMediaUrl: string | undefined = file.uri;

      try {
        setIsUploadingAttachment(true);
        setUploadProgress(15);
        const targetCode = meetingCode || roomName || '';
        const uploadRes = await uploadMeetingFile(
          targetCode,
          {
            uri: file.uri,
            name: file.name || 'file',
            type: file.mimeType || '*/*',
          },
          category,
          (progress) => setUploadProgress(progress)
        );

        if (uploadRes.success && uploadRes.data?.file_url) {
          finalMediaUrl = sanitizeMediaUrl(uploadRes.data.file_url);
        }
      } catch (uploadErr) {
        console.warn('[Chat] File upload warning:', uploadErr);
      } finally {
        setIsUploadingAttachment(false);
        setUploadProgress(0);
      }

      setMessages(prev => [
        ...prev,
        {
          id: msgId,
          clientMsgId: msgId,
          sender: senderName,
          text: title,
          time: timeStr,
          isSelf: true,
          type: category,
          fileName: title,
          fileSize: resolvedSize,
          mediaUrl: sanitizeMediaUrl(finalMediaUrl),
          duration: defaultDuration,
        },
      ]);

      if (room?.state === ConnectionState.Connected) {
        const payload = JSON.stringify({
          type: 'CHAT',
          id: msgId,
          client_msg_id: msgId,
          sender: senderName,
          text: title,
          message: title,
          msgType: category,
          file_type: category,
          fileName: title,
          file_name: title,
          fileSize: resolvedSize,
          file_size: resolvedSize,
          mediaUrl: sanitizeMediaUrl(finalMediaUrl),
          file_url: sanitizeMediaUrl(finalMediaUrl),
          duration: defaultDuration,
          time: timeStr,
        });

        const encoder = new TextEncoder();
        const data = encoder.encode(payload);

        try {
          await activeParticipant.publishData(data, { reliable: true } as any);
        } catch (e) {
          try {
            if ((room as any)?.engine) {
              (room as any).engine.publisherConnectionPromise = undefined;
            }
            await activeParticipant.publishData(data, { reliable: false } as any);
          } catch (e2) {
            if ((room as any)?.engine) {
              (room as any).engine.publisherConnectionPromise = undefined;
            }
            console.warn('[Chat] Warning broadcasting attachment:', e2);
          }
        }
      }

      const code = meetingCode || roomName;
      if (code) {
        sendMeetingMessage(code, {
          type: category,
          file_type: category,
          text: title,
          message: title,
          file_name: title,
          file_size: resolvedSize,
          media_url: finalMediaUrl,
          file_url: finalMediaUrl,
          duration: defaultDuration,
          sender_name: senderName,
          client_msg_id: msgId,
        }).catch(err => {
          console.warn('[Chat] Failed to persist file message to server:', err);
        });
      }
    } catch (err) {
      console.warn('[Chat] Error picking/sending attachment:', err);
    }
  }, [localParticipant, room, isHost, currentUserName, meetingCode, roomName, t]);

  return {
    chatInput,
    setChatInput,
    messages,
    setMessages,
    isUploadingAttachment,
    uploadProgress,
    unreadChatCount,
    setUnreadChatCount,
    previewMedia,
    setPreviewMedia,
    chatScrollViewRef,
    sendChatMessage,
    handlePickAndSendAttachment,
    fetchMeetingMessages,
  };
};

export default useMeetingChatHandler;
