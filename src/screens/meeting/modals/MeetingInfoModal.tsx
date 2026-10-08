import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { X, Copy, Check } from 'lucide-react-native';
import { styles } from '../meetingRoomStyles';

export interface MeetingInfoModalProps {
  visible: boolean;
  bottomInset?: number;
  meetingTitle?: string;
  meetingLink: string;
  copied: boolean;
  onCopyLink: (link: string) => void;
  onClose: () => void;
}

export const MeetingInfoModal: React.FC<MeetingInfoModalProps> = ({
  visible,
  bottomInset = 0,
  meetingTitle,
  meetingLink,
  copied,
  onCopyLink,
  onClose,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
          <View style={styles.modalDragHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Meeting Information</Text>
            <TouchableOpacity onPress={onClose}>
              <X color="#94a3b8" size={24} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Meeting Title</Text>
              <Text style={styles.infoValue}>{meetingTitle || 'Meeting'}</Text>
            </View>

            <View style={styles.linkSection}>
              <Text style={styles.infoLabel}>Invite Link</Text>
              <View style={[styles.linkDisplayBox, copied && { borderColor: '#10b981' }]}>
                <Text style={styles.linkDisplayText} numberOfLines={1}>
                  {meetingLink}
                </Text>
                <TouchableOpacity onPress={() => onCopyLink(meetingLink)}>
                  {copied ? (
                    <Check color="#10b981" size={20} />
                  ) : (
                    <Copy color="#00A8FF" size={20} />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.copyHint}>
                {copied ? 'Copied to clipboard!' : 'Share this link to invite others'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default MeetingInfoModal;
