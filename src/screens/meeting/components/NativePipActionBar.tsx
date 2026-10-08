import React from 'react';
import { Animated, TouchableOpacity } from 'react-native';
import { Mic, MicOff, Video as LucideVideo, VideoOff, PhoneOff } from 'lucide-react-native';
import { styles } from '../meetingRoomStyles';

export interface NativePipActionBarProps {
  showPipActions: boolean;
  pipActionsOpacity: Animated.Value;
  isMicMuted: boolean;
  isCameraOff: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onLeaveMeeting: () => void;
}

export const NativePipActionBar: React.FC<NativePipActionBarProps> = ({
  showPipActions,
  pipActionsOpacity,
  isMicMuted,
  isCameraOff,
  onToggleMic,
  onToggleCamera,
  onLeaveMeeting,
}) => {
  return (
    <Animated.View
      pointerEvents={showPipActions ? 'box-none' : 'none'}
      style={[
        styles.pipActionBar,
        { opacity: pipActionsOpacity },
        !showPipActions && styles.pipChromeHidden,
      ]}
    >
      <TouchableOpacity
        style={[styles.pipActionBtn, isMicMuted && styles.pipActionBtnMuted]}
        onPress={onToggleMic}
        activeOpacity={0.8}
        accessibilityLabel={isMicMuted ? 'Unmute' : 'Mute'}
      >
        {isMicMuted ? <MicOff color="#FFF" size={18} /> : <Mic color="#FFF" size={18} />}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.pipActionBtn, isCameraOff && styles.pipActionBtnMuted]}
        onPress={onToggleCamera}
        activeOpacity={0.8}
        accessibilityLabel={isCameraOff ? 'Start camera' : 'Stop camera'}
      >
        {isCameraOff ? <VideoOff color="#FFF" size={18} /> : <LucideVideo color="#FFF" size={18} />}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.pipActionBtn, styles.pipActionBtnEnd]}
        onPress={onLeaveMeeting}
        activeOpacity={0.8}
        accessibilityLabel="End call"
      >
        <PhoneOff color="#FFF" size={18} />
      </TouchableOpacity>
    </Animated.View>
  );
};

export default NativePipActionBar;
