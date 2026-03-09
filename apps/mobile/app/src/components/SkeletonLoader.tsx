import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { useAppTheme } from '../../_layout';

interface SkeletonLoaderProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * Animated skeleton placeholder that pulses between two opacity values.
 * Used as a loading placeholder for cards, text lines, and thumbnails.
 */
export function SkeletonLoader({ width, height, borderRadius = 8, style }: SkeletonLoaderProps) {
  const theme = useAppTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: theme.colors.border,
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * A skeleton placeholder shaped like a project card.
 */
export function ProjectCardSkeleton() {
  const theme = useAppTheme();

  return (
    <View
      style={[
        skeletonStyles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <SkeletonLoader width="100%" height={80} borderRadius={0} />
      <View style={skeletonStyles.content}>
        <View style={skeletonStyles.titleRow}>
          <SkeletonLoader width="60%" height={16} borderRadius={4} />
          <SkeletonLoader width={40} height={20} borderRadius={10} />
        </View>
        <SkeletonLoader width="80%" height={12} borderRadius={4} />
        <View style={skeletonStyles.tagRow}>
          <SkeletonLoader width={48} height={18} borderRadius={9} />
          <SkeletonLoader width={56} height={18} borderRadius={9} />
        </View>
        <SkeletonLoader width="50%" height={12} borderRadius={4} />
      </View>
    </View>
  );
}

/**
 * Full-screen skeleton loading state for the projects list.
 */
export function ProjectListSkeleton() {
  return (
    <View style={skeletonStyles.list}>
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  content: {
    padding: 14,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagRow: {
    flexDirection: 'row',
    gap: 6,
  },
  list: {
    padding: 16,
  },
});
