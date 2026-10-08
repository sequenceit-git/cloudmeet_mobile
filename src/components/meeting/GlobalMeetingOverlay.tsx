import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  Alert,
} from 'react-native';
import { LiveKitRoom } from '@livekit/react-native';
import { DisconnectReason } from 'livekit-client';
import { useMeeting } from '../../context/MeetingContext';
import { initLiveKit, startAudioSession, stopAudioSession } from '../../services/livekit';
import { MeetingRoomContent } from '../../screens/meeting/MeetingRoomScreen';
import { FloatingPiPView } from './FloatingPiPView';
import { endMeeting as endMeetingApi, leaveMeeting as leaveMeetingApi } from '../../services/api';
import storage from '../../services/storage';

// Ensure LiveKit WebRTC globals are ready
initLiveKit();

async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ];

      if (Platform.Version >= 33) {
        // @ts-ignore
        permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }

      await PermissionsAndroid.requestMultiple(permissions);

      const cameraGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      const audioGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);

      return cameraGranted && audioGranted;
    } catch (err) {
      console.warn('[GlobalMeetingOverlay] Error requesting permissions:', err);
      return false;
    }
  }
  return true;
}

export const GlobalMeetingOverlay: React.FC = () => {
  const {
    activeMeeting,
    isMinimized,
    minimizeMeeting,
    maximizeMeeting,
    endMeeting,
    room,
    connectOptions,
  } = useMeeting();

  const [permissionsChecked, setPermissionsChecked] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(true);
  const [hasAudioPermission, setHasAudioPermission] = useState(true);
  const activeMeetingKeyRef = useRef<string | null>(null);
  const isUserLeavingRef = useRef(false);

  // Audio session and permission initialization per unique meeting session
  useEffect(() => {
    if (!activeMeeting) {
      activeMeetingKeyRef.current = null;
      setPermissionsChecked(false);
      stopAudioSession();
      return;
    }

    const sessionKey = `${activeMeeting.roomName}_${activeMeeting.token}`;
    if (activeMeetingKeyRef.current === sessionKey) {
      return;
    }
    activeMeetingKeyRef.current = sessionKey;

    startAudioSession();

    (async () => {
      try {
        const granted = await requestPermissions();
        if (Platform.OS === 'android') {
          const cam = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
          const aud = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
          setHasCameraPermission(cam);
          setHasAudioPermission(aud);
        }
      } catch (err) {
        console.warn('[GlobalMeetingOverlay] Error checking permissions:', err);
      } finally {
        setPermissionsChecked(true);
      }
    })();

    return () => {
      stopAudioSession();
    };
  }, [activeMeeting]);

  // Handle transient errors gracefully without ejecting user
  const handleError = useCallback((e: Error) => {
    console.warn('[GlobalMeetingOverlay] LiveKit connection event (auto-recovering):', e.message);
  }, []);

  // UI ejection handling: Only end meeting on explicit leave or room teardown
  const handleDisconnected = useCallback((reason?: DisconnectReason) => {
    if (__DEV__) console.log('[GlobalMeetingOverlay] Room disconnected event with reason:', reason);

    // Host Absolute Immunity Guard: The host must NEVER be auto-ejected from their own meeting!
    if (activeMeeting?.isHost) {
      if (__DEV__) console.log('[GlobalMeetingOverlay] Host session preserved despite disconnect event.');
      return;
    }

    if (isUserLeavingRef.current) {
      endMeeting();
      return;
    }

    if (
      reason === DisconnectReason.CLIENT_INITIATED ||
      reason === DisconnectReason.ROOM_DELETED ||
      reason === DisconnectReason.ROOM_CLOSED ||
      reason === DisconnectReason.PARTICIPANT_REMOVED ||
      reason === DisconnectReason.USER_REJECTED
    ) {
      if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
        Alert.alert(
          'Removed from Meeting',
          'You have been removed from the meeting by the host.',
          [{ text: 'OK' }]
        );
      }
      endMeeting();
    }
  }, [activeMeeting?.isHost, endMeeting]);

  const handleFloatingLeave = useCallback(async () => {
    isUserLeavingRef.current = true;
    if (activeMeeting?.isHost && activeMeeting.meetingCode) {
      try {
        await endMeetingApi(activeMeeting.meetingCode, activeMeeting.hostSessionToken);
        const cleanCode = activeMeeting.meetingCode.replace(/[\s-]/g, '');
        await storage.removeItem(`host_session_${cleanCode}`);
      } catch {}
    } else if (activeMeeting?.meetingCode) {
      try {
        await leaveMeetingApi(activeMeeting.meetingCode, activeMeeting.hostSessionToken);
      } catch {}
    }
    endMeeting();
  }, [activeMeeting, endMeeting]);

  if (!activeMeeting || !activeMeeting.token || !activeMeeting.serverUrl) {
    return null;
  }

  if (!permissionsChecked) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00A8FF" />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Primary Video Conference Room */}
      <LiveKitRoom
        serverUrl={activeMeeting.serverUrl}
        token={activeMeeting.token}
        connect={true}
        video={!activeMeeting.muteVideo && hasCameraPermission}
        audio={!activeMeeting.muteAudio && hasAudioPermission}
        connectOptions={connectOptions}
        room={room}
        onDisconnected={handleDisconnected}
        onError={handleError}
      >
        {/* Active In-App View */}
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              display: isMinimized ? 'none' : 'flex',
              zIndex: isMinimized ? 0 : 9999,
              backgroundColor: '#050B14',
            },
          ]}
          pointerEvents={isMinimized ? 'none' : 'auto'}
        >
          <MeetingRoomContent
            roomName={activeMeeting.roomName}
            meetingCode={activeMeeting.meetingCode}
            meetingTitle={activeMeeting.meetingTitle}
            isHostParam={activeMeeting.isHost}
            isGuest={activeMeeting.isGuest}
            hostSessionToken={activeMeeting.hostSessionToken}
            onLeave={endMeeting}
            onMinimize={minimizeMeeting}
            isMinimized={isMinimized}
            muteAudioParam={activeMeeting.muteAudio}
            muteVideoParam={activeMeeting.muteVideo}
            hasAudioPermission={hasAudioPermission}
            hasCameraPermission={hasCameraPermission}
          />
        </View>

        {/* Floating PiP View when minimized in-app (not in native OS PiP) */}
        {isMinimized && (
          <FloatingPiPView
            roomName={activeMeeting.roomName}
            meetingTitle={activeMeeting.meetingTitle}
            onMaximize={maximizeMeeting}
            onLeave={handleFloatingLeave}
          />
        )}
      </LiveKitRoom>
    </View>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050B14',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },
});

export default GlobalMeetingOverlay;
