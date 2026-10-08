import React from 'react';
import { Animated, View, Text, TouchableOpacity } from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../../hooks/useTranslation';
import { ChevronLeft, ChevronDown, LogOut } from 'lucide-react-native';
import { styles } from '../meetingRoomStyles';
import { formatTime } from '../meetingRoomUtils';

export interface MeetingHeaderBarProps {
  insets: EdgeInsets;
  showControls: boolean;
  controlsOpacity: Animated.Value;
  headerTranslateY: Animated.Value;
  isGridMode: boolean;
  displayTitle?: string;
  callDuration: number;
  renderCurrentAudioIcon: () => React.ReactNode;
  onOpenAudioModal: () => void;
  onMinimize?: () => void;
  onOpenInfoModal: () => void;
  onLeave: () => void;
}

export const MeetingHeaderBar: React.FC<MeetingHeaderBarProps> = ({
  insets,
  showControls,
  controlsOpacity,
  headerTranslateY,
  isGridMode,
  displayTitle,
  callDuration,
  renderCurrentAudioIcon,
  onOpenAudioModal,
  onMinimize,
  onOpenInfoModal,
  onLeave,
}) => {
  const { t } = useTranslation();

  return (
    <Animated.View
      nativeID="meeting-chrome"
      pointerEvents={!showControls ? 'none' : 'auto'}
      style={[
        styles.header,
        {
          paddingTop: insets.top + 8,
          opacity: controlsOpacity,
          transform: [{ translateY: headerTranslateY }],
        },
      ]}
    >
      <View style={styles.headerLeft}>
        {isGridMode && (
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={onOpenAudioModal}
            activeOpacity={0.7}
          >
            {renderCurrentAudioIcon()}
          </TouchableOpacity>
        )}

        {/* Back arrow to minimize meeting inside app to App Home Screen */}
        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => {
            if (onMinimize) {
              onMinimize();
            }
          }}
          activeOpacity={0.7}
        >
          <ChevronLeft color="#FFF" size={20} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.headerCenter}
        onPress={onOpenInfoModal}
        activeOpacity={0.7}
      >
        <View style={styles.titleRow}>
          <Text style={styles.meetingTitle}>{displayTitle || 'Meeting'}</Text>
          <ChevronDown color="#94a3b8" size={14} />
        </View>
        <Text style={styles.timerText}>{formatTime(callDuration)}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.leaveBtn}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={onLeave}
      >
        <LogOut color="#ef4444" size={16} />
        <Text style={styles.leaveText}>{t('meeting.leave')}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default MeetingHeaderBar;
