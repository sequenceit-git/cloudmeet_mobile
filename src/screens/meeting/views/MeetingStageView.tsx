import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { Participant, TrackPublication } from 'livekit-client';
import { styles } from '../meetingRoomStyles';
import { ScreenShareStage } from '../ScreenShareStage';
import { ParticipantCard } from '../ParticipantCard';

export interface GridLayoutInfo {
  isScrollable: boolean;
  gap: number;
  density: 'spacious' | 'normal' | 'compact' | 'ultra-compact';
  cardWidth: number;
  cardHeight: number;
  cols?: number;
  rows?: number;
}

export interface MeetingStageViewProps {
  isFullScreen: boolean;
  isNativePip: boolean;
  insets: EdgeInsets;
  activeScreenShare?: any;
  isGridMode: boolean;
  showControls: boolean;
  isScreenSharing: boolean;
  localParticipant?: Participant | null;
  activeMeetingParticipants: Participant[];
  cameraFacing?: 'user' | 'environment';
  pinnedParticipantIdentity: string | null;
  gridLayout: GridLayoutInfo;
  onToggleLayout: () => void;
  onAudioPress: () => void;
  renderCurrentAudioIcon: () => React.ReactNode;
  onScreenTap: () => void;
  onToggleScreenShare: () => void;
  onSwitchCamera: () => void;
  onParticipantPress: (identity: string) => void;
}

export const MeetingStageView: React.FC<MeetingStageViewProps> = ({
  isFullScreen,
  isNativePip,
  insets,
  activeScreenShare,
  isGridMode,
  showControls,
  isScreenSharing,
  localParticipant,
  activeMeetingParticipants,
  cameraFacing,
  pinnedParticipantIdentity,
  gridLayout,
  onToggleLayout,
  onAudioPress,
  renderCurrentAudioIcon,
  onScreenTap,
  onToggleScreenShare,
  onSwitchCamera,
  onParticipantPress,
}) => {
  return (
    <View
      style={[
        styles.gridContainer,
        (isFullScreen || isNativePip)
          ? styles.fullScreenGridContainer
          : [
              styles.multiGridContainer,
              { paddingTop: insets.top + 68, paddingBottom: insets.bottom + 92 },
            ],
        isNativePip && styles.pipVideoOnly,
      ]}
    >
      {activeScreenShare && !isGridMode ? (
        <View style={[styles.presentationContainer, { paddingTop: insets.top }]}>
          <View style={styles.screenShareStageContainer}>
            <ScreenShareStage
              track={activeScreenShare as any}
              insets={insets}
              showControls={isNativePip ? false : showControls}
              compactPip={isNativePip}
              isGridMode={isGridMode}
              onToggleLayout={onToggleLayout}
              onAudioPress={onAudioPress}
              renderAudioIcon={renderCurrentAudioIcon}
              onPress={onScreenTap}
              onStopScreenShare={onToggleScreenShare}
              isSelf={Boolean(
                isScreenSharing ||
                activeScreenShare.participant?.isLocal ||
                (localParticipant && activeScreenShare.participant?.identity === localParticipant.identity)
              )}
            />
          </View>
        </View>
      ) : !isGridMode && activeMeetingParticipants.length === 1 ? (
        <ParticipantCard
          key={`solo-${activeMeetingParticipants[0]?.identity || 'local'}`}
          participant={activeMeetingParticipants[0] || (localParticipant as any)}
          isLocal={true}
          cameraFacing={cameraFacing}
          isSingleOrFullScreen={true}
          showControls={isNativePip ? false : showControls}
          compactPip={isNativePip}
          isGridMode={false}
          onToggleLayout={onToggleLayout}
          onAudioPress={onAudioPress}
          renderAudioIcon={renderCurrentAudioIcon}
          insets={insets}
          onSwitchCamera={onSwitchCamera}
          onPress={onScreenTap}
          style={styles.fullScreenCard}
        />
      ) : !isGridMode && pinnedParticipantIdentity && activeMeetingParticipants.find((p) => p.identity === pinnedParticipantIdentity) ? (
        <ParticipantCard
          key={`pinned-${pinnedParticipantIdentity}`}
          participant={activeMeetingParticipants.find((p) => p.identity === pinnedParticipantIdentity)!}
          isLocal={Boolean(localParticipant && pinnedParticipantIdentity === localParticipant.identity)}
          cameraFacing={cameraFacing}
          isSingleOrFullScreen={true}
          showControls={isNativePip ? false : showControls}
          compactPip={isNativePip}
          isGridMode={false}
          onToggleLayout={onToggleLayout}
          onAudioPress={onAudioPress}
          renderAudioIcon={renderCurrentAudioIcon}
          insets={insets}
          onSwitchCamera={onSwitchCamera}
          onPress={onScreenTap}
          style={styles.fullScreenCard}
        />
      ) : (
        <ScrollView
          style={styles.gridScrollView}
          contentContainerStyle={[
            styles.gridContentContainer,
            !gridLayout.isScrollable && styles.gridContentCenter,
          ]}
          showsVerticalScrollIndicator={gridLayout.isScrollable}
          bounces={gridLayout.isScrollable}
          overScrollMode="always"
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.grid, { gap: gridLayout.gap }]}
            onPress={onScreenTap}
          >
            {activeMeetingParticipants.map((p) => (
              <ParticipantCard
                key={`participant-${p.identity}`}
                participant={p}
                isLocal={Boolean(localParticipant && p.identity === localParticipant.identity)}
                cameraFacing={cameraFacing}
                isSingleOrFullScreen={false}
                showControls={isNativePip ? false : showControls}
                compactPip={isNativePip}
                isGridMode={true}
                density={gridLayout.density}
                onToggleLayout={onToggleLayout}
                insets={insets}
                onSwitchCamera={onSwitchCamera}
                onPress={() => onParticipantPress(p.identity)}
                style={{
                  width: gridLayout.cardWidth,
                  height: gridLayout.cardHeight,
                  borderRadius:
                    gridLayout.density === 'ultra-compact'
                      ? 12
                      : gridLayout.density === 'compact'
                      ? 14
                      : 16,
                }}
              />
            ))}
          </TouchableOpacity>
        </ScrollView>
      )}
      {activeMeetingParticipants.length === 0 && !activeScreenShare && (
        <View style={styles.waitingContainer}>
          <ActivityIndicator color="#00A8FF" />
          <Text style={styles.waitingText}>Joining Meeting Room...</Text>
        </View>
      )}
    </View>
  );
};

export default MeetingStageView;
