import { useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import {
  Calendar,
  CalendarPlus,
  ChevronRight,
  Home,
  LayoutGrid,
  LogIn,
  MessageSquare,
  Plus,
  Search,
  User,
  Users,
  Video,
  X,
} from 'lucide-react-native';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Alert,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  Easing,
  BackHandler,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { RootStackNavigationProp } from '../navigation/types';
import { useMeeting } from '../hooks/useMeeting';
import { useMeetingContext } from '../context/MeetingContext';
import { useUser } from '../context/UserContext';
import { getMeetingInviteLink, getScheduledMeetings, ScheduledMeeting, deleteMeeting, getUsers, User as ApiUser } from '../services/api';
import { useTranslation } from '../hooks/useTranslation';
import storage, { StorageKeys, getPersonalMeetingCode } from '../services/storage';
import { useTheme } from '../context/ThemeContext';
import { ENV } from '../config/env';
import { getInitials, getAvatarTextStyle } from '../utils/helpers';
import { styles } from './home/homeScreenStyles';
import { ScheduledMeetingCard } from './home/ScheduledMeetingCard';
import { PersonalRoomCard } from './home/PersonalRoomCard';
import { QuickActionGrid } from './home/QuickActionGrid';
import { CreateMeetingModal } from './home/CreateMeetingModal';

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<RootStackNavigationProp<'Home'>>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { isDark, colors } = useTheme();
  const { startNewMeeting } = useMeeting();
  const { startMeeting } = useMeetingContext();
  const { user } = useUser();

  const [isVerifiedHost, setIsVerifiedHost] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [meetings, setMeetings] = useState<ScheduledMeeting[]>([]);
  const [personalRoomCode, setPersonalRoomCode] = useState<string>('824-109');
  const [isStartingPersonalRoom, setIsStartingPersonalRoom] = useState(false);

  useEffect(() => {
    const activeProfile = user || currentUser;
    if (activeProfile) {
      getPersonalMeetingCode(activeProfile).then(code => {
        if (code) {
          setPersonalRoomCode(code);
        }
      });
    }
  }, [user, currentUser]);

  const personalRoomDisplayUrl = `cloudnewsmeet.com/room/${personalRoomCode}`;
  const personalRoomFullUrl = getMeetingInviteLink(personalRoomCode);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [matchingContacts, setMatchingContacts] = useState<ApiUser[]>([]);
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);
  const contactSearchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Create Meeting Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [createdRoomData, setCreatedRoomData] = useState<any>(null);

  // Speed Dial State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const rotation = useRef(new Animated.Value(0)).current;
  const menuAnim = useRef(new Animated.Value(0)).current;

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);

    if (contactSearchTimerRef.current) {
      clearTimeout(contactSearchTimerRef.current);
    }

    const trimmed = text.trim();
    if (trimmed.length >= 2) {
      setIsSearchingContacts(true);
      contactSearchTimerRef.current = setTimeout(async () => {
        try {
          const res = await getUsers(trimmed);
          if (res?.success && Array.isArray(res.data)) {
            setMatchingContacts(res.data.filter((u: ApiUser) => u.id !== currentUser?.id));
          } else {
            setMatchingContacts([]);
          }
        } catch {
          setMatchingContacts([]);
        } finally {
          setIsSearchingContacts(false);
        }
      }, 350);
    } else {
      setMatchingContacts([]);
      setIsSearchingContacts(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setMatchingContacts([]);
    setIsSearchingContacts(false);
    if (contactSearchTimerRef.current) {
      clearTimeout(contactSearchTimerRef.current);
    }
  };

  const cleanQuery = searchQuery.trim().toLowerCase().replace(/[-\s]/g, '');
  const filteredMeetings = useMemo(() => {
    if (!searchQuery.trim()) return meetings;
    const q = searchQuery.trim().toLowerCase();
    return meetings.filter(m => {
      const matchTitle = m.title.toLowerCase().includes(q);
      const matchCode =
        m.meeting_code.toLowerCase().includes(q) ||
        m.meeting_code.replace(/[-\s]/g, '').toLowerCase().includes(cleanQuery);
      const matchPass = Boolean(m.passcode && m.passcode.toLowerCase().includes(q));
      return matchTitle || matchCode || matchPass;
    });
  }, [meetings, searchQuery, cleanQuery]);

  const isLikelyMeetingCode = useMemo(() => {
    const raw = searchQuery.trim();
    const clean = raw.replace(/[-\s]/g, '');
    return (
      clean.length >= 5 &&
      (/^\d+$/.test(clean) ||
        raw.toLowerCase().startsWith('cloudnews-') ||
        raw.includes('/join/'))
    );
  }, [searchQuery]);

  const quickJoinTargetCode = useMemo(() => {
    if (!isLikelyMeetingCode) return null;
    let raw = searchQuery.trim();
    if (raw.includes('/')) {
      raw = raw.split('/').filter(Boolean).pop() || '';
    }
    return raw.split('?')[0].trim();
  }, [isLikelyMeetingCode, searchQuery]);

  const fetchMeetings = async (overrideUser?: any) => {
    try {
      const response = await getScheduledMeetings();
      if (response && response.success) {
        const activeUser = overrideUser || user || currentUser;
        const activeUserId = activeUser?.id;
        // Strictly filter to ensure only meetings created by this host are displayed
        const myHostMeetings = (response.data || []).filter((m: ScheduledMeeting) => {
          if (m.is_host === false) return false;
          if (activeUserId && (m as any).host?.id && (m as any).host?.id !== activeUserId) return false;
          if (activeUserId && (m as any).host_id && (m as any).host_id !== activeUserId) return false;
          return true;
        });
        setMeetings(myHostMeetings);
      }
    } catch (err) {
      console.log('API info: Scheduled meetings endpoint not found or server offline');
      setMeetings([]); // Set empty list on error instead of crashing
    }
  };

  useEffect(() => {
    const checkAuthAndLoad = async () => {
      const token = await storage.getItem(StorageKeys.AUTH_TOKEN);
      const isGuest = await storage.getItem(StorageKeys.IS_GUEST);

      if (!token || isGuest === 'true') {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Onboarding' }],
        });
        return;
      }

      let parsedUser: any = null;
      const userData = await storage.getItem(StorageKeys.USER_DATA);
      if (userData) {
        try {
          parsedUser = JSON.parse(userData);
          setCurrentUser(parsedUser);
        } catch (e) {}
      }

      setIsVerifiedHost(true);
      fetchMeetings(parsedUser);
    };

    checkAuthAndLoad();
  }, [navigation]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMeetings();
    setRefreshing(false);
  };

  const isMenuOpenRef = useRef(false);

  const openMenu = useCallback(() => {
    isMenuOpenRef.current = true;
    setIsMenuOpen(true);

    Animated.parallel([
      Animated.timing(rotation, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(menuAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [rotation, menuAnim]);

  const closeMenu = useCallback((instant = false) => {
    isMenuOpenRef.current = false;

    if (instant) {
      rotation.setValue(0);
      menuAnim.setValue(0);
      setIsMenuOpen(false);
      return;
    }

    Animated.parallel([
      Animated.timing(rotation, {
        toValue: 0,
        duration: 200,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(menuAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsMenuOpen(false);
      }
    });
  }, [rotation, menuAnim]);

  const toggleMenu = useCallback(() => {
    if (isMenuOpenRef.current) {
      closeMenu(false);
    } else {
      openMenu();
    }
  }, [openMenu, closeMenu]);

  // Clean up when screen loses focus (navigation to another screen)
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      closeMenu(true);
    });
    return unsubscribe;
  }, [navigation, closeMenu]);

  // Handle hardware back press on Android to smoothly close menu
  useEffect(() => {
    if (!isMenuOpen) return;
    const onBackPress = () => {
      closeMenu(false);
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isMenuOpen, closeMenu]);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
    extrapolate: 'clamp',
  });

  const menuTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
    extrapolate: 'clamp',
  });

  const handleStartMeetingClick = () => {
    setMeetingTitle('Cloud News Meet');
    setShowCreateModal(true);
  };

  const handleCreateMeeting = async () => {
    setLoading(true);
    try {
      const data = await startNewMeeting(meetingTitle || 'Quick Meet');
      setCreatedRoomData(data);
      const code = data.meeting?.meeting_code || data.meeting_code;
      setGeneratedLink(getMeetingInviteLink(code));
      fetchMeetings(); // Refresh list after creation
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartPersonalRoom = async () => {
    if (isStartingPersonalRoom) return;
    setIsStartingPersonalRoom(true);
    try {
      const activeUser = user || currentUser;
      const hostName = activeUser?.name || 'Personal';
      const roomTitle = `${hostName}'s Meeting Room`;

      const data = await startNewMeeting(roomTitle, {
        meetingCode: personalRoomCode,
      });

      const meetingData = data.meeting || data;
      const roomName = meetingData.room_name || data.room_name || '';
      const token = data.livekit_token || data.token || '';
      const serverUrl = data.livekit_url || ENV.LIVEKIT_WS_URL;
      const code = meetingData.meeting_code || personalRoomCode;

      if (!roomName || !token) {
        throw new Error('Unable to generate room credentials');
      }

      const hostSessionToken = data.host_session_token || meetingData.host_session_token;
      if (hostSessionToken && code) {
        const cleanCode = code.replace(/[\s-]/g, '');
        storage.setItem(`host_session_${cleanCode}`, hostSessionToken);
      }

      startMeeting({
        roomName,
        token,
        serverUrl,
        displayName: activeUser?.name || 'Host',
        meetingCode: code,
        meetingTitle: meetingData.title || roomTitle,
        isHost: true,
        hostSessionToken,
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || 'Failed to start personal room');
    } finally {
      setIsStartingPersonalRoom(false);
    }
  };

  const handleJoinCreatedMeeting = () => {
    if (createdRoomData) {
      setShowCreateModal(false);
      const hostSessionToken = createdRoomData.host_session_token || createdRoomData.meeting?.host_session_token;
      const code = createdRoomData.meeting.meeting_code;
      if (hostSessionToken && code) {
        const cleanCode = code.replace(/[\s-]/g, '');
        storage.setItem(`host_session_${cleanCode}`, hostSessionToken);
      }

      startMeeting({
        roomName: createdRoomData.meeting.room_name,
        token: createdRoomData.token,
        serverUrl: createdRoomData.livekit_url,
        displayName: user?.name || currentUser?.name || 'IA',
        meetingCode: code,
        meetingTitle: createdRoomData.meeting.title || createdRoomData.meeting.meeting_code,
        isHost: true,
        hostSessionToken,
      });
    }
  };

  const handleJoinScheduled = (meeting: ScheduledMeeting) => {
    navigation.navigate('Join', { meetingCode: meeting.meeting_code });
  };

  const handleDeleteMeeting = (meeting: ScheduledMeeting) => {
    Alert.alert(
      t('home.deleteConfirmTitle'),
      `${t('home.deleteConfirmMsg')} "${meeting.title}"?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await deleteMeeting(meeting.meeting_code);
              if (res.success) {
                fetchMeetings();
              }
            } catch (err) {
              Alert.alert(t('common.error'), 'Failed to delete meeting');
            }
          }
        }
      ]
    );
  };

  const getMeetingStatus = (meeting: ScheduledMeeting) => {
    if (meeting.status === 'expired') return { label: t('home.expired'), color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)' };

    const now = new Date();
    const scheduledTime = meeting.scheduled_at ? new Date(meeting.scheduled_at) : now;
    const diff = (now.getTime() - scheduledTime.getTime()) / (1000 * 60); // minutes

    if (diff >= -30 && diff <= 1440) return { label: t('home.ongoing'), color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };

    return { label: t('home.upcoming'), color: '#00A8FF', bg: 'rgba(0, 168, 255, 0.1)' };
  };

  if (!isVerifiedHost) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      {/* Speed Dial Overlay */}
      {isMenuOpen && (
        <Pressable style={styles.overlay} onPress={() => closeMenu(false)} />
      )}

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.profileBtn} onPress={() => navigation.navigate('Profile')}>
          <View style={[styles.avatar, !isDark && { borderColor: colors.border, borderWidth: 1 }]}>
            {user?.avatar || user?.avatar_url ? (
              <Image
                source={{ uri: user.avatar || user.avatar_url }}
                style={styles.avatarImg}
              />
            ) : (
              <Text style={[styles.avatarText, getAvatarTextStyle(user?.name || currentUser?.name, 16)]}>
                {getInitials(user?.name || currentUser?.name, 'CN')}
              </Text>
            )}
          </View>
          <View style={[styles.onlineStatus, !isDark && { borderColor: colors.background }]} />
        </TouchableOpacity>

        <View
          style={[
            styles.searchBar,
            !isDark && {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Search color={isDark ? '#94a3b8' : colors.textSecondary} size={16} />
          <TextInput
            placeholder={t('home.searchPlaceholder')}
            placeholderTextColor={isDark ? '#94a3b8' : colors.textMuted}
            style={[styles.searchInput, !isDark && { color: colors.textPrimary }]}
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={handleClearSearch}
              style={styles.searchClearBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X color={isDark ? '#94a3b8' : colors.textSecondary} size={16} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00A8FF" />
        }
      >
        {searchQuery.trim().length > 0 ? (
          <View style={styles.searchResultsContainer}>
            {/* Search Header */}
            <View style={styles.searchResultsHeader}>
              <Text style={[styles.searchResultsTitle, !isDark && { color: colors.textPrimary }]}>
                {t('home.searchResults')} ({filteredMeetings.length + matchingContacts.length + (quickJoinTargetCode ? 1 : 0)})
              </Text>
              <TouchableOpacity onPress={handleClearSearch} style={styles.clearSearchBtn} activeOpacity={0.7}>
                <Text style={[styles.clearSearchText, !isDark && { color: colors.primary }]}>{t('home.clearSearch')}</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Join Card (If query looks like a meeting code/link) */}
            {quickJoinTargetCode && (
              <TouchableOpacity
                style={styles.searchQuickJoinCard}
                onPress={() => navigation.navigate('Join', { meetingCode: quickJoinTargetCode })}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={isDark ? ['rgba(0, 168, 255, 0.25)', 'rgba(0, 102, 204, 0.15)'] : ['rgba(0, 140, 208, 0.2)', 'rgba(0, 102, 204, 0.1)']}
                  style={styles.searchQuickJoinGradient}
                >
                  <View style={styles.searchQuickJoinIcon}>
                    <Video color="#FFF" size={20} />
                  </View>
                  <View style={styles.searchQuickJoinTexts}>
                    <Text style={styles.searchQuickJoinBadge}>{t('home.quickJoinAction')}</Text>
                    <Text style={styles.searchQuickJoinCode}>{quickJoinTargetCode}</Text>
                    <Text style={[styles.searchQuickJoinSub, !isDark && { color: colors.textSecondary }]}>{t('join.enterMeeting')}</Text>
                  </View>
                  <View style={styles.quickJoinGoBtn}>
                    <Text style={styles.quickJoinGoText}>{t('home.go')}</Text>
                    <ChevronRight color="#FFF" size={14} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* Matching Meetings */}
            {filteredMeetings.length > 0 && (
              <View style={styles.searchSection}>
                <View style={styles.searchSectionHeader}>
                  <Calendar color={colors.primary} size={16} />
                  <Text style={[styles.searchSectionTitle, !isDark && { color: colors.textSecondary }]}>
                    {t('home.searchMatchingMeetings')} ({filteredMeetings.length})
                  </Text>
                </View>

                {filteredMeetings.map((meeting) => (
                  <ScheduledMeetingCard
                    key={meeting.id}
                    meeting={meeting}
                    status={getMeetingStatus(meeting)}
                    isDark={isDark}
                    colors={colors}
                    t={t}
                    onDelete={handleDeleteMeeting}
                    onJoin={handleJoinScheduled}
                  />
                ))}
              </View>
            )}

            {/* Matching Contacts */}
            {(matchingContacts.length > 0 || isSearchingContacts) && (
              <View style={styles.searchSection}>
                <View style={styles.searchSectionHeader}>
                  <Users color={colors.primary} size={16} />
                  <Text style={[styles.searchSectionTitle, !isDark && { color: colors.textSecondary }]}>
                    {t('home.searchMatchingContacts')} ({matchingContacts.length})
                  </Text>
                  {isSearchingContacts && (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
                  )}
                </View>

                {matchingContacts.map(contact => (
                  <TouchableOpacity
                    key={contact.id}
                    style={[styles.contactItem, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => navigation.navigate('ChatDetail', { userId: contact.id, name: contact.name })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.contactAvatar}>
                      <Text style={[styles.contactAvatarText, getAvatarTextStyle(contact.name, 14)]}>
                        {getInitials(contact.name, 'CN')}
                      </Text>
                    </View>
                    <View style={styles.contactInfo}>
                      <Text style={[styles.contactName, !isDark && { color: colors.textPrimary }]}>{contact.name}</Text>
                      <Text style={[styles.contactEmail, !isDark && { color: colors.textSecondary }]}>{contact.email || `@${contact.username}`}</Text>
                    </View>
                    <View style={[styles.contactMsgBtn, !isDark && { backgroundColor: colors.iconBoxBg, borderColor: 'rgba(0, 140, 208, 0.2)' }]}>
                      <MessageSquare color={colors.primary} size={16} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* No Results Fallback */}
            {filteredMeetings.length === 0 && matchingContacts.length === 0 && !quickJoinTargetCode && !isSearchingContacts && (
              <View style={styles.searchEmptyCard}>
                <View style={[styles.searchEmptyIconBox, !isDark && { backgroundColor: colors.cardSubtle, borderColor: colors.border }]}>
                  <Search color={isDark ? '#64748b' : colors.textMuted} size={28} />
                </View>
                <Text style={[styles.searchEmptyTitle, !isDark && { color: colors.textPrimary }]}>{t('home.noSearchResults')}</Text>
                <Text style={[styles.searchEmptySub, !isDark && { color: colors.primary }]}>
                  "{searchQuery}"
                </Text>
                <Text style={[styles.searchEmptyHint, !isDark && { color: colors.textSecondary }]}>{t('home.noSearchResultsHint')}</Text>
                <TouchableOpacity style={[styles.searchEmptyClearBtn, !isDark && { backgroundColor: colors.cardSubtle, borderColor: colors.border }]} onPress={handleClearSearch} activeOpacity={0.7}>
                  <Text style={[styles.searchEmptyClearBtnText, !isDark && { color: colors.textPrimary }]}>{t('home.clearSearch')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <>
        <QuickActionGrid
          isDark={isDark}
          colors={colors}
          t={t}
          onStartMeeting={handleStartMeetingClick}
          onJoinMeeting={() => navigation.navigate('Join')}
          onSchedule={() => navigation.navigate('Schedule')}
        />

        {/* Personal Room Link Card */}
        <PersonalRoomCard
          personalRoomDisplayUrl={personalRoomDisplayUrl}
          personalRoomFullUrl={personalRoomFullUrl}
          copied={copied}
          isStartingPersonalRoom={isStartingPersonalRoom}
          onCopy={copyToClipboard}
          onStart={handleStartPersonalRoom}
          isDark={isDark}
          colors={colors}
          t={t}
        />

        {/* Today's Schedule */}
        <View style={styles.scheduleSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, !isDark && { color: colors.textSecondary }]}>{t('home.todaysSchedule')}</Text>
            <Text style={[styles.viewAll, !isDark && { color: colors.primary }]} onPress={() => navigation.navigate('Schedule')}>{t('home.viewAll')} ({meetings.length})</Text>
          </View>

          {meetings.length === 0 ? (
            <View style={styles.emptySchedule}>
                <Text style={[styles.emptyScheduleText, !isDark && { color: colors.textMuted }]}>{t('home.noMeetings')}</Text>
            </View>
          ) : (
            meetings.map((meeting) => (
              <ScheduledMeetingCard
                key={meeting.id}
                meeting={meeting}
                status={getMeetingStatus(meeting)}
                isDark={isDark}
                colors={colors}
                t={t}
                onDelete={handleDeleteMeeting}
                onJoin={handleJoinScheduled}
              />
            ))
          )}
        </View>
        </>
      )}
      </ScrollView>

      {/* Create Meeting Modal */}
      <CreateMeetingModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        meetingTitle={meetingTitle}
        setMeetingTitle={setMeetingTitle}
        loading={loading}
        generatedLink={generatedLink}
        copied={copied}
        onCreateMeeting={handleCreateMeeting}
        onJoinCreatedMeeting={handleJoinCreatedMeeting}
        onCopyLink={copyToClipboard}
        isDark={isDark}
        colors={colors}
        insets={insets}
        t={t}
      />

      {/* Speed Dial Menu Items */}
      {isMenuOpen && (
        <Animated.View style={[styles.menuContainer, { bottom: insets.bottom + 165, opacity: menuAnim, transform: [{ translateY: menuTranslateY }] }]}>
          <TouchableOpacity style={styles.menuItem} onPress={() => { closeMenu(true); navigation.navigate('Profile'); }}>
            <View style={[styles.menuLabelWrapper, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}>
               <Text style={[styles.menuText, !isDark && { color: colors.textPrimary }]}>{t('home.personalRoomLink')}</Text>
            </View>
            <View style={[styles.menuIconBox, !isDark && { backgroundColor: colors.cardSubtle }]}><Home color={isDark ? '#050B14' : colors.textPrimary} size={22} strokeWidth={2.2} /></View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => { closeMenu(true); navigation.navigate('Schedule'); }}>
            <View style={[styles.menuLabelWrapper, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}>
               <Text style={[styles.menuText, !isDark && { color: colors.textPrimary }]}>{t('home.schedule')}</Text>
            </View>
            <View style={[styles.menuIconBox, !isDark && { backgroundColor: colors.cardSubtle }]}><CalendarPlus color={isDark ? '#050B14' : colors.textPrimary} size={22} strokeWidth={2.2} /></View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => { closeMenu(true); navigation.navigate('Join'); }}>
            <View style={[styles.menuLabelWrapper, !isDark && { backgroundColor: colors.card, borderColor: colors.border }]}>
               <Text style={[styles.menuText, !isDark && { color: colors.textPrimary }]}>{t('home.joinMeeting')}</Text>
            </View>
            <View style={[styles.menuIconBox, !isDark && { backgroundColor: colors.cardSubtle }]}><LogIn color={isDark ? '#050B14' : colors.textPrimary} size={22} strokeWidth={2.2} /></View>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[
          styles.fab,
          { bottom: insets.bottom + 100 },
          !isDark && { backgroundColor: colors.primary, shadowColor: colors.primary },
        ]}
        onPress={toggleMenu}
        activeOpacity={0.9}
      >
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <Plus color={isDark ? '#050B14' : '#FFFFFF'} size={28} strokeWidth={2.5} />
        </Animated.View>
      </TouchableOpacity>

      {/* Navigation Dock */}
      <View
        style={[
          styles.navDock,
          { marginBottom: insets.bottom + 10 },
          !isDark && {
            backgroundColor: 'rgba(255, 255, 255, 0.96)',
            borderColor: colors.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 8,
          },
        ]}
      >
        <TouchableOpacity style={styles.navItem}><LayoutGrid color={colors.primary} size={22} /><Text style={[styles.navTextActive, !isDark && { color: colors.primary }]}>{t('nav.home')}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Messages')}><MessageSquare color={isDark ? '#94a3b8' : colors.textSecondary} size={22} /><Text style={[styles.navText, !isDark && { color: colors.textSecondary }]}>{t('nav.messages')}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Schedule')}><Calendar color={isDark ? '#94a3b8' : colors.textSecondary} size={22} /><Text style={[styles.navText, !isDark && { color: colors.textSecondary }]}>{t('nav.schedule')}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Profile')}><User color={isDark ? '#94a3b8' : colors.textSecondary} size={22} /><Text style={[styles.navText, !isDark && { color: colors.textSecondary }]}>{t('nav.profile')}</Text></TouchableOpacity>
      </View>
    </View>
  );
};

export default HomeScreen;

