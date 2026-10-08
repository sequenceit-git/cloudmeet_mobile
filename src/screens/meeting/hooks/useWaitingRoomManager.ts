import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { RoomEvent, ConnectionState, Participant, DisconnectReason } from 'livekit-client';
import { endMeeting, leaveMeeting, removeMeetingParticipant } from '../../../services/api';
import storage from '../../../services/storage';
import { checkIsParticipantHost } from '../meetingRoomUtils';

export interface UseWaitingRoomManagerProps {
  room: any;
  localParticipant: any;
  allParticipants: Participant[];
  isHost: boolean;
  isGuest?: boolean;
  meetingCode?: string;
  roomName?: string;
  hostSessionTokenRef: React.MutableRefObject<string | null>;
  onLeave: () => void;
  manualReconnect: () => void;
  isMicMuted: boolean;
  isCameraOff: boolean;
  setIsMicMuted: (muted: boolean) => void;
  t: (key: string, options?: any) => string;
}

export const useWaitingRoomManager = ({
  room,
  localParticipant,
  allParticipants,
  isHost,
  isGuest,
  meetingCode,
  roomName,
  hostSessionTokenRef,
  onLeave,
  manualReconnect,
  isMicMuted,
  isCameraOff,
  setIsMicMuted,
  t,
}: UseWaitingRoomManagerProps) => {
  const [waitingGuests, setWaitingGuests] = useState<{ identity: string; name: string; requestedAt: number }[]>([]);
  const [latestWaitingGuest, setLatestWaitingGuest] = useState<{ identity: string; name: string; requestedAt: number } | null>(null);
  const admittedGuestIdsRef = useRef<Set<string>>(new Set());
  const promptDismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (latestWaitingGuest) {
      if (promptDismissTimerRef.current) clearTimeout(promptDismissTimerRef.current);
      promptDismissTimerRef.current = setTimeout(() => {
        setLatestWaitingGuest(null);
      }, 12000);
    }
    return () => {
      if (promptDismissTimerRef.current) clearTimeout(promptDismissTimerRef.current);
    };
  }, [latestWaitingGuest]);

  const [hostPresenceData, setHostPresenceData] = useState<{ isPresent: boolean; hostIdentity?: string }>({
    isPresent: false,
  });

  const isHostPresent = useMemo(() => {
    if (isHost) return true;

    const hasRemoteHost = allParticipants.some(p => {
      if (p.identity === localParticipant?.identity) return false;
      return checkIsParticipantHost(p);
    });
    if (hasRemoteHost) return true;

    if (hostPresenceData.isPresent && hostPresenceData.hostIdentity) {
      return allParticipants.some(p => p.identity === hostPresenceData.hostIdentity);
    }

    return false;
  }, [isHost, allParticipants, localParticipant, hostPresenceData]);

  const [isAdmitted, setIsAdmitted] = useState(true);
  const isInWaitingRoom = false;

  const handleAdmitGuest = useCallback((guestIdentity: string) => {
    if (!localParticipant) return;
    const encoder = new TextEncoder();
    const payload = encoder.encode(
      JSON.stringify({
        type: 'ADMIT_GUEST',
        guestIdentity,
        admittedBy: localParticipant.name || 'Host',
        timestamp: Date.now(),
      })
    );
    localParticipant.publishData(payload, { reliable: true } as any).catch(() => {});

    admittedGuestIdsRef.current.add(guestIdentity);
    setWaitingGuests(prev => prev.filter(g => g.identity !== guestIdentity));
    setLatestWaitingGuest(prev => (prev?.identity === guestIdentity ? null : prev));
  }, [localParticipant]);

  const handleAdmitAll = useCallback(() => {
    if (!localParticipant) return;
    const encoder = new TextEncoder();
    const payload = encoder.encode(
      JSON.stringify({
        type: 'ADMIT_GUEST',
        guestIdentity: 'ALL',
        admittedBy: localParticipant.name || 'Host',
        timestamp: Date.now(),
      })
    );
    localParticipant.publishData(payload, { reliable: true } as any).catch(() => {});

    waitingGuests.forEach(g => admittedGuestIdsRef.current.add(g.identity));
    setWaitingGuests([]);
    setLatestWaitingGuest(null);
  }, [localParticipant, waitingGuests]);

  const handleDenyGuest = useCallback((guestIdentity: string) => {
    if (!localParticipant) return;
    const encoder = new TextEncoder();
    const payload = encoder.encode(
      JSON.stringify({
        type: 'DENY_GUEST',
        guestIdentity,
        timestamp: Date.now(),
      })
    );
    localParticipant.publishData(payload, { reliable: true } as any).catch(() => {});

    setWaitingGuests(prev => prev.filter(g => g.identity !== guestIdentity));
    setLatestWaitingGuest(prev => (prev?.identity === guestIdentity ? null : prev));
  }, [localParticipant]);

  const isEndingNoticeShownRef = useRef<boolean>(false);
  const isRemovedNoticeShownRef = useRef<boolean>(false);
  const isUserLeavingRef = useRef<boolean>(false);

  const handleMeetingEndedNotice = useCallback((customMsg?: string) => {
    if (isHost || isEndingNoticeShownRef.current) return;
    isEndingNoticeShownRef.current = true;

    const title = t('meeting.hostLeftMeetingEndedTitle') || 'Meeting Ended';
    const message =
      customMsg ||
      t('meeting.hostLeftMeetingEnded') ||
      'The host has left the meeting. The meeting has ended.';

    const autoExitTimer = setTimeout(() => {
      try {
        room?.disconnect();
      } catch {}
      onLeave();
    }, 4500);

    Alert.alert(
      title,
      message,
      [
        {
          text: t('common.ok') || 'OK',
          onPress: () => {
            clearTimeout(autoExitTimer);
            try {
              room?.disconnect();
            } catch {}
            onLeave();
          },
        },
      ],
      { cancelable: false }
    );
  }, [isHost, room, onLeave, t]);

  const handleRemovedByHostNotice = useCallback((customMsg?: string) => {
    if (isRemovedNoticeShownRef.current) return;
    isRemovedNoticeShownRef.current = true;

    const title = t('meeting.removedFromMeeting') || 'Removed from Meeting';
    const message =
      customMsg ||
      t('meeting.removedByHostNotice') ||
      'You have been removed from the meeting by the host.';

    const autoExitTimer = setTimeout(() => {
      try {
        room?.disconnect();
      } catch {}
      onLeave();
    }, 4500);

    Alert.alert(
      title,
      message,
      [
        {
          text: t('common.ok') || 'OK',
          onPress: () => {
            clearTimeout(autoExitTimer);
            try {
              room?.disconnect();
            } catch {}
            onLeave();
          },
        },
      ],
      { cancelable: false }
    );
  }, [room, onLeave, t]);

  const handleExecuteRemoveParticipant = useCallback(async (p: Participant) => {
    if (!room || !localParticipant || !isHost) return;

    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(
        JSON.stringify({
          type: 'REMOVE_PARTICIPANT',
          targetIdentity: p.identity,
          timestamp: Date.now(),
        })
      );
      await localParticipant.publishData(payload, { reliable: true } as any).catch(() => {});

      const code = meetingCode || roomName;
      if (code) {
        await removeMeetingParticipant(code, p.identity);
      }
    } catch (err: any) {
      console.warn('[WaitingRoom] Error removing participant:', err);
    }
  }, [room, localParticipant, isHost, meetingCode, roomName]);

  const handlePromptRemoveParticipant = useCallback((p: Participant) => {
    const name = p.name || p.identity || t('meeting.participant') || 'Participant';
    Alert.alert(
      t('meeting.removeParticipantTitle') || 'Remove Participant',
      t('meeting.removeParticipantConfirm', { name }) || `Are you sure you want to remove ${name} from this meeting?`,
      [
        {
          text: t('common.cancel') || 'Cancel',
          style: 'cancel',
        },
        {
          text: t('meeting.remove') || 'Remove',
          style: 'destructive',
          onPress: () => {
            handleExecuteRemoveParticipant(p);
          },
        },
      ]
    );
  }, [t, handleExecuteRemoveParticipant]);

  const handleLeaveOrEndMeeting = useCallback(async () => {
    if (isHost) {
      try {
        if (localParticipant && room?.state === ConnectionState.Connected) {
          const encoder = new TextEncoder();
          const payload = encoder.encode(
            JSON.stringify({
              type: 'MEETING_ENDED_BY_HOST',
              message: t('meeting.hostLeftMeetingEnded'),
              hostIdentity: localParticipant.identity,
              timestamp: Date.now(),
            })
          );
          await localParticipant.publishData(payload, { reliable: true } as any);
        }
      } catch (e) {
        console.warn('[WaitingRoom] Error publishing MEETING_ENDED_BY_HOST:', e);
      }

      try {
        if (meetingCode) {
          await endMeeting(meetingCode, hostSessionTokenRef.current || undefined);
          const cleanCode = meetingCode.replace(/[\s-]/g, '');
          await storage.removeItem(`host_session_${cleanCode}`);
        }
      } catch (e) {
        console.warn('[WaitingRoom] Error ending meeting on server:', e);
      }
    } else {
      try {
        if (meetingCode) {
          await leaveMeeting(meetingCode);
        }
      } catch (e) {
        console.warn('[WaitingRoom] Error notifying leave meeting on server:', e);
      }
    }

    try {
      await room?.disconnect();
    } catch (e) {
      console.warn('[WaitingRoom] Error disconnecting room:', e);
    }

    isUserLeavingRef.current = true;
    onLeave();
  }, [isHost, localParticipant, room, meetingCode, hostSessionTokenRef, onLeave, t]);

  const handleLeaveWaitingRoom = useCallback(async () => {
    if (isHost) {
      await handleLeaveOrEndMeeting();
      return;
    }

    if (localParticipant) {
      const encoder = new TextEncoder();
      const payload = encoder.encode(
        JSON.stringify({
          type: 'GUEST_LEFT_WAITING',
          guestIdentity: localParticipant.identity,
          timestamp: Date.now(),
        })
      );
      localParticipant.publishData(payload, { reliable: true } as any).catch(() => {});
    }

    try {
      if (meetingCode) {
        await leaveMeeting(meetingCode);
      }
    } catch {}

    try {
      await room?.disconnect();
    } catch {}

    isUserLeavingRef.current = true;
    onLeave();
  }, [isHost, handleLeaveOrEndMeeting, localParticipant, meetingCode, room, onLeave]);

  // Broadcast host presence when host connects
  useEffect(() => {
    if (!isHost || !localParticipant || !room) return;

    const broadcastHostPresence = () => {
      if (room.state !== ConnectionState.Connected) return;
      try {
        const encoder = new TextEncoder();
        const payload = encoder.encode(
          JSON.stringify({
            type: 'HOST_PRESENT',
            hostName: localParticipant.name || 'Host',
            hostIdentity: localParticipant.identity,
            timestamp: Date.now(),
          })
        );
        localParticipant.publishData(payload, { reliable: true } as any).catch(() => {});
      } catch (e) {}
    };

    if (room.state === ConnectionState.Connected) {
      broadcastHostPresence();
    }

    room.on(RoomEvent.Connected, broadcastHostPresence);
    return () => {
      room.off(RoomEvent.Connected, broadcastHostPresence);
    };
  }, [isHost, localParticipant, room]);

  // Data channel handlers for waiting room and control commands
  useEffect(() => {
    if (!room) return;

    const onDataReceived = (payload: Uint8Array, participant?: Participant) => {
      const decoder = new TextDecoder();
      const text = decoder.decode(payload);

      try {
        const parsed = JSON.parse(text);
        if (parsed.type === 'MEETING_ENDED_BY_HOST') {
          handleMeetingEndedNotice(parsed.message);
          return;
        }

        if (parsed.type === 'REMOVE_PARTICIPANT') {
          if (parsed.targetIdentity === localParticipant?.identity) {
            handleRemovedByHostNotice();
            return;
          }
        }

        if (parsed.type === 'HOST_PRESENT') {
          setHostPresenceData({ isPresent: true, hostIdentity: parsed.hostIdentity });
          return;
        }

        if (parsed.type === 'GUEST_WAITING' && isHost && localParticipant) {
          const encoder = new TextEncoder();
          const reply = encoder.encode(
            JSON.stringify({
              type: 'HOST_PRESENT',
              hostName: localParticipant.name || 'Host',
              hostIdentity: localParticipant.identity,
              timestamp: Date.now(),
            })
          );
          localParticipant.publishData(reply, { reliable: true } as any).catch(() => {});

          const guestId = parsed.guestIdentity;
          if (guestId) {
            if (admittedGuestIdsRef.current.has(guestId)) {
              const admitMsg = encoder.encode(
                JSON.stringify({
                  type: 'ADMIT_GUEST',
                  guestIdentity: guestId,
                  admittedBy: localParticipant.name || 'Host',
                  timestamp: Date.now(),
                })
              );
              localParticipant.publishData(admitMsg, { reliable: true } as any).catch(() => {});
              return;
            }

            const guestName = parsed.guestName || 'Guest';
            setWaitingGuests(prev => {
              if (prev.some(g => g.identity === guestId)) return prev;
              return [...prev, { identity: guestId, name: guestName, requestedAt: parsed.timestamp || Date.now() }];
            });

            setLatestWaitingGuest({ identity: guestId, name: guestName, requestedAt: parsed.timestamp || Date.now() });
          }
          return;
        }

        if (parsed.type === 'GUEST_LEFT_WAITING' && isHost) {
          const guestId = parsed.guestIdentity;
          if (guestId) {
            setWaitingGuests(prev => prev.filter(g => g.identity !== guestId));
            setLatestWaitingGuest(prev => (prev?.identity === guestId ? null : prev));
          }
          return;
        }

        if (parsed.type === 'ADMIT_GUEST' && isGuest) {
          if (parsed.guestIdentity === localParticipant?.identity || parsed.guestIdentity === 'ALL') {
            setIsAdmitted(true);
            setShowAdmittedBanner(true);
            if (localParticipant) {
              if (!isMicMuted) localParticipant.setMicrophoneEnabled(true).catch(() => {});
              if (!isCameraOff) localParticipant.setCameraEnabled(true).catch(() => {});
            }
            setTimeout(() => setShowAdmittedBanner(false), 4000);
          }
          return;
        }

        if (parsed.type === 'DENY_GUEST' && isGuest) {
          if (parsed.guestIdentity === localParticipant?.identity) {
            Alert.alert(
              t('meeting.admissionDeclined'),
              t('meeting.admissionDeclinedDesc'),
              [{ text: t('common.ok'), onPress: onLeave }]
            );
          }
          return;
        }

        if (parsed.type === 'MUTE_ALL') {
          if (localParticipant) {
            localParticipant.setMicrophoneEnabled(false);
            setIsMicMuted(true);
          }
          Alert.alert('Microphone Muted', `The host (${parsed.host || 'Host'}) has muted everyone.`);
          return;
        }
      } catch {}
    };

    room.on(RoomEvent.DataReceived, onDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, onDataReceived);
    };
  }, [room, localParticipant, isHost, isGuest, isMicMuted, isCameraOff, setIsMicMuted, handleMeetingEndedNotice, handleRemovedByHostNotice, onLeave, t]);

  useEffect(() => {
    if (!room) return;

    const handleRoomDisconnected = (reason?: any) => {
      if (isUserLeavingRef.current) {
        return;
      }

      if (isHost) {
        return;
      }

      if (reason === DisconnectReason.ROOM_CLOSED || reason === DisconnectReason.ROOM_DELETED) {
        handleMeetingEndedNotice();
      } else if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
        handleRemovedByHostNotice();
      } else {
        Alert.alert(
          t('meeting.connectionLostTitle') || 'Connection Lost',
          t('meeting.connectionLostDesc') || 'Connection was lost due to network issues. Would you like to reconnect?',
          [
            {
              text: t('meeting.leave') || 'Leave',
              style: 'cancel',
              onPress: onLeave,
            },
            {
              text: t('common.retry') || 'Reconnect',
              onPress: () => {
                manualReconnect();
              },
            },
          ]
        );
      }
    };

    room.on(RoomEvent.Disconnected, handleRoomDisconnected);
    return () => {
      room.off(RoomEvent.Disconnected, handleRoomDisconnected);
    };
  }, [room, isHost, handleMeetingEndedNotice, handleRemovedByHostNotice, onLeave, t, manualReconnect]);

  const [showAdmittedBanner, setShowAdmittedBanner] = useState(false);

  return {
    waitingGuests,
    setWaitingGuests,
    latestWaitingGuest,
    isHostPresent,
    isAdmitted,
    isInWaitingRoom,
    showAdmittedBanner,
    handleAdmitGuest,
    handleAdmitAll,
    handleDenyGuest,
    handlePromptRemoveParticipant,
    handleLeaveOrEndMeeting,
    handleLeaveWaitingRoom,
    isUserLeavingRef,
  };
};

export default useWaitingRoomManager;
