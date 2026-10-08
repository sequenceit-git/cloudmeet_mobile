/**
 * Cloud News Environment Configuration
 */

const IS_PRODUCTION = false;

export const ENV = {
  API_BASE_URL: IS_PRODUCTION
    ? 'https://api.cloudnewsmeet.com/api/v1' // Removed trailing slash
    : 'http://10.49.192.105:8001/api/v1',

  LIVEKIT_WS_URL: IS_PRODUCTION
    ? 'wss://livekit.cloudnewsmeet.com'
    : 'ws://10.49.192.105:7880',

  INVITE_WEB_URL: 'https://cloudnewsmeet.com',
  DEEP_LINK_SCHEME: 'cloudnews://',
};

/**
 * Ensures LiveKit server URL is accessible from physical devices.
 * If backend returns localhost, 127.0.0.1, or 10.0.2.2, rewrites it to ENV.LIVEKIT_WS_URL.
 */
export function resolveLiveKitServerUrl(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return ENV.LIVEKIT_WS_URL;
  if (
    rawUrl.includes('localhost') ||
    rawUrl.includes('127.0.0.1') ||
    rawUrl.includes('10.0.2.2')
  ) {
    return ENV.LIVEKIT_WS_URL;
  }
  return rawUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}
