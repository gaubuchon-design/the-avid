import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import type { ProjectSummary } from '@mcua/core';
import {
  createProjectInRepository,
  listProjectSummariesFromRepository,
} from './lib/projectRepository';

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      console.error('[HomeScreen] Failed to load projects:', message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
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
      const message = err instanceof Error ? err.message : 'Failed to create project';
      setError(message);
      console.error('[HomeScreen] Failed to create project:', message);
    } finally {
      setCreating(false);
    }
  }, [creating, refreshProjects, router]);

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
        <View>
          <Text style={styles.heading}>The Avid</Text>
          <Text style={styles.subheading}>Mobile review and rough-cut workspace</Text>
        </View>
        <TouchableOpacity
          style={[styles.button, creating && styles.buttonDisabled]}
          onPress={() => { void handleCreateProject(); }}
          disabled={creating}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>{creating ? 'Creating...' : '+ New Project'}</Text>
        </TouchableOpacity>
      </View>

      {error !== null && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.errorDismiss}>Dismiss</Text>
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
            onRefresh={() => { void handleRefresh(); }}
            tintColor="#6366f1"
          />
        }
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No Projects Yet</Text>
            <Text style={styles.emptySubtitle}>Create a new project to start composing</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.projectCard}
            onPress={() => router.push(`/editor/${item.id}`)}
            activeOpacity={0.7}
          >
            <View style={styles.projectRow}>
              <Text style={styles.projectName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.projectProgress}>{item.progress}%</Text>
            </View>
            <Text style={styles.projectMeta} numberOfLines={1}>
              {item.tags.join(' \u00b7 ')}
            </Text>
            <Text style={styles.projectMeta}>
              {formatDuration(item.durationSeconds)} \u00b7 {item.members} collaborators
            </Text>
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
  buttonDisabled: {
    backgroundColor: '#4338ca',
    opacity: 0.7,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  errorBanner: {
    backgroundColor: '#7f1d1d',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: { color: '#fecaca', fontSize: 13, flex: 1, marginRight: 12 },
  errorDismiss: { color: '#fca5a5', fontWeight: '600', fontSize: 13 },
  emptyList: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 60 },
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
  projectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  projectName: { color: '#f1f5f9', fontSize: 16, fontWeight: '600', flex: 1, paddingRight: 12 },
  projectProgress: { color: '#818cf8', fontSize: 13, fontWeight: '700' },
  projectMeta: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
});
