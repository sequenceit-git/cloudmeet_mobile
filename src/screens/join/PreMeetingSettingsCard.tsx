import React from 'react';
import { View, Text, Switch } from 'react-native';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react-native';
import { styles } from './joinStyles';

interface PreMeetingSettingsCardProps {
  muteAudio: boolean;
  setMuteAudio: (val: boolean) => void;
  muteVideo: boolean;
  setMuteVideo: (val: boolean) => void;
  colors: any;
  isDark: boolean;
  t: (key: string) => string;
}

export const PreMeetingSettingsCard: React.FC<PreMeetingSettingsCardProps> = ({
  muteAudio,
  setMuteAudio,
  muteVideo,
  setMuteVideo,
  colors,
  isDark,
  t,
}) => {
  return (
    <View style={[styles.settingsCard, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.settingsSectionTitle, !isDark && { color: colors.textSecondary }]}>
        {t('join.joinOptions')}
      </Text>

      {/* Mute Audio Option */}
      <View style={styles.settingItem}>
        <View style={styles.settingLeft}>
          <View style={[styles.settingIconWrap, muteAudio && styles.settingIconWrapMuted]}>
            {muteAudio ? <MicOff color="#EF4444" size={18} /> : <Mic color="#10B981" size={18} />}
          </View>
          <View style={styles.settingTexts}>
            <Text style={[styles.settingTitle, !isDark && { color: colors.textPrimary }]}>{t('join.muteMic')}</Text>
            <Text style={[styles.settingSubtitle, !isDark && { color: colors.textSecondary }]}>
              {muteAudio ? t('join.micOffSubtitle') : t('join.micOnSubtitle')}
            </Text>
          </View>
        </View>
        <Switch
          value={muteAudio}
          onValueChange={setMuteAudio}
          trackColor={{ false: isDark ? '#1e293b' : '#CBD5E1', true: colors.primary }}
          thumbColor="#FFFFFF"
        />
      </View>

      <View style={[styles.settingDivider, !isDark && { backgroundColor: colors.divider }]} />

      {/* Turn Off Video Option */}
      <View style={styles.settingItem}>
        <View style={styles.settingLeft}>
          <View style={[styles.settingIconWrap, muteVideo && styles.settingIconWrapMuted]}>
            {muteVideo ? <VideoOff color="#EF4444" size={18} /> : <Video color="#10B981" size={18} />}
          </View>
          <View style={styles.settingTexts}>
            <Text style={[styles.settingTitle, !isDark && { color: colors.textPrimary }]}>{t('join.turnCameraOff')}</Text>
            <Text style={[styles.settingSubtitle, !isDark && { color: colors.textSecondary }]}>
              {muteVideo ? t('join.cameraOffSubtitle') : t('join.cameraOnSubtitle')}
            </Text>
          </View>
        </View>
        <Switch
          value={muteVideo}
          onValueChange={setMuteVideo}
          trackColor={{ false: isDark ? '#1e293b' : '#CBD5E1', true: colors.primary }}
          thumbColor="#FFFFFF"
        />
      </View>
    </View>
  );
};

export default PreMeetingSettingsCard;
