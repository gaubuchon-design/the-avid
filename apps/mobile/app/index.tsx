import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
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

  const refreshProjects = React.useCallback(async () => {
    setProjects(await listProjectSummariesFromRepository());
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const handleCreateProject = async () => {
    const project = await createProjectInRepository({ template: 'social' });
    await refreshProjects();
    router.push(`/editor/${project.id}`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>The Avid</Text>
          <Text style={styles.subheading}>Mobile review and rough-cut workspace</Text>
        </View>
        <TouchableOpacity style={styles.button} onPress={() => { void handleCreateProject(); }}>
          <Text style={styles.buttonText}>+ New Project</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={projects.length === 0 ? styles.emptyList : styles.list}
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
          >
            <View style={styles.projectRow}>
              <Text style={styles.projectName}>{item.name}</Text>
              <Text style={styles.projectProgress}>{item.progress}%</Text>
            </View>
            <Text style={styles.projectMeta}>
              {item.tags.join(' · ')}
            </Text>
            <Text style={styles.projectMeta}>
              {formatDuration(item.durationSeconds)} · {item.members} collaborators
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
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
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  emptyList: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
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
