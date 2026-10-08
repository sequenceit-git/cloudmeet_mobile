import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../../hooks/useTranslation';
import { Participant } from 'livekit-client';
import {
  X,
  Mic,
  MicOff,
  Video as LucideVideo,
  UserPlus,
  Clock,
  Check,
  UserX,
} from 'lucide-react-native';
import { styles } from '../meetingRoomStyles';
import { WaitingGuestInfo } from '../components/MeetingBanners';

export interface MeetingParticipantsDrawerProps {
  insets: EdgeInsets;
  isOpen: boolean;
  onClose: () => void;
  activeMeetingParticipants: Participant[];
  localParticipantIdentity?: string;
  isHost: boolean;
  waitingGuests: WaitingGuestInfo[];
  onMuteAll: () => void;
  onOpenInviteModal: () => void;
  onAdmitAll: () => void;
  onAdmitGuest: (identity: string) => void;
  onDenyGuest: (identity: string) => void;
  onRemoveParticipant: (p: Participant) => void;
  checkIsParticipantHost: (p?: Participant | null) => boolean;
  getAvatarTextStyle: (name: string, size: number) => any;
  getInitials: (name: string) => string;
}

export const MeetingParticipantsDrawer: React.FC<MeetingParticipantsDrawerProps> = ({
  insets,
  isOpen,
  onClose,
  activeMeetingParticipants,
  localParticipantIdentity,
  isHost,
  waitingGuests,
  onMuteAll,
  onOpenInviteModal,
  onAdmitAll,
  onAdmitGuest,
  onDenyGuest,
  onRemoveParticipant,
  checkIsParticipantHost,
  getAvatarTextStyle,
  getInitials,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <View style={[styles.drawer, { paddingTop: insets.top }]}>
      <View style={styles.dragHandleWrapper}>
        <View style={styles.dragHandle} />
      </View>
      <View style={styles.drawerHeader}>
        <View>
          <Text style={styles.drawerTitle}>
            {t('meeting.participants')} ({activeMeetingParticipants.length})
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <X color="#94a3b8" size={22} />
        </TouchableOpacity>
      </View>

      <View style={styles.hostActionRow}>
        <TouchableOpacity
          style={[styles.muteAllBtn, !isHost && { opacity: 0.5 }]}
          onPress={onMuteAll}
          activeOpacity={0.7}
        >
          <MicOff color="#ef4444" size={16} />
          <Text style={styles.muteAllText}>{t('meeting.muteAll')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.inviteOthersBtn}
          onPress={onOpenInviteModal}
          activeOpacity={0.7}
        >
          <UserPlus color="#00A8FF" size={16} />
          <Text style={styles.inviteOthersText}>{t('meeting.inviteOthers')}</Text>
        </TouchableOpacity>
      </View>

      {/* Waiting Room Section for Host */}
      {isHost && waitingGuests.length > 0 && (
        <View style={styles.waitingDrawerCard}>
          <View style={styles.waitingDrawerHeader}>
            <View style={styles.waitingDrawerTitleRow}>
              <Clock color="#00A8FF" size={15} />
              <Text style={styles.waitingDrawerTitle}>
                {t('meeting.waitingRoomTitle')} ({waitingGuests.length})
              </Text>
            </View>
            {waitingGuests.length > 1 && (
              <TouchableOpacity
                style={styles.admitAllBtn}
                onPress={onAdmitAll}
                activeOpacity={0.7}
              >
                <Text style={styles.admitAllBtnText}>{t('meeting.admitAll')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.waitingDrawerList}>
            {waitingGuests.map((g) => (
              <View key={g.identity} style={styles.waitingDrawerItem}>
                <View style={styles.waitingDrawerAvatar}>
                  <Text style={[styles.waitingDrawerAvatarText, getAvatarTextStyle(g.name, 14)]}>
                    {getInitials(g.name)}
                  </Text>
                </View>
                <View style={styles.waitingDrawerInfo}>
                  <Text style={styles.waitingDrawerName} numberOfLines={1}>
                    {g.name}
                  </Text>
                  <Text style={styles.waitingDrawerStatus}>{t('meeting.waitingToJoin')}</Text>
                </View>
                <View style={styles.waitingDrawerActions}>
                  <TouchableOpacity
                    style={styles.drawerDenyBtn}
                    onPress={() => onDenyGuest(g.identity)}
                    activeOpacity={0.7}
                  >
                    <X color="#ef4444" size={15} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.drawerAdmitBtn}
                    onPress={() => onAdmitGuest(g.identity)}
                    activeOpacity={0.7}
                  >
                    <Check color="#FFF" size={14} />
                    <Text style={styles.drawerAdmitText}>{t('meeting.admit')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      <ScrollView style={styles.partList} showsVerticalScrollIndicator={false}>
        {activeMeetingParticipants.map((p) => (
          <View
            key={p.sid || p.identity}
            style={[styles.partItem, p.identity === localParticipantIdentity && styles.partItemBg]}
          >
            <View style={styles.partAvatarContainer}>
              <View
                style={[
                  styles.partAvatar,
                  { borderColor: p.isCameraEnabled ? '#10b981' : '#ef4444', borderWidth: 1 },
                ]}
              >
                <Text style={[styles.partAvatarText, getAvatarTextStyle(p.name || p.identity, 14)]}>
                  {getInitials(p.name || p.identity)}
                </Text>
              </View>
            </View>
            <View style={styles.partInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.partName}>{p.name || p.identity}</Text>
                {p.identity === localParticipantIdentity && (
                  <View style={styles.meBadge}>
                    <Text style={styles.meBadgeText}>{t('meeting.you')}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.partRole}>{t('meeting.members')}</Text>
            </View>
            <View style={styles.partIcons}>
              {isHost && p.identity !== localParticipantIdentity && !checkIsParticipantHost(p) && (
                <TouchableOpacity
                  style={styles.partRemoveBtn}
                  onPress={() => onRemoveParticipant(p)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Remove participant"
                >
                  <UserX color="#ef4444" size={17} />
                </TouchableOpacity>
              )}
              <Mic
                color={p.isMicrophoneEnabled ? '#10b981' : '#ef4444'}
                size={18}
                style={{ marginRight: 8 }}
              />
              <LucideVideo color={p.isCameraEnabled ? '#10b981' : '#ef4444'} size={18} />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

export default MeetingParticipantsDrawer;
