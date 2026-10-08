import { DarkTheme, DefaultTheme, NavigationContainer, LinkingOptions, getStateFromPath } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useMemo, useEffect } from 'react';
import { Linking } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import HomeScreen from '../screens/HomeScreen';
import JoinScreen from '../screens/JoinScreen';
import MeetingRoomScreen from '../screens/meeting/MeetingRoomScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import MessagesScreen from '../screens/MessagesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ChatDetailScreen from '../screens/ChatDetailScreen';
import { RootStackParamList } from './types';
import { ENV } from '../config/env';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const extractMeetingCodeFromUrl = (rawUrl: string): string | null => {
  try {
    if (!rawUrl) return null;
    const decoded = decodeURIComponent(rawUrl);

    // Query parameters
    if (decoded.includes('?')) {
      const queryPart = decoded.split('?')[1] || '';
      const pairs = queryPart.split('&');
      for (const pair of pairs) {
        const [k, v] = pair.split('=');
        if (k && v && ['code', 'meetingcode', 'id', 'room'].includes(k.toLowerCase())) {
          const clean = v.trim();
          const digits = clean.replace(/\D/g, '');
          return digits.length === 6 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}` : clean;
        }
      }
    }

    // Path segments: e.g. cloudnews://room/801-285 or https://cloudnewsmeet.com/room/801-285
    const pathWithoutQuery = decoded.split('?')[0];
    const segments = pathWithoutQuery.split('/').filter(Boolean);
    if (segments.length >= 2) {
      const last = segments[segments.length - 1].trim();
      const prev = segments[segments.length - 2].toLowerCase();
      if (['room', 'join', 'meet', 'meeting'].includes(prev)) {
        const digits = last.replace(/\D/g, '');
        return digits.length === 6 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}` : last;
      }
    }
    if (segments.length === 1) {
      const only = segments[0].trim();
      const digits = only.replace(/\D/g, '');
      if (digits.length >= 5 || only.toLowerCase().startsWith('cloudnews-')) {
        return digits.length === 6 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}` : only;
      }
    }
  } catch (e) {
    console.warn('[DeepLinking] Error extracting code:', e);
  }
  return null;
};

import { navigationRef } from './navigationRef';
import storage, { StorageKeys } from '../services/storage';

interface AppNavigatorProps {
  initialRouteName?: keyof RootStackParamList;
}

export const AppNavigator: React.FC<AppNavigatorProps> = ({ initialRouteName = 'Onboarding' }) => {
  const { isDark, colors } = useTheme();

  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      console.log('[DeepLinking] Incoming URL event:', url);
      const code = extractMeetingCodeFromUrl(url);
      if (code && navigationRef.isReady()) {
        const token = await storage.getItem(StorageKeys.AUTH_TOKEN);
        const isGuest = (await storage.getItem(StorageKeys.IS_GUEST)) === 'true';
        const isHost = Boolean(token && !isGuest);
        navigationRef.navigate('Join', { meetingCode: code, isGuest: !isHost });
      }
    };

    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const sub = Linking.addEventListener('url', event => handleUrl(event.url));
    return () => {
      sub.remove();
    };
  }, []);

  const navTheme = useMemo(() => {
    if (isDark) {
      return {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: colors.background,
          card: colors.card,
          text: colors.textPrimary,
          border: colors.border,
          primary: colors.primary,
        },
      };
    }
    return {
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        background: colors.background,
        card: colors.card,
        text: colors.textPrimary,
        border: colors.border,
        primary: colors.primary,
      },
    };
  }, [isDark, colors]);

  const linkingConfig = useMemo<LinkingOptions<RootStackParamList>>(() => ({
    prefixes: [
      'cloudnews://',
      'https://cloudnewsmeet.com',
      'http://cloudnewsmeet.com',
      'https://www.cloudnewsmeet.com',
      'http://www.cloudnewsmeet.com',
      ENV.DEEP_LINK_SCHEME,
      ENV.INVITE_WEB_URL,
    ],
    config: {
      initialRouteName: initialRouteName,
      screens: {
        Home: 'home',
        Onboarding: 'onboarding',
        Join: 'room/:meetingCode',
        MeetingRoom: 'meeting/:roomName',
      },
    },
    getStateFromPath(path, options) {
      try {
        const cleanPath = decodeURIComponent(path).replace(/^\/+|\/+$/g, '');
        const [pathname] = cleanPath.split('?');
        const segments = pathname.split('/').filter(Boolean);

        if (segments.length === 0) {
          return { routes: [{ name: initialRouteName }] };
        }
        if (segments[0] === 'home') {
          return { routes: [{ name: 'Home' }] };
        }
        if (segments[0] === 'onboarding') {
          return { routes: [{ name: 'Onboarding' }] };
        }

        // Check for room/CODE, join/CODE, meet/CODE, meeting/CODE
        let candidateCode = '';
        if (segments.length >= 2 && ['room', 'join', 'meet', 'meeting'].includes(segments[0].toLowerCase())) {
          candidateCode = segments[1];
        } else if (
          segments.length === 1 &&
          !['schedule', 'messages', 'profile', 'chatdetail'].includes(segments[0].toLowerCase())
        ) {
          candidateCode = segments[0];
        }

        // Check query parameters if candidateCode is still empty
        if (!candidateCode && cleanPath.includes('?')) {
          const queryPart = cleanPath.split('?')[1] || '';
          const pairs = queryPart.split('&');
          for (const pair of pairs) {
            const [key, val] = pair.split('=');
            if (key && val && ['code', 'meetingcode', 'id', 'room'].includes(key.toLowerCase())) {
              candidateCode = decodeURIComponent(val);
              break;
            }
          }
        }

        let normalizedCode = candidateCode.trim();
        const cleanDigits = normalizedCode.replace(/\D/g, '');
        if (cleanDigits.length === 6 && !normalizedCode.includes('-')) {
          normalizedCode = `${cleanDigits.slice(0, 3)}-${cleanDigits.slice(3, 6)}`;
        }

        if (normalizedCode && (cleanDigits.length >= 5 || normalizedCode.toLowerCase().startsWith('cloudnews-'))) {
          return {
            routes: [
              {
                name: 'Join',
                params: {
                  meetingCode: normalizedCode,
                },
              },
            ],
          };
        }
      } catch (e) {
        console.warn('[Linking] Error parsing deep link path:', e);
      }

      return getStateFromPath(path, options);
    },
  }), [initialRouteName]);

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} linking={linkingConfig}>
      <Stack.Navigator
        key={initialRouteName}
        initialRouteName={initialRouteName}
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {initialRouteName === 'Home' ? (
          <>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ animation: 'fade' }}
            />
            <Stack.Screen
              name="Onboarding"
              component={OnboardingScreen}
              options={{ animation: 'fade' }}
            />
          </>
        ) : (
          <>
            <Stack.Screen
              name="Onboarding"
              component={OnboardingScreen}
              options={{ animation: 'fade' }}
            />
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ animation: 'fade' }}
            />
          </>
        )}
        <Stack.Screen
          name="Join"
          component={JoinScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="Schedule"
          component={ScheduleScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="Messages"
          component={MessagesScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ animation: 'slide_from_left' }}
        />
        <Stack.Screen
          name="ChatDetail"
          component={ChatDetailScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="MeetingRoom"
          component={MeetingRoomScreen}
          options={{
            animation: 'fade_from_bottom',
            gestureEnabled: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
