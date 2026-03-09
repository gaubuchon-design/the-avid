import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import type { AppTheme } from '../../_layout';
import { MIN_TOUCH_TARGET } from '../constants/layout';

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  theme: AppTheme;
}

/**
 * Reusable empty state component with an icon circle, title, subtitle,
 * and an optional call-to-action button.
 */
export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  theme,
}: EmptyStateProps) {
  return (
    <View style={emptyStyles.container} accessibilityRole="text">
      <View
        style={[
          emptyStyles.iconCircle,
          { backgroundColor: theme.colors.primaryContainer },
        ]}
      >
        <Text
          style={[emptyStyles.iconText, { color: theme.colors.primary }]}
          accessibilityElementsHidden
        >
          {icon}
        </Text>
      </View>
      <Text style={[emptyStyles.title, { color: theme.colors.text }]}>
        {title}
      </Text>
      <Text style={[emptyStyles.subtitle, { color: theme.colors.textSecondary }]}>
        {subtitle}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [
            emptyStyles.button,
            {
              backgroundColor: theme.colors.primary,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={emptyStyles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconText: {
    fontSize: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 16,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
