import React from 'react';
import { Tabs } from 'expo-router';
import { Platform, Text, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme, useReduceMotion } from '../_layout';
import type { AppTheme } from '../_layout';

// ---------------------------------------------------------------------------
// Tab bar icon component using text symbols (avoids icon library dependency)
// ---------------------------------------------------------------------------

const TAB_ICONS: Record<string, { label: string; symbol: string }> = {
  index: { label: 'Projects', symbol: '\u{1F3AC}' },      // clapper board
  media: { label: 'Media', symbol: '\u{1F4F7}' },          // camera
  settings: { label: 'Settings', symbol: '\u{2699}\u{FE0F}' }, // gear
};

interface TabIconProps {
  routeName: string;
  focused: boolean;
  theme: AppTheme;
}

function TabIcon({ routeName, focused, theme }: TabIconProps) {
  const entry = TAB_ICONS[routeName];
  const symbol = entry?.symbol ?? '?';

  return (
    <View style={tabIconStyles.container}>
      <Text
        style={[
          tabIconStyles.icon,
          { opacity: focused ? 1 : 0.6 },
        ]}
      >
        {symbol}
      </Text>
      {focused ? (
        <View
          style={[tabIconStyles.dot, { backgroundColor: theme.colors.tabActive }]}
        />
      ) : null}
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 28,
  },
  icon: {
    fontSize: Platform.OS === 'android' ? 20 : 22,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
});

// ---------------------------------------------------------------------------
// Tab Layout
// ---------------------------------------------------------------------------

export default function TabLayout() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.surface,
          ...(Platform.OS === 'ios'
            ? {
                shadowColor: 'transparent',
              }
            : { elevation: 0 }),
        },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          paddingBottom: Math.max(insets.bottom, 4),
          height: 56 + Math.max(insets.bottom, 4),
          ...(Platform.OS === 'ios'
            ? {}
            : { elevation: 8 }),
        },
        tabBarActiveTintColor: theme.colors.tabActive,
        tabBarInactiveTintColor: theme.colors.tabInactive,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginTop: -2,
        },
        tabBarHideOnKeyboard: true,
        // animation controlled by React Navigation defaults
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Projects',
          ...(Platform.OS === 'ios' ? { headerLargeTitle: true } : {}),
          tabBarIcon: ({ focused }) => (
            <TabIcon routeName="index" focused={focused} theme={theme} />
          ),
          tabBarLabel: 'Projects',
        }}
      />
      <Tabs.Screen
        name="media"
        options={{
          title: 'Media',
          tabBarIcon: ({ focused }) => (
            <TabIcon routeName="media" focused={focused} theme={theme} />
          ),
          tabBarLabel: 'Media',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => (
            <TabIcon routeName="settings" focused={focused} theme={theme} />
          ),
          tabBarLabel: 'Settings',
        }}
      />
    </Tabs>
  );
}
