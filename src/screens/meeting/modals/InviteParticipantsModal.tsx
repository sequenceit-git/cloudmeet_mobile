import React from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Search, X, UserPlus, Check, Copy } from 'lucide-react-native';
import { styles } from '../meetingRoomStyles';

export interface InviteUserItem {
  id: string | number;
  username: string;
  name?: string;
}

export interface InviteParticipantsModalProps {
  visible: boolean;
  bottomInset?: number;
  meetingLink: string;
  copied: boolean;
  inviteSearchQuery: string;
  setInviteSearchQuery: (query: string) => void;
  isLoadingUsers: boolean;
  filteredInviteUsers: InviteUserItem[];
  invitedUsernames: Set<string>;
  onSendInvite: (username: string, name?: string) => void;
  onShareInviteLink: () => void;
  onClose: () => void;
  getAvatarTextStyle: (name: string, size: number) => any;
  getInitials: (name: string) => string;
}

export const InviteParticipantsModal: React.FC<InviteParticipantsModalProps> = ({
  visible,
  bottomInset = 0,
  meetingLink,
  copied,
  inviteSearchQuery,
  setInviteSearchQuery,
  isLoadingUsers,
  filteredInviteUsers,
  invitedUsernames,
  onSendInvite,
  onShareInviteLink,
  onClose,
  getAvatarTextStyle,
  getInitials,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.inviteModalContent, { paddingBottom: bottomInset + 20 }]}>
          <View style={styles.modalDragHandle} />

          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Invite to Meeting</Text>
              <Text style={styles.modalSubtitle}>Search by username or invite registered contacts</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X color="#94a3b8" size={20} />
            </TouchableOpacity>
          </View>

          {/* Username Search Input */}
          <View style={styles.inviteSearchBox}>
            <Search color="#00A8FF" size={18} style={{ marginRight: 10 }} />
            <TextInput
              style={styles.inviteSearchInput}
              placeholder="Enter username (e.g. @imtiaz-cnits)..."
              placeholderTextColor="#64748b"
              value={inviteSearchQuery}
              onChangeText={setInviteSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {inviteSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setInviteSearchQuery('')}>
                <X color="#64748b" size={16} />
              </TouchableOpacity>
            )}
          </View>

          {/* Quick Action when typing custom username */}
          {inviteSearchQuery.trim().length > 0 && (
            <TouchableOpacity
              style={styles.quickInviteRow}
              onPress={() => onSendInvite(inviteSearchQuery)}
              activeOpacity={0.7}
            >
              <View style={styles.quickInviteIcon}>
                <UserPlus color="#00A8FF" size={16} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.quickInviteTitle}>
                  Invite "@{inviteSearchQuery.replace(/^@/, '').trim()}"
                </Text>
                <Text style={styles.quickInviteSub}>Tap to send direct meeting invite</Text>
              </View>
              <View style={styles.inviteBtnBadge}>
                <Text style={styles.inviteBtnText}>Send</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Registered Users List */}
          <Text style={styles.sectionHeaderLabel}>REGISTERED USERS</Text>
          {isLoadingUsers ? (
            <View style={styles.loadingUsersBox}>
              <ActivityIndicator color="#00A8FF" size="small" />
              <Text style={styles.loadingUsersText}>Loading users...</Text>
            </View>
          ) : filteredInviteUsers.length === 0 ? (
            <View style={styles.emptyUsersBox}>
              <Text style={styles.emptyUsersText}>
                {inviteSearchQuery.trim()
                  ? `No users found matching "${inviteSearchQuery}". Use the card above to invite directly.`
                  : 'No users available.'}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.inviteUsersList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filteredInviteUsers.map((user) => {
                const isInvited = invitedUsernames.has(user.username);
                return (
                  <View key={user.id} style={styles.inviteUserItem}>
                    <View style={styles.inviteAvatar}>
                      <Text style={[styles.inviteAvatarText, getAvatarTextStyle(user.name || user.username, 14)]}>
                        {getInitials(user.name || user.username)}
                      </Text>
                    </View>
                    <View style={styles.inviteUserInfo}>
                      <Text style={styles.inviteUserName}>{user.name}</Text>
                      <Text style={styles.inviteUserHandle}>@{user.username}</Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.inviteActionButton,
                        isInvited && styles.inviteActionButtonSuccess,
                      ]}
                      onPress={() => onSendInvite(user.username, user.name)}
                      disabled={isInvited}
                      activeOpacity={0.7}
                    >
                      {isInvited ? (
                        <>
                          <Check color="#10b981" size={14} style={{ marginRight: 4 }} />
                          <Text style={styles.inviteActionButtonTextSuccess}>Invited</Text>
                        </>
                      ) : (
                        <>
                          <UserPlus color="#00A8FF" size={14} style={{ marginRight: 4 }} />
                          <Text style={styles.inviteActionButtonText}>Invite</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Bottom Quick Share Link Section */}
          <View style={styles.inviteFooterShare}>
            <View style={styles.inviteFooterLeft}>
              <Text style={styles.inviteFooterTitle}>Meeting Link</Text>
              <Text style={styles.inviteFooterCode} numberOfLines={1}>
                {meetingLink}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.inviteShareBtn}
              onPress={onShareInviteLink}
              activeOpacity={0.7}
            >
              <Copy color="#FFF" size={16} />
              <Text style={styles.inviteShareBtnText}>{copied ? 'Copied' : 'Copy'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default InviteParticipantsModal;
