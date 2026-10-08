import React, { useRef, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  PanResponder,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useTracks,
  useParticipants,
  useLocalParticipant,
  VideoTrack,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import { Maximize2, X, Mic, MicOff } from 'lucide-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PIP_WIDTH = 132;
const PIP_HEIGHT = 198;

interface FloatingPiPViewProps {
  roomName: string;
  meetingTitle?: string;
  onMaximize: () => void;
  onLeave: () => void;
}

import { getInitials, getAvatarTextStyle } from '../../utils/helpers';

export const FloatingPiPView: React.FC<FloatingPiPViewProps> = ({
  roomName,
  meetingTitle,
  onMaximize,
  onLeave,
}) => {
  const insets = useSafeAreaInsets();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  // Determine active track to display:
  // 1. Remote screen share
  // 2. Remote participant camera
  // 3. Local camera (if enabled)
  const activeTrack = useMemo(() => {
    // 1. Remote screen share only (never render local screen share to prevent infinite video recursion)
    const screenShare = tracks.find(
      t => t.source === Track.Source.ScreenShare && !t.participant?.isLocal && !t.publication?.isMuted
    );
    if (screenShare) return screenShare;

    const remoteCamera = tracks.find(
      t => t.source === Track.Source.Camera && !t.participant.isLocal && !t.publication?.isMuted
    );
    if (remoteCamera) return remoteCamera;

    if (localParticipant?.isCameraEnabled) {
      const localCamera = tracks.find(
        t => t.source === Track.Source.Camera && t.participant.isLocal && !t.publication?.isMuted
      );
      if (localCamera) return localCamera;
    }

    return null;
  }, [tracks, localParticipant?.isCameraEnabled]);

  const activeParticipant = activeTrack?.participant || participants[0] || localParticipant;
  const participantName = activeParticipant?.name || activeParticipant?.identity || meetingTitle || roomName;

  const [isMicMuted, setIsMicMuted] = useState(
    activeParticipant ? !activeParticipant.isMicrophoneEnabled : true
  );

  useEffect(() => {
    if (!activeParticipant) return;
    const updateAudioState = () => {
      setIsMicMuted(!activeParticipant.isMicrophoneEnabled);
    };
    updateAudioState();
    activeParticipant.on('trackPublished', updateAudioState);
    activeParticipant.on('trackUnpublished', updateAudioState);
    activeParticipant.on('trackMuted', updateAudioState);
    activeParticipant.on('trackUnmuted', updateAudioState);

    return () => {
      activeParticipant.off('trackPublished', updateAudioState);
      activeParticipant.off('trackUnpublished', updateAudioState);
      activeParticipant.off('trackMuted', updateAudioState);
      activeParticipant.off('trackUnmuted', updateAudioState);
    };
  }, [activeParticipant]);

  // Initial position: top-right corner, below safe area
  const initialX = SCREEN_WIDTH - PIP_WIDTH - 16;
  const initialY = insets.top + 20;

  const pan = useRef(new Animated.ValueXY({ x: initialX, y: initialY })).current;
  const currentPos = useRef({ x: initialX, y: initialY });

  useEffect(() => {
    const id = pan.addListener((value) => {
      currentPos.current = value;
    });
    return () => {
      pan.removeListener(id);
    };
  }, [pan]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          x: currentPos.current.x,
          y: currentPos.current.y,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gestureState) => {
        pan.flattenOffset();

        const curX = currentPos.current.x;
        const curY = currentPos.current.y;

        const minX = 16;
        const maxX = SCREEN_WIDTH - PIP_WIDTH - 16;
        const minY = insets.top + 10;
        const maxY = SCREEN_HEIGHT - insets.bottom - PIP_HEIGHT - 20;

        // Snap horizontally to nearest side
        const targetX = curX + PIP_WIDTH / 2 < SCREEN_WIDTH / 2 ? minX : maxX;
        const targetY = Math.max(minY, Math.min(maxY, curY));

        Animated.spring(pan, {
          toValue: { x: targetX, y: targetY },
          useNativeDriver: false,
          friction: 6,
        }).start();
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.pipContainer,
        {
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable style={styles.pipPressable} onPress={onMaximize}>
        {/* Video Track or Avatar */}
        {activeTrack ? (
          <VideoTrack
            trackRef={activeTrack}
            style={styles.pipVideo}
            objectFit="cover"
            mirror={Boolean(activeTrack.participant.isLocal)}
            zOrder={1}
          />
        ) : (
          <View style={styles.pipAvatarContainer}>
            <View style={styles.pipAvatarCircle}>
              <Text style={[styles.pipAvatarText, getAvatarTextStyle(participantName, 18)]}>
                {getInitials(participantName)}
              </Text>
            </View>
          </View>
        )}

        {/* Top Floating Controls */}
        <View style={styles.pipTopBar}>
          <TouchableOpacity
            style={styles.pipCloseBtn}
            onPress={onLeave}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={11} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.pipExpandBadge}>
            <Maximize2 size={11} color="#00A8FF" />
          </View>
        </View>

        {/* Bottom Floating Info Pill */}
        <View style={styles.pipBottomBar}>
          <View style={styles.pipInfoPill}>
            {isMicMuted ? (
              <MicOff size={10} color="#ef4444" style={styles.pipMicIcon} />
            ) : (
              <Mic size={10} color="#10b981" style={styles.pipMicIcon} />
            )}
            <Text style={styles.pipNameText} numberOfLines={1} ellipsizeMode="tail">
              {participantName}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  pipContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: PIP_WIDTH,
    height: PIP_HEIGHT,
    borderRadius: 18,
    backgroundColor: '#0B1728',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 168, 255, 0.45)',
    overflow: 'hidden',
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    zIndex: 99999,
  },
  pipPressable: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  pipVideo: {
    width: '100%',
    height: '100%',
  },
  pipAvatarContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B1728',
  },
  pipAvatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 168, 255, 0.15)',
    borderWidth: 1.5,
    borderColor: '#00A8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipAvatarText: {
    color: '#00A8FF',
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  pipTopBar: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  pipCloseBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipExpandBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(5, 11, 20, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipBottomBar: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    right: 6,
    zIndex: 2,
  },
  pipInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 11, 20, 0.8)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pipMicIcon: {
    marginRight: 4,
  },
  pipNameText: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 10,
    fontFamily: 'PlusJakartaSans-Medium',
  },
});
export default FloatingPiPView;
