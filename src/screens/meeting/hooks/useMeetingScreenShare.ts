import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Alert, Platform, NativeModules, findNodeHandle } from 'react-native';
import {
  Track,
  TrackPublishOptions,
  ScreenShareCaptureOptions,
  LocalTrackPublication,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  RoomEvent,
  ParticipantEvent,
  ConnectionState,
  Participant,
} from 'livekit-client';
import { useTracks } from '@livekit/react-native';
import { setPipConfig, prepareScreenShare } from '../../../utils/pip';
import { acquireScreenShareWakeLock, releaseScreenShareWakeLock } from '../../../utils/wakeLock';

export interface UseMeetingScreenShareProps {
  room: any;
  localParticipant: any;
  remoteParticipants: Participant[];
  allParticipants: Participant[];
  isMicMuted: boolean;
  isMicMutedRef: React.MutableRefObject<boolean>;
  isMinimized: boolean;
  t: (key: string) => string;
}

export const useMeetingScreenShare = ({
  room,
  localParticipant,
  remoteParticipants,
  allParticipants,
  isMicMuted,
  isMicMutedRef,
  isMinimized,
  t,
}: UseMeetingScreenShareProps) => {
  type ScreenShareLifecycleState = 'idle' | 'publishing' | 'unpublishing';
  const screenShareLifecycleRef = useRef<ScreenShareLifecycleState>('idle');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isShareButtonBusy, setIsShareButtonBusy] = useState(false);
  const isTogglingScreenShareRef = useRef(false);
  const isScreenShareToggling = isShareButtonBusy;
  const isStartingScreenShareRef = useRef(false);
  const isScreenShareActionInFlight = useRef(false);
  const pendingScreenShareActionRef = useRef<'start' | 'stop' | null>(null);
  const executeToggleScreenShareRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const screenCapturePickerRef = useRef<any>(null);

  const screenShareTracks = useTracks([Track.Source.ScreenShare], {
    onlySubscribed: false,
    updateOnlyOn: [RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed],
  });
  const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });

  const hadRemoteParticipantsRef = useRef(false);
  useEffect(() => {
    if (remoteParticipants.length > 0) {
      hadRemoteParticipantsRef.current = true;
    }
  }, [remoteParticipants.length]);

  const activeRemoteScreenShare = useMemo(() => {
    return screenShareTracks.find(
      t => !t.participant?.isLocal && (localParticipant ? t.participant?.identity !== localParticipant.identity : true) && Boolean(t.publication)
    );
  }, [screenShareTracks, localParticipant]);

  const isRemotePresentationActive = Boolean(activeRemoteScreenShare);
  const isLocalScreenSharing = Boolean(isScreenSharing || localParticipant?.isScreenShareEnabled);

  const activeScreenShare = useMemo(() => {
    if (activeRemoteScreenShare) return activeRemoteScreenShare;

    if (isLocalScreenSharing) {
      const localShare = screenShareTracks.find(
        t => (t.participant?.isLocal || (localParticipant && t.participant?.identity === localParticipant.identity))
      );
      if (localShare) return localShare;

      if (localParticipant) {
        return {
          participant: localParticipant,
          source: Track.Source.ScreenShare,
          publication: localParticipant.getTrackPublication(Track.Source.ScreenShare),
        };
      }
    }

    return screenShareTracks.find(t => Boolean(t.publication));
  }, [screenShareTracks, localParticipant, isLocalScreenSharing, activeRemoteScreenShare]);

  const isScreenShareActive = useMemo(() => {
    return Boolean(isLocalScreenSharing || isRemotePresentationActive || isStartingScreenShareRef.current);
  }, [isLocalScreenSharing, isRemotePresentationActive]);

  useEffect(() => {
    setPipConfig(true, isLocalScreenSharing);
  }, [isLocalScreenSharing]);

  useEffect(() => {
    return () => {
      setPipConfig(false, false);
    };
  }, []);

  const subscribedTrackSidsRef = useRef<Set<string>>(new Set());
  const subscribingInFlightTrackSidsRef = useRef<Set<string>>(new Set());
  const subscriptionRetryCountRef = useRef<Map<string, number>>(new Map());
  const MAX_SUBSCRIPTION_RETRIES = 2;

  // Auto-subscribe to remote screen share tracks
  useEffect(() => {
    screenShareTracks.forEach(t => {
      if (!t.participant?.isLocal && t.publication) {
        const remotePub = t.publication as any;
        const trackSid = remotePub.trackSid || t.publication.trackSid;

        if (room?.state !== ConnectionState.Connected) {
          return;
        }

        if (
          typeof remotePub.setSubscribed === 'function' &&
          !remotePub.isSubscribed &&
          !remotePub.track &&
          trackSid &&
          !subscribedTrackSidsRef.current.has(trackSid) &&
          !subscribingInFlightTrackSidsRef.current.has(trackSid)
        ) {
          subscribedTrackSidsRef.current.add(trackSid);
          subscribingInFlightTrackSidsRef.current.add(trackSid);
          remotePub.setSubscribed(true);
        }
        if (typeof remotePub.setEnabled === 'function' && !remotePub.isEnabled) {
          remotePub.setEnabled(true);
        }
      }
    });
  }, [screenShareTracks, room?.state]);

  // Synchronize local screen sharing track state with system/UI
  useEffect(() => {
    if (!localParticipant) return;
    setIsScreenSharing(Boolean(localParticipant.isScreenShareEnabled));

    const syncScreenShare = (pub?: any) => {
      if (!localParticipant) return;
      if (pub && pub.source && pub.source !== Track.Source.ScreenShare) {
        return;
      }
      const enabled = Boolean(localParticipant.isScreenShareEnabled);
      setIsScreenSharing(enabled);

      if (screenShareLifecycleRef.current !== 'idle') {
        return;
      }

      if (!enabled) {
        prepareScreenShare(false);
        setPipConfig(true, false);
        releaseScreenShareWakeLock();
      }
    };

    localParticipant.on(ParticipantEvent.LocalTrackPublished, syncScreenShare);
    localParticipant.on(ParticipantEvent.LocalTrackUnpublished, syncScreenShare);

    return () => {
      localParticipant.off(ParticipantEvent.LocalTrackPublished, syncScreenShare);
      localParticipant.off(ParticipantEvent.LocalTrackUnpublished, syncScreenShare);
    };
  }, [localParticipant, isMinimized]);

  // Diagnostics & signaling event listeners
  useEffect(() => {
    if (!room) return;

    const handleSubscriptionFailed = (trackSid: string, participant: RemoteParticipant) => {
      subscribingInFlightTrackSidsRef.current.delete(trackSid);
      const currentRetries = subscriptionRetryCountRef.current.get(trackSid) || 0;

      if (room.state === ConnectionState.Connected && currentRetries < MAX_SUBSCRIPTION_RETRIES) {
        subscriptionRetryCountRef.current.set(trackSid, currentRetries + 1);
        subscribedTrackSidsRef.current.delete(trackSid);
        const pub = participant?.getTrackPublicationBySid(trackSid);
        if (pub && typeof (pub as any).setSubscribed === 'function' && !pub.isSubscribed) {
          subscribingInFlightTrackSidsRef.current.add(trackSid);
          (pub as any).setSubscribed(true);
        }
      }
    };

    const handleTrackSubscribed = (track: RemoteTrack, publication: RemoteTrackPublication) => {
      if (publication?.source === Track.Source.ScreenShare) {
        subscribingInFlightTrackSidsRef.current.delete(publication.trackSid);
        subscribedTrackSidsRef.current.add(publication.trackSid);
        subscriptionRetryCountRef.current.delete(publication.trackSid);
      }
    };

    const handleTrackUnsubscribed = (track: RemoteTrack, publication: RemoteTrackPublication) => {
      if (publication?.source === Track.Source.ScreenShare) {
        subscribedTrackSidsRef.current.delete(publication.trackSid);
        subscribingInFlightTrackSidsRef.current.delete(publication.trackSid);
        subscriptionRetryCountRef.current.delete(publication.trackSid);
      }
    };

    const handleTrackUnpublished = (publication: RemoteTrackPublication) => {
      if (publication?.source === Track.Source.ScreenShare) {
        subscribedTrackSidsRef.current.delete(publication.trackSid);
        subscribingInFlightTrackSidsRef.current.delete(publication.trackSid);
        subscriptionRetryCountRef.current.delete(publication.trackSid);
      }
    };

    const resumeDeferredActionIfNeeded = () => {
      if (pendingScreenShareActionRef.current) {
        pendingScreenShareActionRef.current = null;
        executeToggleScreenShareRef.current().catch(() => {});
      }
    };

    const handleReconnected = () => {
      subscribingInFlightTrackSidsRef.current.clear();
      subscriptionRetryCountRef.current.clear();

      room.remoteParticipants.forEach((rp: any) => {
        rp.trackPublications.forEach((pub: any) => {
          if (pub.source === Track.Source.ScreenShare && !pub.isSubscribed) {
            subscribedTrackSidsRef.current.delete(pub.trackSid);
          }
        });
      });

      resumeDeferredActionIfNeeded();
    };

    const handleConnectionStateChanged = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) {
        subscribingInFlightTrackSidsRef.current.clear();
        resumeDeferredActionIfNeeded();
      }
    };

    room.on(RoomEvent.TrackSubscriptionFailed, handleSubscriptionFailed);
    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    room.on(RoomEvent.TrackUnpublished, handleTrackUnpublished);
    room.on(RoomEvent.Reconnected, handleReconnected);
    room.on(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);

    return () => {
      room.off(RoomEvent.TrackSubscriptionFailed, handleSubscriptionFailed);
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      room.off(RoomEvent.TrackUnpublished, handleTrackUnpublished);
      room.off(RoomEvent.Reconnected, handleReconnected);
      room.off(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
    };
  }, [room]);

  const teardownExistingScreenShare = async (source: string = 'teardown'): Promise<void> => {
    if (!localParticipant) return;

    const screenPub = localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const lingeringPubs = Array.from(localParticipant.trackPublications.values()).filter(
      (p: any) => p.source === Track.Source.ScreenShare
    );

    const targetPubs: LocalTrackPublication[] = [];
    if (screenPub) {
      targetPubs.push(screenPub);
    }
    for (const p of lingeringPubs as LocalTrackPublication[]) {
      if (!targetPubs.some(tp => tp.trackSid === p.trackSid)) {
        targetPubs.push(p);
      }
    }

    if (targetPubs.length === 0 && !localParticipant.isScreenShareEnabled) {
      return;
    }

    for (const pub of targetPubs) {
      const track = pub.track;
      if (track) {
        try {
          await localParticipant.unpublishTrack(track, true);
        } catch {}
        try {
          track.stop();
        } catch {}
      }
    }

    try {
      await localParticipant.setScreenShareEnabled(false);
    } catch {}
  };

  const handleToggleScreenShare = async () => {
    if (
      isScreenShareActionInFlight.current ||
      screenShareLifecycleRef.current !== 'idle' ||
      !room ||
      !localParticipant
    ) {
      return;
    }

    if (room.state !== ConnectionState.Connected) {
      const currentlyEnabled = Boolean(localParticipant.isScreenShareEnabled);
      pendingScreenShareActionRef.current = currentlyEnabled ? 'stop' : 'start';

      Alert.alert(
        t('meeting.reconnecting') || 'Reconnecting...',
        t('meeting.reconnectingScreenShareNotice') ||
          'Connection is currently recovering. Screen share action has been queued and will resume once reconnected.'
      );
      return;
    }

    const currentlyEnabled = Boolean(localParticipant.isScreenShareEnabled);
    if (allParticipants.length <= 1 && !currentlyEnabled) {
      Alert.alert(
        t('meeting.screenShareUnavailableTitle'),
        t('meeting.screenShareUnavailableDesc')
      );
      return;
    }

    isScreenShareActionInFlight.current = true;
    isTogglingScreenShareRef.current = true;
    setIsShareButtonBusy(true);

    const targetState = !currentlyEnabled;
    try {
      if (targetState) {
        screenShareLifecycleRef.current = 'publishing';
        await teardownExistingScreenShare('pre-publish-teardown');

        isStartingScreenShareRef.current = true;
        prepareScreenShare(true);

        const micShouldBeActive = !isMicMuted;

        if (
          Platform.OS === 'ios' &&
          screenCapturePickerRef.current &&
          NativeModules.ScreenCapturePickerViewManager?.show
        ) {
          try {
            const reactTag = findNodeHandle(screenCapturePickerRef.current);
            if (reactTag) {
              NativeModules.ScreenCapturePickerViewManager.show(reactTag);
            }
          } catch (pickerErr) {
            console.warn('[ScreenShare] Launching iOS ScreenCapturePicker failed:', pickerErr);
          }
        }

        try {
          const publishOptions: TrackPublishOptions = {
            videoCodec: 'h264',
            simulcast: false,
            screenShareEncoding: {
              maxBitrate: 4_500_000,
              maxFramerate: 20,
            },
            degradationPreference: 'maintain-resolution',
          };
          const captureOptions: ScreenShareCaptureOptions = {
            audio: false,
            resolution: {
              width: 1920,
              height: 1080,
              frameRate: 20,
            },
          };
          await room.localParticipant.setScreenShareEnabled(
            true,
            captureOptions,
            publishOptions
          );
        } catch (shareErr: any) {
          const errMsg = (shareErr?.message || shareErr?.name || String(shareErr) || '').toLowerCase();

          const isCancelled =
            errMsg.includes('cancel') ||
            errMsg.includes('reject') ||
            errMsg.includes('abort') ||
            errMsg.includes('notallowed') ||
            errMsg.includes('result_canceled') ||
            errMsg.includes('broadcast') ||
            errMsg.includes('user cancelled') ||
            errMsg.includes('user denied');

          const isSignalingRecoveryError =
            errMsg.includes('cannot send signal') ||
            errMsg.includes('before connected') ||
            errMsg.includes('negotiation timed out') ||
            (room && room.state !== ConnectionState.Connected);

          if (isSignalingRecoveryError) {
            pendingScreenShareActionRef.current = 'start';
          }

          isStartingScreenShareRef.current = false;
          prepareScreenShare(false);
          setPipConfig(true, false);
          setIsScreenSharing(false);
          releaseScreenShareWakeLock();

          await teardownExistingScreenShare('publish-error-cleanup').catch(() => {});

          if (!isCancelled && !isSignalingRecoveryError) {
            const platformName = Platform.OS === 'ios' ? 'iOS / iPhone' : 'Android';
            Alert.alert(
              'Screen Share Notice',
              `Could not share screen. Please allow screen recording/casting when prompted by ${platformName}.`
            );
          }
          return;
        }

        isStartingScreenShareRef.current = false;
        setIsScreenSharing(true);
        setPipConfig(true, true);

        await new Promise(resolve => setTimeout(resolve, 450));

        if (micShouldBeActive && !isMicMutedRef.current && !localParticipant.isMicrophoneEnabled) {
          try {
            await localParticipant.setMicrophoneEnabled(true);
          } catch (micErr) {
            console.warn('[ScreenShare] Re-enabling microphone failed:', micErr);
          }
        }
      } else {
        screenShareLifecycleRef.current = 'unpublishing';
        isStartingScreenShareRef.current = false;
        prepareScreenShare(false);
        try {
          await teardownExistingScreenShare('user-stop');
        } finally {
          setIsScreenSharing(false);
          setPipConfig(true, false);
          releaseScreenShareWakeLock();
        }

        await new Promise(resolve => setTimeout(resolve, 200));

        if (!isMicMutedRef.current && !localParticipant.isMicrophoneEnabled) {
          try {
            await localParticipant.setMicrophoneEnabled(true);
          } catch (micErr) {
            console.warn('[ScreenShare] Re-enabling microphone after stop failed:', micErr);
          }
        }
      }
    } catch (error: any) {
      isStartingScreenShareRef.current = false;
      prepareScreenShare(false);
      setPipConfig(true, false);
      setIsScreenSharing(false);
      releaseScreenShareWakeLock();

      const msg = (error?.message || error?.name || String(error) || '').toLowerCase();
      if (
        msg.includes('cancel') ||
        msg.includes('reject') ||
        msg.includes('abort') ||
        msg.includes('notallowed') ||
        msg.includes('result_canceled') ||
        msg.includes('broadcast was cancelled') ||
        msg.includes('user cancelled')
      ) {
        return;
      }
      const platformName = Platform.OS === 'ios' ? 'iOS / iPhone' : 'Android';
      Alert.alert(
        'Screen Share Notice',
        `Could not share screen. Please allow screen recording/casting when prompted by ${platformName}.`
      );
    } finally {
      screenShareLifecycleRef.current = 'idle';
      isStartingScreenShareRef.current = false;
      isScreenShareActionInFlight.current = false;
      isTogglingScreenShareRef.current = false;
      setIsShareButtonBusy(false);
    }
  };

  executeToggleScreenShareRef.current = handleToggleScreenShare;

  useEffect(() => {
    if (
      isScreenSharing &&
      screenShareLifecycleRef.current === 'idle' &&
      !isScreenShareActionInFlight.current &&
      !isStartingScreenShareRef.current &&
      hadRemoteParticipantsRef.current &&
      remoteParticipants.length === 0 &&
      localParticipant
    ) {
      screenShareLifecycleRef.current = 'unpublishing';
      isScreenShareActionInFlight.current = true;
      setIsShareButtonBusy(true);
      prepareScreenShare(false);
      setPipConfig(true, false);

      teardownExistingScreenShare('auto-stop')
        .catch(() => {})
        .finally(() => {
          screenShareLifecycleRef.current = 'idle';
          isScreenShareActionInFlight.current = false;
          setIsShareButtonBusy(false);
          setIsScreenSharing(false);
          releaseScreenShareWakeLock();

          if (!isMicMutedRef.current && localParticipant) {
            localParticipant.setMicrophoneEnabled(true).catch(() => {});
          }
        });

      Alert.alert(
        t('meeting.screenShareStoppedTitle'),
        t('meeting.screenShareStoppedDesc')
      );
    }
  }, [remoteParticipants.length, isScreenSharing, localParticipant, t]);

  useEffect(() => {
    if (isScreenSharing) {
      acquireScreenShareWakeLock();
    } else {
      releaseScreenShareWakeLock();
    }
    return () => {
      releaseScreenShareWakeLock();
    };
  }, [isScreenSharing]);

  return {
    isScreenSharing,
    isScreenShareToggling,
    isScreenShareActionInFlight,
    screenShareLifecycleRef,
    screenCapturePickerRef,
    screenShareTracks,
    cameraTracks,
    activeRemoteScreenShare,
    activeScreenShare,
    isScreenShareActive,
    handleToggleScreenShare,
    teardownExistingScreenShare,
  };
};

export default useMeetingScreenShare;
