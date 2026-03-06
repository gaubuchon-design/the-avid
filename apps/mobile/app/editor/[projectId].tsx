import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function EditorScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  return (
    <View style={styles.container}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolBtn}><Text style={styles.toolBtnText}>▶</Text></TouchableOpacity>
        <TouchableOpacity style={styles.toolBtn}><Text style={styles.toolBtnText}>⏹</Text></TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.toolBtn}><Text style={styles.toolBtnText}>＋ Asset</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.toolBtn, { backgroundColor: '#6366f1' }]}>
          <Text style={styles.toolBtnText}>Export</Text>
        </TouchableOpacity>
      </View>

      {/* Workspace */}
      <View style={styles.workspace}>
        {/* Asset Panel */}
        <View style={styles.assetPanel}>
          <Text style={styles.panelTitle}>Assets</Text>
          <Text style={styles.panelEmpty}>No assets</Text>
        </View>

        {/* Preview */}
        <View style={styles.preview}>
          <View style={styles.previewCanvas}>
            <Text style={styles.previewLabel}>Preview</Text>
          </View>
        </View>
      </View>

      {/* Timeline */}
      <View style={styles.timeline}>
        <Text style={styles.panelTitle}>Timeline</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={styles.timelineTrack}>
            <Text style={styles.trackLabel}>Video 1</Text>
          </View>
          <View style={styles.timelineTrack}>
            <Text style={styles.trackLabel}>Audio 1</Text>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    padding: 8,
    gap: 8,
  },
  toolBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toolBtnText: { color: '#f1f5f9', fontSize: 13 },
  workspace: { flex: 1, flexDirection: 'row' },
  assetPanel: {
    width: 180,
    backgroundColor: '#161f2e',
    borderRightWidth: 1,
    borderRightColor: '#334155',
    padding: 12,
  },
  preview: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewCanvas: {
    width: '80%',
    aspectRatio: 16 / 9,
    backgroundColor: '#080e1a',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  previewLabel: { color: '#475569', fontSize: 14 },
  panelTitle: { color: '#f1f5f9', fontWeight: '600', fontSize: 13, marginBottom: 8 },
  panelEmpty: { color: '#475569', fontSize: 12 },
  timeline: {
    height: 160,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    padding: 12,
  },
  timelineTrack: {
    height: 40,
    backgroundColor: '#334155',
    borderRadius: 4,
    marginBottom: 8,
    minWidth: 600,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  trackLabel: { color: '#94a3b8', fontSize: 11 },
});
