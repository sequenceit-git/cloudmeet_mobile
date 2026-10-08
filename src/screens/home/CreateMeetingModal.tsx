import React from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { X, Link as LinkIcon, Check, Copy, Video } from 'lucide-react-native';
import { styles } from './homeScreenStyles';

interface CreateMeetingModalProps {
  visible: boolean;
  onClose: () => void;
  meetingTitle: string;
  setMeetingTitle: (title: string) => void;
  loading: boolean;
  generatedLink: string;
  copied: boolean;
  onCreateMeeting: () => void;
  onJoinCreatedMeeting: () => void;
  onCopyLink: (link: string) => void;
  isDark: boolean;
  colors: any;
  insets: EdgeInsets;
  t: (key: string) => string;
}

export const CreateMeetingModal: React.FC<CreateMeetingModalProps> = ({
  visible,
  onClose,
  meetingTitle,
  setMeetingTitle,
  loading,
  generatedLink,
  copied,
  onCreateMeeting,
  onJoinCreatedMeeting,
  onCopyLink,
  isDark,
  colors,
  insets,
  t,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.modalOverlay, !isDark && { backgroundColor: colors.modalOverlay }]}>
        <View
          style={[
            styles.modalContent,
            { paddingBottom: insets.bottom + 20 },
            !isDark && {
              backgroundColor: colors.modalBg,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={[styles.modalDragHandle, !isDark && { backgroundColor: colors.border }]} />
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, !isDark && { color: colors.textPrimary }]}>
              {t('home.createMeetingTitle')}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <X color={isDark ? '#94a3b8' : colors.textSecondary} size={24} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            <Text style={[styles.modalLabel, !isDark && { color: colors.textSecondary }]}>
              {t('home.meetingTitlePlaceholder')}
            </Text>
            <View style={[styles.modalInputWrapper, !isDark && { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <TextInput
                style={[styles.modalInput, !isDark && { color: colors.textPrimary }]}
                value={meetingTitle}
                onChangeText={setMeetingTitle}
                placeholder={t('home.meetingTitlePlaceholder')}
                placeholderTextColor={isDark ? '#64748b' : colors.textMuted}
              />
            </View>

            {!generatedLink ? (
              <TouchableOpacity
                style={[
                  styles.generateBtn,
                  !isDark && {
                    backgroundColor: colors.iconBoxBg,
                    borderColor: 'rgba(0, 140, 208, 0.3)',
                  },
                ]}
                onPress={onCreateMeeting}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <LinkIcon color={colors.primary} size={18} />
                    <Text style={[styles.generateBtnText, !isDark && { color: colors.primary }]}>
                      {t('home.createAndJoin')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.linkResultBox}>
                <Text style={styles.linkResultLabel}>
                  {copied ? t('common.linkCopied') : t('home.personalRoomLink')}
                </Text>
                <View style={[styles.linkDisplay, !isDark && { backgroundColor: colors.cardSubtle, borderColor: colors.border }, copied && { borderColor: '#10b981' }]}>
                  <Text style={[styles.linkText, !isDark && { color: colors.primary }]} numberOfLines={1}>
                    {generatedLink}
                  </Text>
                  <TouchableOpacity onPress={() => onCopyLink(generatedLink)}>
                    {copied ? <Check color="#10b981" size={18} /> : <Copy color={colors.primary} size={18} />}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.modalJoinBtn} onPress={onJoinCreatedMeeting}>
                  <Video color="#FFF" size={20} />
                  <Text style={styles.modalJoinBtnText}>{t('join.enterMeeting')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default CreateMeetingModal;
