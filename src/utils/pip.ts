import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { PictureInPictureModule } = NativeModules;

export interface PipStatus {
  isInPip: boolean;
}

/**
 * Checks if Picture-in-Picture is supported by the device (Android 8.0+ / API 26+)
 */
export async function isPipSupported(): Promise<boolean> {
  if (Platform.OS !== 'android' || !PictureInPictureModule?.isPipSupported) {
    return false;
  }
  try {
    return await PictureInPictureModule.isPipSupported();
  } catch {
    return false;
  }
}

/**
 * Checks if the app is currently in Picture-in-Picture mode
 */
export async function isInPipMode(): Promise<boolean> {
  if (Platform.OS !== 'android' || !PictureInPictureModule?.isInPipMode) {
    return false;
  }
  try {
    return await PictureInPictureModule.isInPipMode();
  } catch {
    return false;
  }
}

/**
 * Request the activity to enter Picture-in-Picture mode immediately.
 * Default aspect ratio is 9:16 (vertical mobile meeting).
 */
export async function enterPictureInPicture(width: number = 9, height: number = 16): Promise<boolean> {
  if (Platform.OS !== 'android' || !PictureInPictureModule?.enterPictureInPicture) {
    return false;
  }
  try {
    return await PictureInPictureModule.enterPictureInPicture(width, height);
  } catch (err) {
    console.warn('[PiP] enterPictureInPicture error:', err);
    return false;
  }
}

/**
 * Expands/maximizes the Android activity from Picture-in-Picture back to full-screen.
 */
export function maximizeFromPip(): void {
  if (Platform.OS === 'android' && PictureInPictureModule?.maximize) {
    try {
      PictureInPictureModule.maximize();
    } catch (err) {
      console.warn('[PiP] maximize error:', err);
    }
  }
}

/**
 * Synchronizes meeting and screen share status with the native Android layer.
 * When in meeting and screen share is OFF -> PiP is enabled & auto-enter is active.
 * When screen share is ON -> PiP is disabled so user can present other apps cleanly.
 */
/** Hides meeting header/footer on the native layer only (no React re-render). */
export function suppressMeetingChrome(): void {
  if (Platform.OS === 'android' && PictureInPictureModule?.suppressMeetingChrome) {
    try {
      PictureInPictureModule.suppressMeetingChrome();
    } catch (err) {
      console.warn('[PiP] suppressMeetingChrome error:', err);
    }
  }
}

export function setPipConfig(inMeeting: boolean, isScreenSharing: boolean): void {
  if (Platform.OS === 'android' && PictureInPictureModule?.setPipConfig) {
    try {
      PictureInPictureModule.setPipConfig(inMeeting, isScreenSharing);
    } catch (err) {
      console.warn('[PiP] setPipConfig error:', err);
    }
  }
}

/**
 * Disables PiP immediately before requesting Android MediaProjection permissions.
 * Prevents OS from auto-entering PiP mode when the system recording prompt appears.
 */
export function prepareScreenShare(starting: boolean): void {
  if (Platform.OS === 'android') {
    try {
      if (PictureInPictureModule?.prepareScreenShare) {
        PictureInPictureModule.prepareScreenShare(starting);
      } else if (PictureInPictureModule?.setPipConfig) {
        PictureInPictureModule.setPipConfig(true, starting);
      }
    } catch (err) {
      console.warn('[PiP] prepareScreenShare error:', err);
    }
  }
}

/**
 * Subscribes to Picture-in-Picture state change events.
 * Returns an unsubscribe callback.
 */
export function addPipListener(callback: (isInPip: boolean) => void): () => void {
  if (Platform.OS !== 'android' || !PictureInPictureModule) {
    return () => {};
  }

  try {
    const emitter = new NativeEventEmitter(PictureInPictureModule);
    const subscription = emitter.addListener(
      'onPipModeChanged',
      (data: { isInPictureInPictureMode: boolean }) => {
        callback(Boolean(data?.isInPictureInPictureMode));
      }
    );
    return () => {
      subscription.remove();
    };
  } catch (err) {
    console.warn('[PiP] addPipListener error:', err);
    return () => {};
  }
}
