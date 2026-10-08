import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalParticipant, useRoomContext, VideoTrack } from '@livekit/react-native';
import {
  LocalVideoTrack,
  ParticipantEvent,
  RemoteTrack,
  RoomEvent,
  TrackEvent,
} from 'livekit-client';
import LinearGradient from 'react-native-linear-gradient';
import {
  LayoutGrid,
  Maximize2,
  Monitor,
  MonitorOff,
  MonitorUp,
  Volume2,
} from 'lucide-react-native';
import { useTranslation } from '../../hooks/useTranslation';
import { styles } from './meetingRoomStyles';

export const ScreenShareStage: React.FC<{
  track: any;
  insets?: { top: number; bottom: number; left: number; right: number };
  showControls?: boolean;
  isGridMode?: boolean;
  onToggleLayout?: () => void;
  onAudioPress?: () => void;
  renderAudioIcon?: () => React.ReactNode;
  onPress?: () => void;
  onStopScreenShare?: () => void;
  isSelf?: boolean;
  compactPip?: boolean;
}> = ({
  track,
  insets,
  showControls = true,
  isGridMode = false,
  onToggleLayout,
  onAudioPress,
  renderAudioIcon,
  onPress,
  onStopScreenShare,
  isSelf: isSelfProp,
  compactPip = false,
}) => {
  const { t } = useTranslation();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const isSelf = Boolean(
    isSelfProp ??
    (track?.participant?.isLocal || (localParticipant && track?.participant?.identity === localParticipant?.identity))
  );

  const presenter = track?.participant;
  const presenterName = presenter?.name || presenter?.identity || 'Participant';

  const [subscribedTrack, setSubscribedTrack] = useState<RemoteTrack | LocalVideoTrack | undefined>(
    track?.publication?.track
  );
  const [isSubscribed, setIsSubscribed] = useState<boolean>(
    Boolean(track?.publication?.isSubscribed && track?.publication?.track)
  );

  useEffect(() => {
    const pub = track?.publication;
    const participant = track?.participant;

    const syncTrackState = () => {
      const currentTrack = pub?.track;
      const ready = Boolean(pub?.isSubscribed && currentTrack);
      setSubscribedTrack(currentTrack);
      setIsSubscribed(ready);

      if (__DEV__ && ready) {
        console.log('[ScreenShare-Diag:SCREEN_SHARE_TRACK_AVAILABLE]', {
          identity: participant?.identity,
          trackSid: pub?.trackSid,
          isSubscribed: Boolean(pub?.isSubscribed),
          hasTrack: Boolean(currentTrack),
          mediaStreamTrackReady: Boolean((currentTrack as any)?.mediaStreamTrack),
        });
      }
    };

    syncTrackState();

    if (pub) {
      pub.on(TrackEvent.Subscribed, syncTrackState);
      pub.on(TrackEvent.Unsubscribed, syncTrackState);
      pub.on(TrackEvent.SubscriptionStatusChanged, syncTrackState);
    }

    if (participant) {
      participant.on(ParticipantEvent.TrackSubscribed, syncTrackState);
      participant.on(ParticipantEvent.TrackUnsubscribed, syncTrackState);
    }

    if (room) {
      room.on(RoomEvent.Reconnected, syncTrackState);
      room.on(RoomEvent.Connected, syncTrackState);
    }

    return () => {
      if (pub) {
        pub.off(TrackEvent.Subscribed, syncTrackState);
        pub.off(TrackEvent.Unsubscribed, syncTrackState);
        pub.off(TrackEvent.SubscriptionStatusChanged, syncTrackState);
      }
      if (participant) {
        participant.off(ParticipantEvent.TrackSubscribed, syncTrackState);
        participant.off(ParticipantEvent.TrackUnsubscribed, syncTrackState);
      }
      if (room) {
        room.off(RoomEvent.Reconnected, syncTrackState);
        room.off(RoomEvent.Connected, syncTrackState);
      }
    };
  }, [track?.publication, track?.participant, room]);

  useEffect(() => {
    console.log('[ScreenShare-Diag:SCREEN_SHARE_STAGE_MOUNTED]', {
      identity: presenter?.identity,
      isLocal: presenter?.isLocal,
      isSelf,
      publicationExists: Boolean(track?.publication),
      isSubscribed: Boolean((track?.publication as any)?.isSubscribed),
      hasTrack: Boolean(track?.publication?.track),
      trackSid: track?.publication?.trackSid,
      source: track?.source,
    });
  }, [track?.publication?.trackSid, isSelf, presenter?.identity]);

  const isSubscribedAndReady = Boolean(
    isSubscribed && subscribedTrack
  );



  return (
    <View style={styles.screenShareStageContainer}>
      {isSelf ? (
        /* Dedicated Broadcaster View when local user is sharing screen.
           CRITICAL: Do NOT render VideoTrack here to prevent infinite recursive screen mirroring! */
        <TouchableOpacity
          activeOpacity={1}
          onPress={onPress}
          style={styles.screenSharePresenterCard}
        >
          {/* Subtle Ambient Radial Glow */}
          <View style={styles.screenSharePresenterGlow} pointerEvents="none" />

          {/* Central Pulsing Icon */}
          <View style={styles.screenSharePresenterIconWrapper} pointerEvents="none">
            <View style={styles.screenSharePresenterPulseRing2} />
            <View style={styles.screenSharePresenterPulseRing1} />
            <LinearGradient
              colors={['#00A8FF', '#0066CC']}
              style={styles.screenSharePresenterIconCircle}
            >
              <Monitor color="#FFF" size={44} />
            </LinearGradient>
          </View>

          {/* Live Broadcast Badge */}
          <View style={styles.screenShareLiveBadge} pointerEvents="none">
            <View style={styles.screenShareLiveDot} />
            <Text style={styles.screenShareLiveBadgeText}>
              {t('meeting.sharingYourScreenSub')}
            </Text>
          </View>

          {/* Headline & Description */}
          <Text style={styles.screenSharePresenterTitle}>
            {t('meeting.sharingYourScreenTitle')}
          </Text>
          <Text style={styles.screenSharePresenterDesc}>
            {t('meeting.sharingYourScreenDesc')}
          </Text>

          {/* Prominent Stop Sharing Button */}
          {onStopScreenShare && (
            <TouchableOpacity
              style={styles.screenSharePresenterStopBtn}
              onPress={onStopScreenShare}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#ef4444', '#dc2626']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.screenSharePresenterStopBtnGradient}
              >
                <MonitorOff color="#FFF" size={18} style={{ marginRight: 8 }} />
                <Text style={styles.screenSharePresenterStopBtnText}>
                  {t('meeting.stopSharing')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      ) : (
        /* Remote Screen Share Stage: Displays the video stream shared by other participants */
        <>
          {isSubscribedAndReady ? (
            <View
              style={styles.fullStageVideo}
              onLayout={(e: any) => {
                console.log('[ScreenShare-Diag:SCREEN_SHARE_STAGE_LAYOUT_READY]', {
                  layout: e?.nativeEvent?.layout,
                  trackSid: track?.publication?.trackSid,
                  identity: presenter?.identity,
                });
              }}
            >
              <VideoTrack
                trackRef={track}
                style={styles.fullStageVideo}
                objectFit="contain"
                mirror={false}
                zOrder={compactPip ? 0 : 1}
              />
            </View>
          ) : (
            <View style={styles.screenShareLoadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#00A8FF" style={{ marginBottom: 12 }} />
              <Text style={styles.screenShareLoadingText}>
                {t('meeting.connectingScreenShare') || 'Connecting to screen share...'}
              </Text>
            </View>
          )}
          <TouchableOpacity
            activeOpacity={1}
            onPress={onPress}
            style={[StyleSheet.absoluteFill, { zIndex: 2 }]}
          />
        </>
      )}

      {/* Top Action Controls Row */}
      {showControls && !compactPip && (
      <View
        nativeID="meeting-chrome"
        style={[
          styles.cardTopRow,
          { top: showControls ? 64 : 16 },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.leftBadgeContainer} pointerEvents="box-none">
          {onAudioPress && (
            <TouchableOpacity
              style={styles.actionIconBtn}
              onPress={onAudioPress}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              activeOpacity={0.7}
            >
              {renderAudioIcon ? renderAudioIcon() : <Volume2 color="#00A8FF" size={20} />}
            </TouchableOpacity>
          )}
          {!isSelf && (
            <View style={styles.screenShareBadge}>
              <MonitorUp color="#00A8FF" size={16} style={{ marginRight: 6 }} />
              <Text style={styles.screenShareBadgeText}>
                {`${t('meeting.share')} (${presenterName})`}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.rightBadgeActions} pointerEvents="box-none">
          {onToggleLayout && (
            <TouchableOpacity
              style={styles.actionIconBtn}
              onPress={onToggleLayout}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              {isGridMode ? (
                <Maximize2 color="#FFF" size={20} />
              ) : (
                <LayoutGrid color="#FFF" size={20} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
      )}
    </View>
  );
};
