import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { flattenAssets } from '@mcua/core';
import type { EditorProject } from '@mcua/core';
import { getProjectFromRepository, saveProjectToRepository } from '../lib/projectRepository';

type EditorMode = 'timeline' | 'review' | 'script' | 'publish';

function formatTimecode(seconds: number, frameRate = 30): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * frameRate);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

export default function EditorScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const navigation = useNavigation();
  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth < 700;

  const [project, setProject] = useState<EditorProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('timeline');
  const [saving, setSaving] = useState(false);

  const resolvedProjectId = Array.isArray(projectId) ? projectId[0] : projectId;

  // Load project
  useEffect(() => {
    if (!resolvedProjectId) {
      setError('No project ID provided');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadProject() {
      try {
        setError(null);
        const nextProject = await getProjectFromRepository(resolvedProjectId!);
        if (cancelled) return;

        if (!nextProject) {
          setError('Project not found');
        } else {
          setProject(nextProject);
          // Update header title with project name
          navigation.setOptions({ title: nextProject.name });
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load project';
        setError(message);
        console.error('[EditorScreen] Load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProject();
    return () => { cancelled = true; };
  }, [resolvedProjectId, navigation]);

  // Derived data
  const assets = useMemo(() => (project ? flattenAssets(project.bins) : []), [project]);
  const clipCount = useMemo(
    () => project?.tracks.reduce((total, track) => total + track.clips.length, 0) ?? 0,
    [project],
  );
  const totalDuration = useMemo(() => {
    if (!project) return 0;
    return project.tracks.reduce((max, track) => {
      const trackEnd = track.clips.reduce((end, clip) => Math.max(end, clip.startFrame + clip.durationFrames), 0);
      return Math.max(max, trackEnd);
    }, 0) / (project.settings.frameRate || 30);
  }, [project]);

  // Actions
  const handleSave = useCallback(async () => {
    if (!project || saving) return;
    setSaving(true);
    try {
      const saved = await saveProjectToRepository(project);
      setProject(saved);
    } catch (err) {
      console.error('[EditorScreen] Save failed:', err);
      Alert.alert('Save Failed', 'Could not save the project. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [project, saving]);

  const handleExport = useCallback(() => {
    Alert.alert(
      'Export',
      'Export functionality requires the desktop application for full rendering pipeline.',
      [{ text: 'OK' }],
    );
  }, []);

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading project...</Text>
      </View>
    );
  }

  // Error state
  if (error || !project) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorTitle}>{error ?? 'Project not found'}</Text>
        <Text style={styles.errorSubtitle}>
          The project may have been deleted or moved.
        </Text>
      </View>
    );
  }

  // Asset panel width adapts to screen size
  const assetPanelWidth = isCompact ? 140 : 190;

  return (
    <View style={styles.container}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolBtn} activeOpacity={0.7}>
          <Text style={styles.toolBtnText}>{'  \u25B6  '}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolBtn} activeOpacity={0.7}>
          <Text style={styles.toolBtnText}>{' \u23F9 '}</Text>
        </TouchableOpacity>
        <Text style={styles.timecodeDisplay}>
          {formatTimecode(0, project.settings.frameRate)}
        </Text>
        <View style={{ flex: 1 }} />
        {project.tokenBalance > 0 && (
          <TouchableOpacity style={styles.toolBtn} activeOpacity={0.7}>
            <Text style={styles.toolBtnText}>{project.tokenBalance} AI</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.toolBtn, styles.saveBtn]}
          onPress={() => { void handleSave(); }}
          disabled={saving}
          activeOpacity={0.7}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.toolBtnText}>Save</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toolBtn, styles.exportBtn]}
          onPress={handleExport}
          activeOpacity={0.7}
        >
          <Text style={styles.toolBtnText}>Export</Text>
        </TouchableOpacity>
      </View>

      {/* Workspace: side panel + preview */}
      <View style={styles.workspace}>
        <ScrollView style={[styles.assetPanel, { width: assetPanelWidth }]}>
          <Text style={styles.panelTitle} numberOfLines={1}>{project.name}</Text>
          <Text style={styles.panelMeta}>
            {project.settings.width}x{project.settings.height} {' \u00b7 '} {project.settings.frameRate}fps
          </Text>

          {/* Mode tabs */}
          <View style={styles.modeTabs}>
            {(['timeline', 'review', 'script', 'publish'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.modeTab, mode === tab && styles.modeTabActive]}
                onPress={() => setMode(tab)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modeTabText, mode === tab && styles.modeTabTextActive]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Mode-specific content */}
          {mode === 'timeline' && (
            <>
              <Text style={styles.sectionLabel}>Bins ({project.bins.length})</Text>
              {project.bins.map((bin) => {
                const childAssets = bin.children.reduce(
                  (total, child) => total + child.assets.length, 0,
                );
                return (
                  <View key={bin.id} style={styles.assetRow}>
                    <Text style={styles.assetItem} numberOfLines={1}>
                      {bin.name}
                    </Text>
                    <Text style={styles.assetCount}>
                      {bin.assets.length + childAssets}
                    </Text>
                  </View>
                );
              })}
            </>
          )}

          {mode === 'review' && (
            <>
              <Text style={styles.sectionLabel}>
                Approvals ({project.approvals.length})
              </Text>
              {project.approvals.map((approval) => (
                <View key={approval.id} style={styles.assetRow}>
                  <Text style={styles.assetItem} numberOfLines={1}>
                    {approval.reviewer}
                  </Text>
                  <Text style={[
                    styles.statusBadge,
                    approval.status === 'APPROVED' && styles.statusApproved,
                    approval.status === 'REJECTED' && styles.statusRejected,
                  ]}>
                    {approval.status.toLowerCase().replace(/_/g, ' ')}
                  </Text>
                </View>
              ))}
            </>
          )}

          {mode === 'script' && (
            <>
              <Text style={styles.sectionLabel}>
                Transcript ({project.transcript.length} cues)
              </Text>
              {project.transcript.slice(0, 8).map((cue) => (
                <View key={cue.id} style={styles.cueRow}>
                  <Text style={styles.cueSpeaker}>{cue.speaker}</Text>
                  <Text style={styles.cueText} numberOfLines={2}>
                    {cue.text}
                  </Text>
                </View>
              ))}
              {project.transcript.length > 8 && (
                <Text style={styles.moreText}>
                  +{project.transcript.length - 8} more cues
                </Text>
              )}
            </>
          )}

          {mode === 'publish' && (
            <>
              <Text style={styles.sectionLabel}>
                Deliverables ({project.publishJobs.length})
              </Text>
              {project.publishJobs.map((job) => (
                <View key={job.id} style={styles.assetRow}>
                  <Text style={styles.assetItem} numberOfLines={1}>
                    {job.label}
                  </Text>
                  <Text style={styles.assetCount}>
                    {job.status.toLowerCase()}
                  </Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>

        {/* Preview canvas */}
        <View style={styles.preview}>
          <View style={styles.previewCanvas}>
            <Text style={styles.previewLabel}>
              {mode === 'timeline'
                ? `${clipCount} clips in timeline`
                : mode === 'review'
                  ? `${project.reviewComments.length} review notes`
                  : mode === 'script'
                    ? `${project.transcript.length} transcript cues`
                    : `${project.publishJobs.length} delivery jobs`}
            </Text>
            <Text style={styles.previewSubLabel}>
              {mode === 'timeline'
                ? `${assets.length} assets available`
                : mode === 'review'
                  ? 'Mobile approval and annotation workspace'
                  : mode === 'script'
                    ? 'Transcript-led rough cut companion'
                    : 'Queue and destination overview'}
            </Text>
            {mode === 'timeline' && totalDuration > 0 && (
              <Text style={styles.previewDuration}>
                Duration: {formatTimecode(totalDuration, project.settings.frameRate)}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Timeline / feed area */}
      <View style={styles.timeline}>
        <View style={styles.timelineHeader}>
          <Text style={styles.panelTitle}>
            {mode === 'timeline' ? 'Timeline' : mode === 'review' ? 'Review Feed' : mode === 'script' ? 'Script Cues' : 'Publish Queue'}
          </Text>
          <Text style={styles.trackCount}>
            {mode === 'timeline'
              ? `${project.tracks.length} tracks`
              : mode === 'review'
                ? `${project.reviewComments.length} notes`
                : mode === 'script'
                  ? `${project.transcript.length} cues`
                  : `${project.publishJobs.length} jobs`}
          </Text>
        </View>

        <ScrollView horizontal={mode === 'timeline'} showsHorizontalScrollIndicator={false}>
          <View style={styles.timelineContent}>
            {mode === 'timeline' && project.tracks.map((track) => (
              <View key={track.id} style={styles.timelineTrack}>
                <Text style={styles.trackLabel}>{track.name}</Text>
                <View style={styles.clipIndicators}>
                  {track.clips.slice(0, 12).map((clip) => (
                    <View
                      key={clip.id}
                      style={[
                        styles.clipBlock,
                        track.type === 'audio' && styles.clipBlockAudio,
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.trackMeta}>{track.clips.length} clips</Text>
              </View>
            ))}

            {mode === 'review' && project.reviewComments.map((comment) => (
              <View key={comment.id} style={styles.feedCard}>
                <View style={styles.feedHeader}>
                  <Text style={styles.trackLabel}>{comment.author}</Text>
                  <Text style={[
                    styles.statusBadge,
                    comment.status === 'RESOLVED' && styles.statusApproved,
                  ]}>
                    {comment.status.toLowerCase()}
                  </Text>
                </View>
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
                <Text style={styles.feedText}>
                  {job.preset} {' \u00b7 '} {job.destination} {' \u00b7 '} {job.status.toLowerCase()}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Quick actions */}
        <View style={styles.quickActions}>
          {['Marker', 'AI Action', 'Trim', 'Approve'].map((action) => (
            <TouchableOpacity key={action} style={styles.quickAction} activeOpacity={0.7}>
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
  centered: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: '#94a3b8', fontSize: 14, marginTop: 12 },
  errorTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  errorSubtitle: { color: '#94a3b8', fontSize: 14, textAlign: 'center' },

  // Toolbar
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
  saveBtn: { backgroundColor: '#065f46' },
  exportBtn: { backgroundColor: '#6366f1' },
  toolBtnText: { color: '#f1f5f9', fontSize: 13, fontWeight: '500' },
  timecodeDisplay: {
    color: '#94a3b8',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontFamily: 'Menlo',
    marginLeft: 4,
  },

  // Workspace
  workspace: { flex: 1, flexDirection: 'row' },
  assetPanel: {
    backgroundColor: '#161f2e',
    borderRightWidth: 1,
    borderRightColor: '#334155',
    padding: 12,
  },
  panelTitle: { color: '#f1f5f9', fontWeight: '600', fontSize: 13, marginBottom: 8 },
  panelMeta: { color: '#94a3b8', fontSize: 11, marginBottom: 12 },
  sectionLabel: {
    color: '#64748b',
    fontSize: 10,
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  assetItem: { color: '#cbd5e1', fontSize: 12, flex: 1 },
  assetCount: { color: '#64748b', fontSize: 11, marginLeft: 8 },
  statusBadge: {
    color: '#94a3b8',
    fontSize: 10,
    textTransform: 'capitalize',
  },
  statusApproved: { color: '#4ade80' },
  statusRejected: { color: '#f87171' },
  cueRow: { marginBottom: 10 },
  cueSpeaker: { color: '#818cf8', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  cueText: { color: '#cbd5e1', fontSize: 12, lineHeight: 16 },
  moreText: { color: '#64748b', fontSize: 11, marginTop: 4, fontStyle: 'italic' },

  // Mode tabs
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

  // Preview
  preview: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  previewCanvas: {
    width: '90%',
    aspectRatio: 16 / 9,
    backgroundColor: '#080e1a',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  previewLabel: { color: '#e2e8f0', fontSize: 16, fontWeight: '600' },
  previewSubLabel: { color: '#64748b', fontSize: 12, marginTop: 8 },
  previewDuration: { color: '#818cf8', fontSize: 11, marginTop: 12, fontVariant: ['tabular-nums'] },

  // Timeline
  timeline: {
    height: 200,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    padding: 12,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  trackCount: { color: '#64748b', fontSize: 11 },
  timelineContent: { gap: 8 },
  timelineTrack: {
    height: 40,
    backgroundColor: '#334155',
    borderRadius: 4,
    minWidth: 620,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  clipIndicators: { flexDirection: 'row', gap: 2, flex: 1, marginHorizontal: 8 },
  clipBlock: {
    width: 12,
    height: 20,
    backgroundColor: '#6366f1',
    borderRadius: 2,
    opacity: 0.7,
  },
  clipBlockAudio: { backgroundColor: '#22c55e' },
  trackLabel: { color: '#e2e8f0', fontSize: 12, fontWeight: '600' },
  trackMeta: { color: '#94a3b8', fontSize: 11 },
  feedCard: {
    backgroundColor: '#334155',
    borderRadius: 8,
    padding: 12,
    minWidth: 280,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  feedText: { color: '#cbd5e1', fontSize: 12, marginTop: 6, lineHeight: 18 },

  // Quick actions
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  quickAction: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  quickActionText: { color: '#e2e8f0', fontSize: 11, fontWeight: '600' },
});
