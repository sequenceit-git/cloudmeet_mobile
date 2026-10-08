import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from '../../../hooks/useTranslation';
import { styles } from '../meetingRoomStyles';

export interface LeaveMeetingModalProps {
  visible: boolean;
  isHost?: boolean;
  bottomInset?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export const LeaveMeetingModal: React.FC<LeaveMeetingModalProps> = ({
  visible,
  isHost = false,
  bottomInset = 0,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: bottomInset + 20 }]}>
          <View style={styles.modalDragHandle} />
          <Text style={styles.leaveModalTitle}>
            {isHost ? t('meeting.endConfirm') : t('meeting.leaveConfirm')}
          </Text>
          <Text style={styles.leaveModalSub}>
            {isHost ? t('meeting.endConfirmHost') : t('meeting.stay')}
          </Text>

          <View style={styles.leaveModalActions}>
            <TouchableOpacity
              style={[styles.confirmLeaveBtn, isHost && { backgroundColor: '#ef4444' }]}
              onPress={onConfirm}
            >
              <Text style={styles.confirmLeaveText}>
                {isHost ? t('meeting.endCallHost') : t('meeting.leave')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelLeaveBtn}
              onPress={onCancel}
            >
              <Text style={styles.cancelLeaveText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default LeaveMeetingModal;
