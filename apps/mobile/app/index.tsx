import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import type { Project } from '@mcua/core';

const MOCK_PROJECTS: Project[] = [];

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {/* Header Actions */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/editor/new')}
        >
          <Text style={styles.buttonText}>+ New Project</Text>
        </TouchableOpacity>
      </View>

      {/* Project List */}
      {MOCK_PROJECTS.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No Projects Yet</Text>
          <Text style={styles.emptySubtitle}>
            Create a new project to start composing
          </Text>
        </View>
      ) : (
        <FlatList
          data={MOCK_PROJECTS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.projectCard}
              onPress={() => router.push(`/editor/${item.id}`)}
            >
              <Text style={styles.projectName}>{item.name}</Text>
              <Text style={styles.projectMeta}>
                {item.assets.length} assets · {new Date(item.updatedAt).toLocaleDateString()}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
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
    justifyContent: 'flex-end',
  },
  button: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
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
  },
  projectName: { color: '#f1f5f9', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  projectMeta: { color: '#94a3b8', fontSize: 12 },
});
