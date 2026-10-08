import { Participant } from 'livekit-client';

export const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `00:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export interface ChatMessage {
  id: string;
  clientMsgId?: string;
  sender: string;
  text: string;
  time: string;
  isSelf: boolean;
  type?: 'text' | 'image' | 'video' | 'audio' | 'document';
  fileName?: string;
  fileSize?: string;
  mediaUrl?: string;
  duration?: string;
}

export const checkIsParticipantHost = (p?: Participant | null): boolean => {
  if (!p) return false;
  if (p.metadata === 'host') return true;
  if (p.metadata) {
    try {
      const meta = JSON.parse(p.metadata);
      if (meta.is_host === true || meta.role === 'host' || meta.type === 'host' || meta.roomAdmin === true) {
        return true;
      }
      if (meta.is_host === false) {
        return false;
      }
    } catch {}
  }
  return false;
};

export const formatMeetingCode = (rawCode?: string): string => {
  if (!rawCode) return '';
  let clean = rawCode.replace(/^cloudnews-/i, '').trim();
  const plain = clean.replace(/[^a-zA-Z0-9]/g, '');
  if (plain.length === 6 && !clean.includes('-')) {
    return `${plain.slice(0, 3)}-${plain.slice(3, 6)}`;
  }
  if (plain.length === 9 && !clean.includes('-')) {
    return `${plain.slice(0, 3)}-${plain.slice(3, 6)}-${plain.slice(6, 9)}`;
  }
  return clean;
};
