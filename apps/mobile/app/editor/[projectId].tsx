import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { flattenAssets } from '@mcua/core';
import type { EditorProject } from '@mcua/core';
import { getProjectFromRepository } from '../lib/projectRepository';

type EditorMode = 'timeline' | 'review' | 'script' | 'publish';

export default function EditorScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<EditorProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('timeline');
  const resolvedProjectId = Array.isArray(projectId) ? projectId[0] : projectId;

  const loadProject = useCallback(async () => {
    if (!resolvedProjectId) {
      setError('No project ID provided');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const nextProject = await getProjectFromRepository(resolvedProjectId);
      if (!nextProject) {
        setError('Project not found');
      }
      setProject(nextProject);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load project';
      setError(message);
      console.error('[EditorScreen] Failed to load project:', message);
    } finally {
      setLoading(false);
    }
  }, [resolvedProjectId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  const assets = useMemo(() => (project ? flattenAssets(project.bins) : []), [project]);
  const clipCount = project ? project.tracks.reduce((total, track) => total + track.clips.length, 0) : 0;

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading project...</Text>
      </View>
    );
  }

  if (error || !project) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorTitle}>{error ?? 'Project not found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => { void loadProject(); }} activeOpacity={0.7}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.retryText}>Back to Projects</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolBtn} activeOpacity={0.6} accessibilityLabel="Play" accessibilityRole="button">
          <Text style={styles.toolBtnText}>&#9654;</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolBtn} activeOpacity={0.6} accessibilityLabel="Stop" accessibilityRole="button">
          <Text style={styles.toolBtnText}>&#9724;</Text>
        </TouchableOpacity>
        <View style={styles.spacer} />
        <TouchableOpacity style={styles.toolBtn} activeOpacity={0.6} accessibilityLabel="AI tokens">
          <Text style={styles.toolBtnText}>{project.tokenBalance ?? 0} AI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toolBtn, styles.exportBtn]} activeOpacity={0.6} accessibilityLabel="Export project" accessibilityRole="button">
          <Text style={styles.toolBtnText}>Export</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.workspace}>
        <View style={styles.assetPanel}>
          <Text style={styles.panelTitle} numberOfLines={1}>{project.name}</Text>
          <Text style={styles.panelMeta}>{project.settings.width}x{project.settings.height} {'\u00b7'} {project.settings.frameRate}fps</Text>
          <View style={styles.modeTabs}>
            {(['timeline', 'review', 'script', 'publish'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.modeTab, mode === tab && styles.modeTabActive]}
                onPress={() => setMode(tab)}
                activeOpacity={0.6}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === tab }}
              >
                <Text style={[styles.modeTabText, mode === tab && styles.modeTabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {mode === 'timeline' && (
              <>
                <Text style={styles.sectionLabel}>Bins</Text>
                {project.bins.map((bin) => (
                  <Text key={bin.id} style={styles.assetItem} numberOfLines={1}>
                    {bin.name} {'\u00b7'} {bin.assets.length + bin.children.reduce((total, child) => total + child.assets.length, 0)}
                  </Text>
                ))}
              </>
            )}
            {mode === 'review' && (
              <>
                <Text style={styles.sectionLabel}>Approvals</Text>
                {project.approvals.length === 0 && <Text style={styles.emptyHint}>No approvals yet</Text>}
                {project.approvals.map((approval) => (
                  <Text key={approval.id} style={styles.assetItem} numberOfLines={1}>
                    {approval.reviewer} {'\u00b7'} {approval.status.toLowerCase().replace(/_/g, ' ')}
                  </Text>
                ))}
              </>
            )}
            {mode === 'script' && (
              <>
                <Text style={styles.sectionLabel}>Transcript</Text>
                {project.transcript.length === 0 && <Text style={styles.emptyHint}>No transcript cues</Text>}
                {project.transcript.slice(0, 6).map((cue) => (
                  <Text key={cue.id} style={styles.assetItem} numberOfLines={2}>
                    {cue.speaker}: {cue.text}
                  </Text>
                ))}
              </>
            )}
            {mode === 'publish' && (
              <>
                <Text style={styles.sectionLabel}>Deliverables</Text>
                {project.publishJobs.length === 0 && <Text style={styles.emptyHint}>No delivery jobs</Text>}
                {project.publishJobs.map((job) => (
                  <Text key={job.id} style={styles.assetItem} numberOfLines={1}>
                    {job.label} {'\u00b7'} {job.status.toLowerCase()}
                  </Text>
                ))}
              </>
            )}
          </ScrollView>
        </View>

        <View style={styles.preview}>
          <View style={styles.previewCanvas}>
            <Text style={styles.previewLabel}>
              {mode === 'timeline' ? `${clipCount} clips in timeline` : mode === 'review' ? `${project.reviewComments.length} review notes` : mode === 'script' ? `${project.transcript.length} transcript cues` : `${project.publishJobs.length} delivery jobs`}
            </Text>
            <Text style={styles.previewSubLabel}>
              {mode === 'timeline' ? `${assets.length} assets available` : mode === 'review' ? 'Mobile approval and annotation workspace' : mode === 'script' ? 'Transcript-led rough cut companion' : 'Queue and destination overview'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.timeline}>
        <Text style={styles.panelTitle}>
          {mode === 'timeline' ? 'Timeline' : mode === 'review' ? 'Review Feed' : mode === 'script' ? 'Script Cues' : 'Publish Queue'}
        </Text>
        <ScrollView horizontal={mode === 'timeline'} showsHorizontalScrollIndicator={false}>
          <View style={styles.timelineContent}>
            {mode === 'timeline' && project.tracks.map((track) => (
              <View key={track.id} style={styles.timelineTrack}>
                <Text style={styles.trackLabel}>{track.name}</Text>
                <Text style={styles.trackMeta}>{track.clips.length} clips</Text>
              </View>
            ))}
            {mode === 'review' && project.reviewComments.map((comment) => (
              <View key={comment.id} style={styles.feedCard}>
                <Text style={styles.trackLabel}>{comment.author} {'\u00b7'} {comment.status.toLowerCase()}</Text>
                <Text style={styles.feedText} numberOfLines={3}>{comment.body}</Text>
              </View>
            ))}
            {mode === 'script' && project.transcript.map((cue) => (
              <View key={cue.id} style={styles.feedCard}>
                <Text style={styles.trackLabel}>{cue.speaker}</Text>
                <Text style={styles.feedText} numberOfLines={3}>{cue.text}</Text>
              </View>
            ))}
            {mode === 'publish' && project.publishJobs.map((job) => (
              <View key={job.id} style={styles.feedCard}>
                <Text style={styles.trackLabel}>{job.label}</Text>
                <Text style={styles.feedText}>{job.preset} {'\u00b7'} {job.destination} {'\u00b7'} {job.status.toLowerCase()}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={styles.quickActions}>
          {['Marker', 'AI Action', 'Trim', 'Approve'].map((action) => (
            <TouchableOpacity
              key={action}
              style={styles.quickAction}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={action}
            >
              <Text style={styles.quickActionText}>{action}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#94a3b8', fontSize: 14, marginTop: 12 },
  errorTitle: { color: '#fca5a5', fontSize: 16, fontWeight: '600', textAlign: 'center', paddingHorizontal: 24 },
  retryButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  backButton: {
    backgroundColor: '#334155',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: '#f1f5f9', fontWeight: '600', fontSize: 14 },
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
    minWidth: 40,
    alignItems: 'center',
  },
  exportBtn: {
    backgroundColor: '#6366f1',
  },
  toolBtnText: { color: '#f1f5f9', fontSize: 13 },
  spacer: { flex: 1 },
  workspace: { flex: 1, flexDirection: 'row' },
  assetPanel: {
    width: 190,
    backgroundColor: '#161f2e',
    borderRightWidth: 1,
    borderRightColor: '#334155',
    padding: 12,
  },
  panelTitle: { color: '#f1f5f9', fontWeight: '600', fontSize: 13, marginBottom: 8 },
  panelMeta: { color: '#94a3b8', fontSize: 11, marginBottom: 12 },
  sectionLabel: { color: '#64748b', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  assetItem: { color: '#cbd5e1', fontSize: 12, marginBottom: 6 },
  emptyHint: { color: '#64748b', fontSize: 11, fontStyle: 'italic', marginBottom: 6 },
  modeTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  modeTab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modeTabActive: { backgroundColor: '#312e81', borderColor: '#6366f1' },
  modeTabText: { color: '#94a3b8', fontSize: 11, textTransform: 'capitalize' },
  modeTabTextActive: { color: '#e0e7ff', fontWeight: '600' },
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
  previewLabel: { color: '#e2e8f0', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  previewSubLabel: { color: '#64748b', fontSize: 12, marginTop: 8, textAlign: 'center', paddingHorizontal: 16 },
  timeline: {
    height: 180,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    padding: 12,
  },
  timelineContent: { gap: 8 },
  timelineTrack: {
    height: 44,
    backgroundColor: '#334155',
    borderRadius: 4,
    marginBottom: 8,
    minWidth: 620,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackLabel: { color: '#e2e8f0', fontSize: 12, fontWeight: '600' },
  trackMeta: { color: '#94a3b8', fontSize: 11 },
  feedCard: {
    backgroundColor: '#334155',
    borderRadius: 8,
    padding: 12,
    minWidth: 320,
  },
  feedText: { color: '#cbd5e1', fontSize: 12, marginTop: 6, lineHeight: 18 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  quickAction: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickActionText: { color: '#e2e8f0', fontSize: 11, fontWeight: '600' },
});
