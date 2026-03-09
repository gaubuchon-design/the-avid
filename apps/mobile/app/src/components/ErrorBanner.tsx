import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { AppTheme } from '../../_layout';
import { MIN_TOUCH_TARGET } from '../constants/layout';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  theme: AppTheme;
}

/**
 * Inline error banner with optional retry action.
 * Displayed at the top of a list or screen to indicate a recoverable error.
 */
export function ErrorBanner({ message, onRetry, theme }: ErrorBannerProps) {
  return (
    <View
      style={[
        bannerStyles.container,
        { backgroundColor: theme.colors.errorContainer },
      ]}
      accessibilityRole="alert"
    >
      <Text style={[bannerStyles.message, { color: theme.colors.error }]}>
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            bannerStyles.retryButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Retry"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[bannerStyles.retryText, { color: theme.colors.error }]}>
            Retry
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
  },
  message: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  retryButton: {
    marginLeft: 12,
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryText: {
    fontWeight: '600',
    fontSize: 13,
  },
});
