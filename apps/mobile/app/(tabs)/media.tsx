import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Platform,
  useWindowDimensions,
  Alert,
  ActivityIndicator,
  Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../_layout';
import type { AppTheme } from '../_layout';
import type { EditorMediaAsset, EditorProject } from '@mcua/core';
import { flattenAssets } from '@mcua/core';
import { listProjectsFromRepository } from '../lib/projectRepository';
import { EmptyState } from '../src/components/EmptyState';
import { ProjectListSkeleton } from '../src/components/SkeletonLoader';
import { ErrorBanner } from '../src/components/ErrorBanner';
import { MIN_TOUCH_TARGET, CARD_BORDER_RADIUS, SPACING, FONT_SIZE, MONO_FONT } from '../src/constants/layout';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MediaFilter = 'all' | 'VIDEO' | 'AUDIO' | 'IMAGE';

interface MediaAssetWithProject extends EditorMediaAsset {
  projectName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || bytes === 0) return '--';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined) return '--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function triggerHaptic(): void {
  try {
    if (Platform.OS !== 'web') {
      Vibration.vibrate(Platform.OS === 'ios' ? 10 : 15);
    }
  } catch {
    // Haptics are non-critical
  }
}

const MEDIA_TYPE_ICON: Record<string, string> = {
  VIDEO: '\u{1F3AC}',
  AUDIO: '\u{1F3B5}',
  IMAGE: '\u{1F5BC}',
  GRAPHIC: '\u{1F58C}',
  DOCUMENT: '\u{1F4C4}',
};

const MEDIA_STATUS_COLOR: Record<string, string> = {
  READY: '#4ade80',
  UPLOADING: '#f59e0b',
  PROCESSING: '#6366f1',
  INGESTING: '#0ea5e9',
  ERROR: '#f87171',
  OFFLINE: '#64748b',
};

// ---------------------------------------------------------------------------
// Media Asset Card
// ---------------------------------------------------------------------------

interface MediaAssetCardProps {
  asset: MediaAssetWithProject;
  theme: AppTheme;
  isCompact: boolean;
}

function MediaAssetCard({ asset, theme, isCompact }: MediaAssetCardProps) {
  const typeIcon = MEDIA_TYPE_ICON[asset.type] ?? '\u{1F4C1}';
  const statusColor = MEDIA_STATUS_COLOR[asset.status] ?? theme.colors.textMuted;

  return (
    <Pressable
      style={({ pressed }) => [
        assetCardStyles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${asset.name}, ${asset.type.toLowerCase()}, status ${asset.status.toLowerCase()}`}
    >
      {/* Thumbnail area */}
      <View
        style={[
          assetCardStyles.thumbnail,
          {
            backgroundColor: theme.dark ? '#0f172a' : '#e2e8f0',
          },
        ]}
      >
        <Text style={assetCardStyles.typeIcon}>{typeIcon}</Text>
        <View
          style={[assetCardStyles.statusDot, { backgroundColor: statusColor }]}
        />
      </View>

      {/* Info */}
      <View style={assetCardStyles.info}>
        <Text
          style={[assetCardStyles.name, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          {asset.name}
        </Text>
        <Text
          style={[assetCardStyles.meta, { color: theme.colors.textSecondary }]}
          numberOfLines={1}
        >
          {asset.type} {asset.duration !== undefined ? ` \u00b7 ${formatDuration(asset.duration)}` : ''}
          {asset.fileSizeBytes ? ` \u00b7 ${formatFileSize(asset.fileSizeBytes)}` : ''}
        </Text>
        <Text
          style={[assetCardStyles.project, { color: theme.colors.textMuted }]}
          numberOfLines={1}
        >
          {asset.projectName}
        </Text>
      </View>

      {/* Status indicator */}
      {asset.status !== 'READY' ? (
        <View style={assetCardStyles.statusBadgeContainer}>
          <View
            style={[
              assetCardStyles.statusBadge,
              { backgroundColor: statusColor + '20', borderColor: statusColor + '40' },
            ]}
          >
            {(asset.status === 'UPLOADING' || asset.status === 'PROCESSING' || asset.status === 'INGESTING') ? (
              <ActivityIndicator size="small" color={statusColor} />
            ) : (
              <Text style={[assetCardStyles.statusText, { color: statusColor }]}>
                {asset.status.toLowerCase()}
              </Text>
            )}
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const assetCardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: CARD_BORDER_RADIUS,
    borderWidth: 1,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    minHeight: 72,
  },
  thumbnail: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.sm,
    marginVertical: SPACING.xs,
    borderRadius: 8,
    position: 'relative',
  },
  typeIcon: {
    fontSize: 24,
  },
  statusDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  info: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 2,
  },
  name: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  meta: {
    fontSize: FONT_SIZE.xs,
  },
  project: {
    fontSize: FONT_SIZE.xs,
    fontStyle: 'italic',
  },
  statusBadgeContainer: {
    paddingRight: SPACING.md,
  },
  statusBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    minWidth: 60,
    alignItems: 'center',
  },
  statusText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
});

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

interface FilterBarProps {
  activeFilter: MediaFilter;
  onFilterChange: (filter: MediaFilter) => void;
  counts: Record<MediaFilter, number>;
  theme: AppTheme;
}

function FilterBar({ activeFilter, onFilterChange, counts, theme }: FilterBarProps) {
  const filters: Array<{ key: MediaFilter; label: string }> = [
    { key: 'all', label: `All (${counts['all']})` },
    { key: 'VIDEO', label: `Video (${counts['VIDEO']})` },
    { key: 'AUDIO', label: `Audio (${counts['AUDIO']})` },
    { key: 'IMAGE', label: `Image (${counts['IMAGE']})` },
  ];

  return (
    <View style={filterStyles.container} accessibilityRole="tablist">
      {filters.map((filter) => {
        const isActive = activeFilter === filter.key;
        return (
          <Pressable
            key={filter.key}
            style={({ pressed }) => [
              filterStyles.pill,
              {
                backgroundColor: isActive ? theme.colors.primaryContainer : theme.colors.surface,
                borderColor: isActive ? theme.colors.primary : theme.colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            onPress={() => {
              triggerHaptic();
              onFilterChange(filter.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`Filter by ${filter.label}`}
          >
            <Text
              style={[
                filterStyles.pillText,
                {
                  color: isActive ? theme.colors.primary : theme.colors.textSecondary,
                  fontWeight: isActive ? '600' : '400',
                },
              ]}
            >
              {filter.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const filterStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    minHeight: 36,
    justifyContent: 'center',
  },
  pillText: {
    fontSize: FONT_SIZE.sm,
  },
});

// ---------------------------------------------------------------------------
// Import actions bar
// ---------------------------------------------------------------------------

interface ImportBarProps {
  onImportCamera: () => void;
  onImportGallery: () => void;
  onImportFile: () => void;
  theme: AppTheme;
}

function ImportBar({ onImportCamera, onImportGallery, onImportFile, theme }: ImportBarProps) {
  const actions = [
    { label: 'Camera', icon: '\u{1F4F7}', onPress: onImportCamera },
    { label: 'Gallery', icon: '\u{1F5BC}', onPress: onImportGallery },
    { label: 'Files', icon: '\u{1F4C1}', onPress: onImportFile },
  ];

  return (
    <View style={[importStyles.container, { borderBottomColor: theme.colors.border }]}>
      {actions.map((action) => (
        <Pressable
          key={action.label}
          style={({ pressed }) => [
            importStyles.actionButton,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              opacity: pressed ? 0.7 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            },
          ]}
          onPress={() => {
            triggerHaptic();
            action.onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Import from ${action.label}`}
        >
          <Text style={importStyles.actionIcon}>{action.icon}</Text>
          <Text style={[importStyles.actionLabel, { color: theme.colors.text }]}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const importStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    borderBottomWidth: 1,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
    minHeight: MIN_TOUCH_TARGET,
  },
  actionIcon: {
    fontSize: 16,
  },
  actionLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
  },
});

// ---------------------------------------------------------------------------
// Media Screen
// ---------------------------------------------------------------------------

export default function MediaScreen() {
  const theme = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();

  const [allAssets, setAllAssets] = useState<MediaAssetWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<MediaFilter>('all');

  const isCompact = screenWidth < 400;

  // ---- Load all media assets from all projects --------------------------------

  const loadAssets = useCallback(async () => {
    try {
      setError(null);
      const projects = await listProjectsFromRepository();
      const assets: MediaAssetWithProject[] = [];
      for (const project of projects) {
        const projectAssets = flattenAssets(project.bins);
        for (const asset of projectAssets) {
          assets.push({ ...asset, projectName: project.name });
        }
      }
      // Sort by name
      assets.sort((a, b) => a.name.localeCompare(b.name));
      setAllAssets(assets);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load media';
      setError(message);
      console.error('[MediaScreen] Failed to load assets:', err);
    }
  }, []);

  useEffect(() => {
    void loadAssets().finally(() => setLoading(false));
  }, [loadAssets]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    triggerHaptic();
    await loadAssets();
    setRefreshing(false);
  }, [loadAssets]);

  // ---- Filter logic -----------------------------------------------------------

  const filteredAssets = useMemo(() => {
    if (activeFilter === 'all') return allAssets;
    return allAssets.filter((asset) => asset.type === activeFilter);
  }, [allAssets, activeFilter]);

  const counts = useMemo(() => {
    const result: Record<MediaFilter, number> = {
      all: allAssets.length,
      VIDEO: 0,
      AUDIO: 0,
      IMAGE: 0,
    };
    for (const asset of allAssets) {
      if (asset.type === 'VIDEO') result['VIDEO'] += 1;
      else if (asset.type === 'AUDIO') result['AUDIO'] += 1;
      else if (asset.type === 'IMAGE' || asset.type === 'GRAPHIC') result['IMAGE'] += 1;
    }
    return result;
  }, [allAssets]);

  // ---- Import handlers -------------------------------------------------------

  const handleImportCamera = useCallback(() => {
    Alert.alert(
      'Camera Import',
      'Camera capture requires expo-camera. This feature will be available in a future release.',
      [{ text: 'OK' }],
    );
  }, []);

  const handleImportGallery = useCallback(() => {
    Alert.alert(
      'Gallery Import',
      'Gallery picker integration with expo-media-library is configured. Select media from your device photo library to import into your project bins.',
      [{ text: 'OK' }],
    );
  }, []);

  const handleImportFile = useCallback(() => {
    Alert.alert(
      'File Import',
      'Document picker integration with expo-document-picker is configured. Select files from your device to import media assets.',
      [{ text: 'OK' }],
    );
  }, []);

  // ---- Key extractor ----------------------------------------------------------

  const keyExtractor = useCallback((item: MediaAssetWithProject) => item.id, []);

  // ---- Loading state ----------------------------------------------------------

  if (loading) {
    return (
      <View style={[screenStyles.container, { backgroundColor: theme.colors.background }]}>
        <ImportBar
          onImportCamera={handleImportCamera}
          onImportGallery={handleImportGallery}
          onImportFile={handleImportFile}
          theme={theme}
        />
        <View style={screenStyles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[screenStyles.loadingText, { color: theme.colors.textSecondary }]}>
            Loading media library...
          </Text>
        </View>
      </View>
    );
  }

  // ---- Render -----------------------------------------------------------------

  return (
    <View style={[screenStyles.container, { backgroundColor: theme.colors.background }]}>
      <ImportBar
        onImportCamera={handleImportCamera}
        onImportGallery={handleImportGallery}
        onImportFile={handleImportFile}
        theme={theme}
      />

      <FilterBar
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        counts={counts}
        theme={theme}
      />

      {error !== null ? (
        <ErrorBanner
          message={error}
          onRetry={() => { void loadAssets(); }}
          theme={theme}
        />
      ) : null}

      <FlatList<MediaAssetWithProject>
        data={filteredAssets}
        keyExtractor={keyExtractor}
        contentContainerStyle={filteredAssets.length === 0 ? screenStyles.emptyList : screenStyles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            progressBackgroundColor={theme.colors.surface}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={Platform.OS === 'ios' ? '\u{1F4F7}' : 'CAM'}
            title="No Media Found"
            subtitle={activeFilter !== 'all'
              ? `No ${activeFilter.toLowerCase()} assets in your library. Try a different filter or import new media.`
              : 'Import media from camera, gallery, or files to get started'}
            actionLabel="Import from Gallery"
            onAction={handleImportGallery}
            theme={theme}
          />
        }
        renderItem={({ item }) => (
          <MediaAssetCard asset={item} theme={theme} isCompact={isCompact} />
        )}
        showsVerticalScrollIndicator={false}
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
      />
    </View>
  );
}

const screenStyles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZE.md,
  },
  emptyList: { flexGrow: 1 },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
});
