import React, { useState, useCallback } from 'react';
import { AudioSession } from '@livekit/react-native';
import { Volume2, Smartphone, Headphones, Bluetooth } from 'lucide-react-native';
import { useTranslation } from '../../../hooks/useTranslation';

export const useMeetingAudio = () => {
  const { t } = useTranslation();
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [availableOutputs, setAvailableOutputs] = useState<string[]>(['speaker', 'earpiece']);
  const [selectedAudioOutput, setSelectedAudioOutput] = useState<string>('speaker');
  const [isRefreshingOutputs, setIsRefreshingOutputs] = useState(false);

  const getAudioDeviceDisplay = useCallback((deviceId: string) => {
    switch (deviceId) {
      case 'speaker':
      case 'force_speaker':
        return {
          name: t('meeting.phoneSpeaker'),
          description: t('meeting.phoneSpeakerDesc'),
          icon: Volume2,
        };
      case 'earpiece':
      case 'default':
        return {
          name: t('meeting.earSpeaker'),
          description: t('meeting.earSpeakerDesc'),
          icon: Smartphone,
        };
      case 'headset':
        return {
          name: t('meeting.wiredHeadphones'),
          description: t('meeting.wiredHeadphonesDesc'),
          icon: Headphones,
        };
      case 'bluetooth':
        return {
          name: t('meeting.bluetoothEarphones'),
          description: t('meeting.bluetoothEarphonesDesc'),
          icon: Bluetooth,
        };
      default:
        return {
          name: deviceId.charAt(0).toUpperCase() + deviceId.slice(1),
          description: t('meeting.outputDevices'),
          icon: Volume2,
        };
    }
  }, [t]);

  const fetchAudioOutputs = useCallback(async (autoSelectDefault = false) => {
    try {
      setIsRefreshingOutputs(true);
      const outputs = await AudioSession.getAudioOutputs();
      console.log('[Audio] Detected available outputs:', outputs);

      const list = outputs && outputs.length > 0 ? [...outputs] : ['speaker', 'earpiece'];
      if (!list.includes('speaker') && !list.includes('force_speaker')) {
        list.unshift('speaker');
      }
      if (!list.includes('earpiece') && !list.includes('default')) {
        list.push('earpiece');
      }

      setAvailableOutputs(list);

      if (autoSelectDefault) {
        if (list.includes('speaker')) {
          setSelectedAudioOutput('speaker');
          await AudioSession.selectAudioOutput('speaker');
        } else if (list.includes('force_speaker')) {
          setSelectedAudioOutput('force_speaker');
          await AudioSession.selectAudioOutput('force_speaker');
        } else {
          setSelectedAudioOutput(list[0]);
          await AudioSession.selectAudioOutput(list[0]);
        }
      }
    } catch (err) {
      console.warn('[Audio] Failed to get audio outputs:', err);
    } finally {
      setIsRefreshingOutputs(false);
    }
  }, []);

  const handleSelectAudioOutput = useCallback(async (deviceId: string) => {
    try {
      console.log('[Audio] Selecting audio output:', deviceId);
      await AudioSession.selectAudioOutput(deviceId);
      setSelectedAudioOutput(deviceId);
      setIsAudioModalOpen(false);
    } catch (err: any) {
      console.warn('[Audio] Select output warning:', err);
      setSelectedAudioOutput(deviceId);
      setIsAudioModalOpen(false);
    }
  }, []);

  const renderCurrentAudioIcon = useCallback(() => {
    const config = getAudioDeviceDisplay(selectedAudioOutput);
    const IconComponent = config.icon;
    return React.createElement(IconComponent, { color: '#00A8FF', size: 20 });
  }, [getAudioDeviceDisplay, selectedAudioOutput]);

  return {
    isAudioModalOpen,
    setIsAudioModalOpen,
    availableOutputs,
    selectedAudioOutput,
    isRefreshingOutputs,
    fetchAudioOutputs,
    handleSelectAudioOutput,
    getAudioDeviceDisplay,
    renderCurrentAudioIcon,
  };
};

export default useMeetingAudio;
