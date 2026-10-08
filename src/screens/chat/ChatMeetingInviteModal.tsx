import React from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import { Video, Calendar } from 'lucide-react-native';
import { styles } from './chatDetailStyles';

interface ChatMeetingInviteModalProps {
  visible: boolean;
  name: string;
  isDark: boolean;
  colors: any;
  onStartInstantMeeting: () => void;
  onSendMeetingInvite: () => void;
  onClose: () => void;
}

export const ChatMeetingInviteModal: React.FC<ChatMeetingInviteModalProps> = ({
  visible,
  name,
  isDark,
  colors,
  onStartInstantMeeting,
  onSendMeetingInvite,
  onClose,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.meetingModalBackdrop, !isDark && { backgroundColor: colors.modalOverlay }]}>
        <View style={[styles.meetingModalCard, !isDark && { backgroundColor: colors.modalBg, borderColor: colors.border }]}>
          <View style={styles.meetingModalHeader}>
            <View style={[styles.meetingModalIcon, !isDark && { backgroundColor: colors.iconBoxBg }]}>
              <Video color={colors.primary} size={24} />
            </View>
            <Text style={[styles.meetingModalTitle, !isDark && { color: colors.textPrimary }]}>
              Meeting with {name}
            </Text>
            <Text style={[styles.meetingModalSubtitle, !isDark && { color: colors.textSecondary }]}>
              Choose how you want to connect
            </Text>
          </View>

          <TouchableOpacity
            style={styles.meetingModalPrimaryBtn}
            onPress={onStartInstantMeeting}
            activeOpacity={0.8}
          >
            <Video color="#FFFFFF" size={18} />
            <Text style={styles.meetingModalPrimaryText}>Start Instant Meeting</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.meetingModalSecondaryBtn, !isDark && { backgroundColor: colors.iconBoxBg, borderColor: 'rgba(0, 140, 208, 0.3)' }]}
            onPress={onSendMeetingInvite}
            activeOpacity={0.8}
          >
            <Calendar color={colors.primary} size={18} />
            <Text style={[styles.meetingModalSecondaryText, !isDark && { color: colors.primary }]}>
              Send Invite Card in Chat
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.meetingModalCancelBtn, !isDark && { backgroundColor: colors.cardSubtle }]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={[styles.meetingModalCancelText, !isDark && { color: colors.textSecondary }]}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default ChatMeetingInviteModal;
