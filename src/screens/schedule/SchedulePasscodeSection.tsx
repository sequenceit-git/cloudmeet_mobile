import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { Lock, RefreshCw, Copy, Check } from 'lucide-react-native';
import { styles } from './scheduleStyles';

interface SchedulePasscodeSectionProps {
  passcode: string;
  isDark: boolean;
  colors: any;
  copiedPasscode: boolean;
  t: (key: string) => string;
  onPasscodeChange: (text: string) => void;
  onRegenerate: () => void;
  onCopy: () => void;
}

export const SchedulePasscodeSection: React.FC<SchedulePasscodeSectionProps> = ({
  passcode,
  isDark,
  colors,
  copiedPasscode,
  t,
  onPasscodeChange,
  onRegenerate,
  onCopy,
}) => {
  return (
    <View
      style={[
        styles.passcodeContainer,
        !isDark && {
          backgroundColor: 'rgba(0, 140, 208, 0.06)',
          borderColor: 'rgba(0, 140, 208, 0.25)',
        },
      ]}
    >
      <Text style={[styles.passcodeLabel, { color: colors.primary }]}>
        {t('schedule.passcodeFieldLabel')}
      </Text>
      <View style={styles.passcodeRow}>
        <View
          style={[
            styles.passcodeInputBox,
            !isDark && {
              backgroundColor: '#F8FAFC',
              borderColor: colors.border,
            },
          ]}
        >
          <Lock color={isDark ? '#64748b' : '#94a3b8'} size={16} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.passcodeInput, { color: colors.text }]}
            value={passcode}
            onChangeText={onPasscodeChange}
            placeholder="6-digit passcode"
            placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
            keyboardType="number-pad"
            maxLength={16}
            autoCapitalize="none"
          />
        </View>

        {/* Regenerate Button */}
        <TouchableOpacity
          style={[
            styles.passcodeActionBtn,
            !isDark && {
              backgroundColor: '#F1F5F9',
              borderColor: colors.border,
            },
          ]}
          onPress={onRegenerate}
          activeOpacity={0.7}
          accessibilityLabel="Regenerate passcode"
        >
          <RefreshCw color={colors.primary} size={16} />
        </TouchableOpacity>

        {/* Copy Button */}
        <TouchableOpacity
          style={[
            styles.passcodeActionBtn,
            !isDark && {
              backgroundColor: '#F1F5F9',
              borderColor: colors.border,
            },
            copiedPasscode && styles.passcodeActionBtnSuccess,
          ]}
          onPress={onCopy}
          activeOpacity={0.7}
          accessibilityLabel="Copy passcode"
        >
          {copiedPasscode ? (
            <Check color="#10B981" size={16} />
          ) : (
            <Copy color={colors.primary} size={16} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};
