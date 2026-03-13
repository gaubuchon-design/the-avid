import React, { useCallback, useEffect, useMemo, useState, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Platform,
  Pressable,
  useWindowDimensions,
  Vibration,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getEditorialSurfaceContract,
  type ProjectSummary,
  type ProjectTemplate,
} from '@mcua/core';
import { useAppTheme, useAuth } from '../_layout';
import type { AppTheme } from '../_layout';
import {
  createProjectInRepository,
  deleteProjectFromRepository,
  duplicateProjectInRepository,
  listProjectSummariesFromRepository,
} from '../lib/projectRepository';
import { ProjectListSkeleton } from '../src/components/SkeletonLoader';
import { EmptyState } from '../src/components/EmptyState';
import { ErrorBanner } from '../src/components/ErrorBanner';
import { MIN_TOUCH_TARGET, CARD_BORDER_RADIUS, SPACING, FONT_SIZE, MONO_FONT } from '../src/constants/layout';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}`;
}

function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const TEMPLATE_ICON_MAP: Record<ProjectTemplate, string> = {
  film: 'F',
  commercial: 'C',
  documentary: 'D',
  sports: 'S',
  podcast: 'P',
  social: 'V',
  news: 'N',
};

const TEMPLATE_COLOR_MAP: Record<ProjectTemplate, string> = {
  film: '#4f63f5',
  commercial: '#25a865',
  documentary: '#d4873a',
  sports: '#c94f84',
  podcast: '#7c5cfc',
  social: '#0ea5e9',
  news: '#ef4444',
};

const MOBILE_SURFACE_CONTRACT = getEditorialSurfaceContract('mobile');

function triggerHaptic(): void {
  try {
    if (Platform.OS !== 'web') {
      Vibration.vibrate(Platform.OS === 'ios' ? 10 : 15);
    }
  } catch {
    // Haptics are non-critical
  }
}

// ---------------------------------------------------------------------------
// Project Card
// ---------------------------------------------------------------------------

interface ProjectCardProps {
  project: ProjectSummary;
  onPress: () => void;
  onLongPress: () => void;
  theme: AppTheme;
}

const ProjectCard = memo(function ProjectCard({ project, onPress, onLongPress, theme }: ProjectCardProps) {
  const templateColor = TEMPLATE_COLOR_MAP[project.template] ?? theme.colors.primary;
  const templateIcon = TEMPLATE_ICON_MAP[project.template] ?? '?';

  const handleLongPress = useCallback(() => {
    triggerHaptic();
    onLongPress();
  }, [onLongPress]);

  return (
    <Pressable
      style={({ pressed }) => [
        cardStyles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: theme.dark ? 0.4 : 0.1,
              shadowRadius: 4,
            },
            android: { elevation: 3 },
          }),
        },
      ]}
      onPress={onPress}
      onLongPress={handleLongPress}
      delayLongPress={500}
      accessibilityRole="button"
      accessibilityLabel={`Open project ${project.name}`}
      accessibilityHint="Double-tap to open. Long press for more options."
    >
      {/* Thumbnail / Icon area */}
      <View style={[cardStyles.thumbnail, { backgroundColor: templateColor + '20' }]}>
        <Text
          style={[cardStyles.thumbnailLetter, { color: templateColor }]}
          accessibilityElementsHidden
        >
          {templateIcon}
        </Text>
        {project.resolutionLabel ? (
          <View style={[cardStyles.resolutionPill, { backgroundColor: theme.colors.surface + 'CC' }]}>
            <Text style={[cardStyles.resolutionBadge, { color: theme.colors.textMuted }]}>
              {project.resolutionLabel}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Content */}
      <View style={cardStyles.content}>
        <View style={cardStyles.titleRow}>
          <Text
            style={[cardStyles.projectName, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {project.name}
          </Text>
          <View style={[cardStyles.progressBadge, { backgroundColor: theme.colors.primaryContainer }]}>
            <Text style={[cardStyles.progressText, { color: theme.colors.primary }]}>
              {project.progress}%
            </Text>
          </View>
        </View>

        {project.description ? (
          <Text
            style={[cardStyles.description, { color: theme.colors.textSecondary }]}
            numberOfLines={1}
          >
            {project.description}
          </Text>
        ) : null}

        {project.tags.length > 0 && (
          <View style={cardStyles.tagRow}>
            {project.tags.slice(0, 4).map((tag) => (
              <View
                key={tag}
                style={[cardStyles.tag, { borderColor: theme.colors.border }]}
              >
                <Text style={[cardStyles.tagText, { color: theme.colors.textMuted }]}>
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={cardStyles.metaRow}>
          <Text style={[cardStyles.metaText, { color: theme.colors.textSecondary }]}>
            {formatDuration(project.durationSeconds)}
          </Text>
          <Text style={[cardStyles.metaSep, { color: theme.colors.border }]}>{' \u00b7 '}</Text>
          <Text style={[cardStyles.metaText, { color: theme.colors.textSecondary }]}>
            {project.members} {project.members === 1 ? 'collaborator' : 'collaborators'}
          </Text>
          {project.updatedAt ? (
            <>
              <Text style={[cardStyles.metaSep, { color: theme.colors.border }]}>{' \u00b7 '}</Text>
              <Text style={[cardStyles.metaText, { color: theme.colors.textSecondary }]}>
                {formatRelativeDate(project.updatedAt)}
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: CARD_BORDER_RADIUS,
    borderWidth: 1,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  thumbnail: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailLetter: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 2,
  },
  resolutionPill: {
    position: 'absolute',
    bottom: 6,
    right: 8,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  resolutionBadge: {
    fontSize: 9,
    fontFamily: MONO_FONT,
  },
  content: {
    padding: 14,
    gap: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    paddingRight: 12,
  },
  progressBadge: {
    borderRadius: CARD_BORDER_RADIUS,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '700',
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 11,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
  },
  metaSep: {
    fontSize: 12,
  },
});

// ---------------------------------------------------------------------------
// Home Screen
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { user } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const numColumns = screenWidth >= 768 ? 2 : 1;

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Data loading ---------------------------------------------------------

  const refreshProjects = useCallback(async () => {
    try {
      setError(null);
      const result = await listProjectSummariesFromRepository();
      setProjects(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load projects';
      setError(message);
      console.error('[HomeScreen] Failed to load projects:', err);
    }
  }, []);

  useEffect(() => {
    void refreshProjects().finally(() => setLoading(false));
  }, [refreshProjects]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    triggerHaptic();
    await refreshProjects();
    setRefreshing(false);
  }, [refreshProjects]);

  // ---- Project actions -------------------------------------------------------

  const handleCreateProject = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    triggerHaptic();
    try {
      const project = await createProjectInRepository({
        template: MOBILE_SURFACE_CONTRACT.defaultProjectTemplate,
      });
      await refreshProjects();
      router.push(`/editor/${project.id}`);
    } catch (err) {
      console.error('[HomeScreen] Failed to create project:', err);
      Alert.alert('Error', 'Failed to create project. Please try again.');
    } finally {
      setCreating(false);
    }
  }, [creating, refreshProjects, router]);

  const showProjectActions = useCallback(
    (project: ProjectSummary) => {
      const buttons: Array<{
        text: string;
        style?: 'cancel' | 'destructive';
        onPress?: () => void;
      }> = [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Duplicate',
          onPress: async () => {
            try {
              await duplicateProjectInRepository(project.id);
              await refreshProjects();
            } catch (err) {
              console.error('[HomeScreen] Duplicate failed:', err);
              Alert.alert('Error', 'Failed to duplicate project.');
            }
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete Project',
              `Are you sure you want to delete "${project.name}"? This action cannot be undone.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteProjectFromRepository(project.id);
                      await refreshProjects();
                    } catch (err) {
                      console.error('[HomeScreen] Delete failed:', err);
                      Alert.alert('Error', 'Failed to delete project.');
                    }
                  },
                },
              ],
            );
          },
        },
      ];
      Alert.alert(project.name, 'Choose an action', buttons);
    },
    [refreshProjects],
  );

  // ---- Key extractor --------------------------------------------------------

  const keyExtractor = useCallback((item: ProjectSummary) => item.id, []);

  // ---- Memoised greeting ----------------------------------------------------

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const name = user?.displayName?.split(' ')[0] ?? 'there';
    if (hour < 12) return `Good morning, ${name}`;
    if (hour < 18) return `Good afternoon, ${name}`;
    return `Good evening, ${name}`;
  }, [user]);

  // ---- Loading state --------------------------------------------------------

  if (loading) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        accessibilityRole="progressbar"
        accessibilityLabel="Loading projects"
      >
        {/* Header skeleton */}
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <View style={styles.headerLeft}>
            <Text style={[styles.heading, { color: theme.colors.text }]}>
              {greeting}
            </Text>
            <Text style={[styles.subheading, { color: theme.colors.textSecondary }]}>
              Loading your projects...
            </Text>
          </View>
        </View>
        <ProjectListSkeleton />
      </View>
    );
  }

  // ---- Render ---------------------------------------------------------------

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.heading, { color: theme.colors.text }]}>
            {greeting}
          </Text>
          <Text style={[styles.subheading, { color: theme.colors.textSecondary }]}>
            {projects.length > 0
              ? `${projects.length} project${projects.length === 1 ? '' : 's'} in your library`
              : MOBILE_SURFACE_CONTRACT.description}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.colors.primary,
              opacity: creating ? 0.6 : pressed ? 0.8 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
          ]}
          onPress={() => { void handleCreateProject(); }}
          disabled={creating}
          accessibilityRole="button"
          accessibilityLabel="Create new project"
          accessibilityState={{ disabled: creating }}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>+ New Project</Text>
          )}
        </Pressable>
      </View>

      {/* Error banner */}
      {error !== null && (
        <ErrorBanner
          message={error}
          onRetry={() => { void refreshProjects(); }}
          theme={theme}
        />
      )}

      {/* Project list */}
      <FlatList<ProjectSummary>
        key={`cols-${numColumns}`}
        data={projects}
        keyExtractor={keyExtractor}
        numColumns={numColumns}
        contentContainerStyle={projects.length === 0 ? styles.emptyList : styles.list}
        columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
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
            icon={Platform.OS === 'ios' ? '\u{1F3AC}' : 'NLE'}
            title="No Projects Yet"
            subtitle="Create a new project to start composing on the go"
            actionLabel="+ New Project"
            onAction={() => { void handleCreateProject(); }}
            theme={theme}
          />
        }
        renderItem={({ item }) => (
          <View style={numColumns > 1 ? styles.columnItem : undefined}>
            <ProjectCard
              project={item}
              onPress={() => {
                triggerHaptic();
                router.push(`/editor/${item.id}`);
              }}
              onLongPress={() => showProjectActions(item)}
              theme={theme}
            />
          </View>
        )}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={12}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: SPACING.lg,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
  },
  headerLeft: { flex: 1 },
  heading: { fontSize: FONT_SIZE.xl, fontWeight: '700' },
  subheading: { fontSize: FONT_SIZE.sm, marginTop: 4 },
  button: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 120,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: FONT_SIZE.md },
  emptyList: { flexGrow: 1 },
  list: { padding: SPACING.lg },
  columnWrapper: { gap: SPACING.md },
  columnItem: { flex: 1 },
});
