import AsyncStorage from '@react-native-async-storage/async-storage';

export const StorageKeys = {
  AUTH_TOKEN: 'auth_token',
  USER_DATA: 'user_data',
  IS_GUEST: 'is_guest',
  RECENT_CONVERSATIONS: 'recent_conversations',
  THEME: 'app_theme',
  MEETING_SETTINGS: 'meeting_settings',
  PERSONAL_MEETING_CODE: 'cloudnews_personal_meeting_code',
};

export interface MeetingSettings {
  videoQuality: '720p' | '1080p' | '4k';
  frameRate: 30 | 60;
  audioMode: 'voice_clarity' | 'music_hifi';
  screenShareClarity: 'detail' | 'motion';
  hardwareAcceleration: boolean;
}

export const DEFAULT_MEETING_SETTINGS: MeetingSettings = {
  videoQuality: '1080p',
  frameRate: 30,
  audioMode: 'voice_clarity',
  screenShareClarity: 'detail',
  hardwareAcceleration: true,
};

const storage = {
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      console.error('Storage setItem error:', e);
    }
  },
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(key);
    } catch (e) {
      console.error('Storage getItem error:', e);
      return null;
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.error('Storage removeItem error:', e);
    }
  },
};

/**
 * Computes or retrieves a stable, deterministic 6-digit Personal Meeting Code (XXX-XXX)
 * for the given user profile.
 */
export const getPersonalMeetingCode = async (
  user?: { id?: number | string; username?: string; email?: string } | null
): Promise<string> => {
  const userKey = user?.id
    ? `${StorageKeys.PERSONAL_MEETING_CODE}_${user.id}`
    : StorageKeys.PERSONAL_MEETING_CODE;

  try {
    const saved = await storage.getItem(userKey);
    if (saved && /^\d{3}-\d{3}$/.test(saved)) {
      return saved;
    }
  } catch {}

  // Deterministic 6-digit generator from user ID or username
  const seed = String(user?.id || user?.username || user?.email || 'cloudnews-host');
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const codeNum = 100000 + (Math.abs(hash) % 900000);
  const codeStr = String(codeNum);
  const formatted = `${codeStr.slice(0, 3)}-${codeStr.slice(3, 6)}`;

  try {
    await storage.setItem(userKey, formatted);
  } catch {}

  return formatted;
};

export default storage;

