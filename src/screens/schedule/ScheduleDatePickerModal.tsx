import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { styles } from './scheduleStyles';

interface ScheduleDatePickerModalProps {
  visible: boolean;
  pickerMode: 'date' | 'time' | null;
  tempPickerDate: Date;
  scheduledDate: Date;
  isDark: boolean;
  colors: any;
  t: (key: string) => string;
  onTempDateChange: (date: Date) => void;
  onConfirm: (updatedDate: Date) => void;
  onClose: () => void;
}

export const ScheduleDatePickerModal: React.FC<ScheduleDatePickerModalProps> = ({
  visible,
  pickerMode,
  tempPickerDate,
  scheduledDate,
  isDark,
  colors,
  t,
  onTempDateChange,
  onConfirm,
  onClose,
}) => {
  if (!pickerMode || !visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {pickerMode === 'date' ? t('schedule.dateLabel') : t('schedule.timeLabel')}
            </Text>
          </View>

          <View style={styles.pickerWrapper}>
            <DateTimePicker
              value={tempPickerDate}
              mode={pickerMode}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              is24Hour={true}
              minimumDate={pickerMode === 'date' ? new Date() : undefined}
              onChange={(_, selected) => {
                if (selected) onTempDateChange(selected);
              }}
              themeVariant={isDark ? 'dark' : 'light'}
              textColor={colors.text}
            />
          </View>

          <View style={styles.modalBtnRow}>
            <TouchableOpacity
              style={[styles.modalCancelBtn, !isDark && { backgroundColor: '#F1F5F9' }]}
              onPress={onClose}
            >
              <Text style={[styles.modalCancelText, !isDark && { color: colors.textSecondary }]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalConfirmBtn}
              onPress={() => {
                const updated = new Date(scheduledDate);
                if (pickerMode === 'date') {
                  updated.setFullYear(
                    tempPickerDate.getFullYear(),
                    tempPickerDate.getMonth(),
                    tempPickerDate.getDate()
                  );
                } else {
                  updated.setHours(
                    tempPickerDate.getHours(),
                    tempPickerDate.getMinutes(),
                    0,
                    0
                  );
                }
                onConfirm(updated);
              }}
            >
              <Text style={styles.modalConfirmText}>{t('common.confirm') || 'OK'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};
