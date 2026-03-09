import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { ProjectSummary } from '@mcua/core';
import {
  createProjectInRepository,
  deleteProjectFromRepository,
  listProjectSummariesFromRepository,
} from './lib/projectRepository';

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

export default function HomeScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    await refreshProjects();
    setRefreshing(false);
  }, [refreshProjects]);

  const handleCreateProject = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const project = await createProjectInRepository({ template: 'social' });
      await refreshProjects();
      router.push(`/editor/${project.id}`);
    } catch (err) {
      console.error('[HomeScreen] Failed to create project:', err);
      Alert.alert('Error', 'Failed to create project. Please try again.');
    } finally {
      setCreating(false);
    }
  }, [creating, refreshProjects, router]);

  const handleDeleteProject = useCallback((project: ProjectSummary) => {
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
              console.error('[HomeScreen] Failed to delete project:', err);
              Alert.alert('Error', 'Failed to delete project.');
            }
          },
        },
      ],
    );
  }, [refreshProjects]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading projects...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.heading}>The Avid</Text>
          <Text style={styles.subheading}>Mobile review and rough-cut workspace</Text>
        </View>
        <TouchableOpacity
          style={[styles.button, creating && styles.buttonDisabled]}
          onPress={() => { void handleCreateProject(); }}
          disabled={creating}
          activeOpacity={0.7}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>+ New Project</Text>
          )}
        </TouchableOpacity>
      </View>

      {error !== null && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => { void refreshProjects(); }}>
            <Text style={styles.errorRetry}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={projects.length === 0 ? styles.emptyList : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#6366f1"
            colors={['#6366f1']}
          />
        }
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎬</Text>
            <Text style={styles.emptyTitle}>No Projects Yet</Text>
            <Text style={styles.emptySubtitle}>Create a new project to start composing</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.projectCard}
            onPress={() => router.push(`/editor/${item.id}`)}
            onLongPress={() => handleDeleteProject(item)}
            activeOpacity={0.7}
            delayLongPress={600}
          >
            <View style={styles.projectRow}>
              <Text style={styles.projectName} numberOfLines={1}>{item.name}</Text>
              <View style={styles.progressBadge}>
                <Text style={styles.projectProgress}>{item.progress}%</Text>
              </View>
            </View>
            {item.tags.length > 0 && (
              <View style={styles.tagRow}>
                {item.tags.slice(0, 4).map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.metaRow}>
              <Text style={styles.projectMeta}>
                {formatDuration(item.durationSeconds)}
              </Text>
              <Text style={styles.projectMetaSep}>{' \u00b7 '}</Text>
              <Text style={styles.projectMeta}>
                {item.members} {item.members === 1 ? 'collaborator' : 'collaborators'}
              </Text>
              {item.updatedAt && (
                <>
                  <Text style={styles.projectMetaSep}>{' \u00b7 '}</Text>
                  <Text style={styles.projectMeta}>{formatRelativeDate(item.updatedAt)}</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#94a3b8', fontSize: 14, marginTop: 12 },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerLeft: { flex: 1 },
  heading: { color: '#f8fafc', fontSize: 20, fontWeight: '700' },
  subheading: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  button: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  errorBanner: {
    backgroundColor: '#7f1d1d',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: { color: '#fecaca', fontSize: 13, flex: 1 },
  errorRetry: { color: '#fca5a5', fontWeight: '600', fontSize: 13, marginLeft: 12 },
  emptyList: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '600' },
  emptySubtitle: { color: '#94a3b8', fontSize: 14 },
  list: { padding: 16, gap: 12 },
  projectCard: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  projectName: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    paddingRight: 12,
  },
  progressBadge: {
    backgroundColor: '#312e81',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  projectProgress: { color: '#818cf8', fontSize: 12, fontWeight: '700' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  tag: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: { color: '#94a3b8', fontSize: 11 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  projectMeta: { color: '#94a3b8', fontSize: 12 },
  projectMetaSep: { color: '#475569', fontSize: 12 },
});
