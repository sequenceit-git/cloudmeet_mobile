import React from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from '../../../hooks/useTranslation';
import { Check, RefreshCw, X } from 'lucide-react-native';
import { styles } from '../meetingRoomStyles';

export interface AudioDeviceConfig {
  name: string;
  description: string;
  icon: any;
}

export interface AudioDeviceModalProps {
  visible: boolean;
  bottomInset?: number;
  availableOutputs: string[];
  selectedAudioOutput: string;
  isRefreshingOutputs?: boolean;
  onRefresh: () => void;
  onSelectDevice: (deviceId: string) => void;
  onClose: () => void;
  getAudioDeviceDisplay: (deviceId: string) => AudioDeviceConfig;
}

export const AudioDeviceModal: React.FC<AudioDeviceModalProps> = ({
  visible,
  bottomInset = 0,
  availableOutputs,
  selectedAudioOutput,
  isRefreshingOutputs = false,
  onRefresh,
  onSelectDevice,
  onClose,
  getAudioDeviceDisplay,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.audioModalContent, { paddingBottom: bottomInset + 20 }]}>
          <View style={styles.modalDragHandle} />
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{t('meeting.outputDevices')}</Text>
              <Text style={styles.modalSubtitle}>{t('meeting.outputDevices')}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity
                style={styles.refreshIconBtn}
                onPress={onRefresh}
                activeOpacity={0.7}
                disabled={isRefreshingOutputs}
              >
                {isRefreshingOutputs ? (
                  <ActivityIndicator size="small" color="#00A8FF" />
                ) : (
                  <RefreshCw color="#94a3b8" size={18} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
              >
                <X color="#94a3b8" size={20} />
              </TouchableOpacity>
            </View>
          </View>

          {/* List of Available Output Devices */}
          <View style={styles.audioDeviceList}>
            {availableOutputs.map((deviceId) => {
              const config = getAudioDeviceDisplay(deviceId);
              const IconComp = config.icon;
              const isSelected = selectedAudioOutput === deviceId;

              return (
                <TouchableOpacity
                  key={deviceId}
                  style={[
                    styles.audioDeviceItem,
                    isSelected && styles.audioDeviceItemSelected,
                  ]}
                  onPress={() => onSelectDevice(deviceId)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.audioDeviceIconBox,
                      isSelected && styles.audioDeviceIconBoxSelected,
                    ]}
                  >
                    <IconComp
                      color={isSelected ? '#00A8FF' : '#94a3b8'}
                      size={22}
                    />
                  </View>

                  <View style={styles.audioDeviceInfo}>
                    <Text
                      style={[
                        styles.audioDeviceName,
                        isSelected && styles.audioDeviceNameSelected,
                      ]}
                    >
                      {config.name}
                    </Text>
                    <Text style={styles.audioDeviceDesc}>
                      {config.description}
                    </Text>
                  </View>

                  <View style={styles.audioDeviceCheckContainer}>
                    {isSelected ? (
                      <View style={styles.audioActiveCheckBadge}>
                        <Check color="#FFF" size={14} />
                      </View>
                    ) : (
                      <View style={styles.audioUncheckedCircle} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tip Footer */}
          <View style={styles.audioTipFooter}>
            <Text style={styles.audioTipText}>
              {t('meeting.audioDeviceTip')}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default AudioDeviceModal;
