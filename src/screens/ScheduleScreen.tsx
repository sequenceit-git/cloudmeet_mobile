import { useNavigation } from '@react-navigation/native';
import {
  Calendar,
  Check,
  CheckCircle,
  ChevronLeft,
  Clock,
  Copy,
  Lock,
  RefreshCw,
  Shield,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientButton from '../components/common/GradientButton';
import { useTranslation } from '../hooks/useTranslation';
import { useTheme } from '../context/ThemeContext';
import { RootStackNavigationProp } from '../navigation/types';
import { scheduleMeeting } from '../services/api';
import storage, { StorageKeys } from '../services/storage';
import { styles } from './schedule/scheduleStyles';
import { ScheduleDatePickerModal } from './schedule/ScheduleDatePickerModal';
import { SchedulePasscodeSection } from './schedule/SchedulePasscodeSection';

export const ScheduleScreen: React.FC = () => {
  const navigation = useNavigation<RootStackNavigationProp<'Schedule'>>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { isDark, colors } = useTheme();

  const [topic, setTopic] = useState('Cloud News Meeting');
  const [scheduledDate, setScheduledDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    if (d.getMinutes() > 30) {
      d.setHours(d.getHours() + 1, 0, 0, 0);
    } else {
      d.setMinutes(30, 0, 0);
    }
    return d;
  });

  const [requirePasscode, setRequirePasscode] = useState(true);
  const [passcode, setPasscode] = useState(() =>
    Math.floor(100000 + Math.random() * 900000).toString()
  );
  const [copiedPasscode, setCopiedPasscode] = useState(false);
  const [enableWaitingRoom, setEnableWaitingRoom] = useState(true);
  const [loading, setLoading] = useState(false);

  // Fallback / iOS picker modal state
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [tempPickerDate, setTempPickerDate] = useState<Date>(scheduledDate);

  React.useEffect(() => {
    const checkAuth = async () => {
      const token = await storage.getItem(StorageKeys.AUTH_TOKEN);
      const isGuest = await storage.getItem(StorageKeys.IS_GUEST);
      if (!token || isGuest === 'true') {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Onboarding' }],
        });
      }
    };
    checkAuth();
  }, [navigation]);

  const formatDateDisplay = (dateObj: Date): { main: string; sub: string } => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const main = `${year}-${month}-${day}`;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let sub = '';
    if (diffDays === 0) {
      sub = 'Today';
    } else if (diffDays === 1) {
      sub = 'Tomorrow';
    } else {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      sub = days[dateObj.getDay()];
    }

    return { main, sub };
  };

  const formatTimeDisplay = (dateObj: Date): { main: string; sub: string } => {
    const hours = dateObj.getHours();
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const hours24 = String(hours).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 === 0 ? 12 : hours % 12;

    return {
      main: `${hours24}:${minutes}`,
      sub: `${hours12}:${minutes} ${ampm}`,
    };
  };

  const handleOpenDatePicker = () => {
    if (Platform.OS === 'android') {
      try {
        DateTimePickerAndroid.open({
          value: scheduledDate,
          mode: 'date',
          minimumDate: new Date(),
          onChange: (event: DateTimePickerEvent, selected?: Date) => {
            if (event.type === 'set' && selected) {
              const updated = new Date(scheduledDate);
              updated.setFullYear(
                selected.getFullYear(),
                selected.getMonth(),
                selected.getDate()
              );
              setScheduledDate(updated);
            }
          },
        });
        return;
      } catch (e) {
        console.warn('Native date picker error, using modal fallback:', e);
      }
    }
    setTempPickerDate(new Date(scheduledDate));
    setPickerMode('date');
  };

  const handleOpenTimePicker = () => {
    if (Platform.OS === 'android') {
      try {
        DateTimePickerAndroid.open({
          value: scheduledDate,
          mode: 'time',
          is24Hour: true,
          onChange: (event: DateTimePickerEvent, selected?: Date) => {
            if (event.type === 'set' && selected) {
              const updated = new Date(scheduledDate);
              updated.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
              setScheduledDate(updated);
            }
          },
        });
        return;
      } catch (e) {
        console.warn('Native time picker error, using modal fallback:', e);
      }
    }
    setTempPickerDate(new Date(scheduledDate));
    setPickerMode('time');
  };

  const handleRegeneratePasscode = () => {
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    setPasscode(newCode);
    setCopiedPasscode(false);
  };

  const handleCopyPasscode = async () => {
    if (!passcode) return;
    await Clipboard.setStringAsync(passcode);
    setCopiedPasscode(true);
    setTimeout(() => setCopiedPasscode(false), 2000);
  };

  const handleSave = async () => {
    if (!topic.trim()) {
      Alert.alert(t('common.error'), t('schedule.topicPlaceholder'));
      return;
    }

    const now = new Date();
    if (scheduledDate.getTime() <= now.getTime() + 60 * 1000) {
      Alert.alert(t('common.error'), t('schedule.futureTimeError'));
      return;
    }

    if (requirePasscode) {
      const cleanPass = passcode.trim();
      if (!cleanPass || cleanPass.length < 4 || cleanPass.length > 16) {
        Alert.alert(t('common.error'), t('schedule.passcodeLengthError'));
        return;
      }
    }

    setLoading(true);
    try {
      const year = scheduledDate.getFullYear();
      const month = String(scheduledDate.getMonth() + 1).padStart(2, '0');
      const day = String(scheduledDate.getDate()).padStart(2, '0');
      const hours = String(scheduledDate.getHours()).padStart(2, '0');
      const minutes = String(scheduledDate.getMinutes()).padStart(2, '0');
      const startTime = `${year}-${month}-${day} ${hours}:${minutes}:00`;

      const response = await scheduleMeeting({
        title: topic.trim(),
        scheduled_at: startTime,
        passcode: requirePasscode ? passcode.trim() : undefined,
        waiting_room: enableWaitingRoom,
      });

      if (response.success && response.data) {
        const meeting = response.data;
        const passMsg = requirePasscode ? `\nPasscode: ${passcode.trim()}` : '';
        Alert.alert(
          t('common.success'),
          `${t('schedule.successMsg')}\n\nID: ${meeting.meeting_code}${passMsg}`,
          [
            {
              text: t('common.ok'),
              onPress: () => navigation.replace('Home'),
            },
          ]
        );
      } else {
        Alert.alert(t('common.error'), response.message || 'Could not schedule meeting');
      }
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || 'Something went wrong';
      Alert.alert(t('common.error'), msg);
    } finally {
      setLoading(false);
    }
  };

  const dateDisplay = formatDateDisplay(scheduledDate);
  const timeDisplay = formatTimeDisplay(scheduledDate);

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.05)' : colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[
            styles.backBtn,
            !isDark && { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          activeOpacity={0.7}
        >
          <ChevronLeft color={isDark ? '#94a3b8' : colors.textSecondary} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('schedule.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Topic */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: isDark ? '#94a3b8' : colors.textSecondary }]}>
            {t('schedule.topicLabel')}
          </Text>
          <TextInput
            style={[
              styles.input,
              !isDark && {
                backgroundColor: colors.card,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={topic}
            onChangeText={setTopic}
            placeholder={t('schedule.topicPlaceholder')}
            placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
          />
        </View>

        {/* Date & Time Selectors */}
        <View style={styles.row}>
          {/* Date Picker Button */}
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={[styles.label, { color: isDark ? '#94a3b8' : colors.textSecondary }]}>
              {t('schedule.dateLabel')}
            </Text>
            <TouchableOpacity
              style={[
                styles.pickerTriggerBox,
                !isDark && {
                  backgroundColor: colors.card,
                  borderColor: 'rgba(0, 140, 208, 0.3)',
                },
              ]}
              onPress={handleOpenDatePicker}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.pickerIconWrap,
                  !isDark && { backgroundColor: 'rgba(0, 140, 208, 0.1)' },
                ]}
              >
                <Calendar color={colors.primary} size={18} />
              </View>
              <View style={styles.pickerTextColumn}>
                <Text style={[styles.pickerMainText, { color: colors.text }]}>{dateDisplay.main}</Text>
                <Text style={[styles.pickerSubText, { color: colors.primary }]}>{dateDisplay.sub}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Time Picker Button */}
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={[styles.label, { color: isDark ? '#94a3b8' : colors.textSecondary }]}>
              {t('schedule.timeLabel')}
            </Text>
            <TouchableOpacity
              style={[
                styles.pickerTriggerBox,
                !isDark && {
                  backgroundColor: colors.card,
                  borderColor: 'rgba(0, 140, 208, 0.3)',
                },
              ]}
              onPress={handleOpenTimePicker}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.pickerIconWrap,
                  !isDark && { backgroundColor: 'rgba(0, 140, 208, 0.1)' },
                ]}
              >
                <Clock color={colors.primary} size={18} />
              </View>
              <View style={styles.pickerTextColumn}>
                <Text style={[styles.pickerMainText, { color: colors.text }]}>{timeDisplay.main}</Text>
                <Text style={[styles.pickerSubText, { color: colors.primary }]}>{timeDisplay.sub}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Security & Meeting Options */}
        <View
          style={[
            styles.settingsCard,
            !isDark && {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: '#000',
              shadowOpacity: 0.05,
              shadowRadius: 10,
              elevation: 2,
            },
          ]}
        >
          <View style={styles.settingsHeaderRow}>
            <Shield color={colors.primary} size={16} />
            <Text style={[styles.settingsTitle, { color: isDark ? '#94a3b8' : colors.textSecondary }]}>
              {t('schedule.optionsTitle')}
            </Text>
          </View>

          {/* Passcode Switch */}
          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <View style={styles.settingLabelRow}>
                <Lock color={colors.primary} size={15} />
                <Text style={[styles.settingText, { color: colors.text }]}>{t('schedule.passcode')}</Text>
              </View>
              <Text style={styles.settingSub}>{t('schedule.passcodeSubtitle')}</Text>
            </View>
            <Switch
              value={requirePasscode}
              onValueChange={setRequirePasscode}
              trackColor={{ false: isDark ? '#1e293b' : '#cbd5e1', true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Passcode Input Field (Shown when Require Passcode is ON) */}
          {requirePasscode && (
            <SchedulePasscodeSection
              passcode={passcode}
              isDark={isDark}
              colors={colors}
              copiedPasscode={copiedPasscode}
              t={t}
              onPasscodeChange={setPasscode}
              onRegenerate={handleRegeneratePasscode}
              onCopy={handleCopyPasscode}
            />
          )}

          <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : colors.border }]} />

          {/* Waiting Room Switch */}
          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <View style={styles.settingLabelRow}>
                <Shield color={colors.primary} size={15} />
                <Text style={[styles.settingText, { color: colors.text }]}>{t('schedule.waitingRoom')}</Text>
              </View>
              <Text style={styles.settingSub}>{t('schedule.waitingRoomSubtitle')}</Text>
            </View>
            <Switch
              value={enableWaitingRoom}
              onValueChange={setEnableWaitingRoom}
              trackColor={{ false: isDark ? '#1e293b' : '#cbd5e1', true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      </ScrollView>

      {/* Footer Button */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 20,
            backgroundColor: colors.background,
            borderTopColor: isDark ? 'rgba(255, 255, 255, 0.05)' : colors.border,
            borderTopWidth: 1,
          },
        ]}
      >
        <GradientButton
          title={loading ? '' : t('schedule.scheduleBtn')}
          icon={
            loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <CheckCircle color="#FFF" size={20} />
            )
          }
          onPress={handleSave}
          style={styles.saveBtn}
          colors={['#00A8FF', '#0066CC']}
          disabled={loading}
        />
      </View>

      {/* Fallback Picker Modal (iOS or unsupported environments) */}
      <ScheduleDatePickerModal
        visible={Boolean(pickerMode)}
        pickerMode={pickerMode}
        tempPickerDate={tempPickerDate}
        scheduledDate={scheduledDate}
        isDark={isDark}
        colors={colors}
        t={t}
        onTempDateChange={setTempPickerDate}
        onConfirm={(updated) => {
          setScheduledDate(updated);
          setPickerMode(null);
        }}
        onClose={() => setPickerMode(null)}
      />
    </View>
  );
};

export default ScheduleScreen;

