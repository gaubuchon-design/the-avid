import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { flattenAssets } from '@mcua/core';
import type { EditorProject } from '@mcua/core';
import { getProjectFromRepository } from '../lib/projectRepository';

export default function EditorScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const [project, setProject] = useState<EditorProject | null>(null);
  const [mode, setMode] = useState<'timeline' | 'review' | 'script' | 'publish'>('timeline');
  const resolvedProjectId = Array.isArray(projectId) ? projectId[0] : projectId;

  useEffect(() => {
    if (!resolvedProjectId) {
      return;
    }
    void getProjectFromRepository(resolvedProjectId).then((nextProject) => {
      setProject(nextProject);
    });
  }, [resolvedProjectId]);

  const assets = useMemo(() => (project ? flattenAssets(project.bins) : []), [project]);
  const clipCount = project ? project.tracks.reduce((total, track) => total + track.clips.length, 0) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolBtn}><Text style={styles.toolBtnText}>▶</Text></TouchableOpacity>
        <TouchableOpacity style={styles.toolBtn}><Text style={styles.toolBtnText}>⏹</Text></TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.toolBtn}><Text style={styles.toolBtnText}>{project?.tokenBalance ?? 0} AI</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.toolBtn, styles.exportBtn]}>
          <Text style={styles.toolBtnText}>Export</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.workspace}>
        <View style={styles.assetPanel}>
          <Text style={styles.panelTitle}>{project?.name ?? 'Project'}</Text>
          <Text style={styles.panelMeta}>{project?.settings.width}x{project?.settings.height} · {project?.settings.frameRate}fps</Text>
          <View style={styles.modeTabs}>
            {(['timeline', 'review', 'script', 'publish'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.modeTab, mode === tab && styles.modeTabActive]}
                onPress={() => setMode(tab)}
              >
                <Text style={[styles.modeTabText, mode === tab && styles.modeTabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {mode === 'timeline' && (
            <>
              <Text style={styles.sectionLabel}>Bins</Text>
              {project?.bins.map((bin) => (
                <Text key={bin.id} style={styles.assetItem}>{bin.name} · {bin.assets.length + bin.children.reduce((total, child) => total + child.assets.length, 0)}</Text>
              ))}
            </>
          )}
          {mode === 'review' && (
            <>
              <Text style={styles.sectionLabel}>Approvals</Text>
              {project?.approvals.map((approval) => (
                <Text key={approval.id} style={styles.assetItem}>{approval.reviewer} · {approval.status.toLowerCase().replaceAll('_', ' ')}</Text>
              ))}
            </>
          )}
          {mode === 'script' && (
            <>
              <Text style={styles.sectionLabel}>Transcript</Text>
              {project?.transcript.slice(0, 6).map((cue) => (
                <Text key={cue.id} style={styles.assetItem}>{cue.speaker}: {cue.text}</Text>
              ))}
            </>
          )}
          {mode === 'publish' && (
            <>
              <Text style={styles.sectionLabel}>Deliverables</Text>
              {project?.publishJobs.map((job) => (
                <Text key={job.id} style={styles.assetItem}>{job.label} · {job.status.toLowerCase()}</Text>
              ))}
            </>
          )}
        </View>

        <View style={styles.preview}>
          <View style={styles.previewCanvas}>
            <Text style={styles.previewLabel}>
              {mode === 'timeline' ? `${clipCount} clips in timeline` : mode === 'review' ? `${project?.reviewComments.length ?? 0} review notes` : mode === 'script' ? `${project?.transcript.length ?? 0} transcript cues` : `${project?.publishJobs.length ?? 0} delivery jobs`}
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
          <View style={{ gap: 8 }}>
            {mode === 'timeline' && project?.tracks.map((track) => (
              <View key={track.id} style={styles.timelineTrack}>
                <Text style={styles.trackLabel}>{track.name}</Text>
                <Text style={styles.trackMeta}>{track.clips.length} clips</Text>
              </View>
            ))}
            {mode === 'review' && project?.reviewComments.map((comment) => (
              <View key={comment.id} style={styles.feedCard}>
                <Text style={styles.trackLabel}>{comment.author} · {comment.status.toLowerCase()}</Text>
                <Text style={styles.feedText}>{comment.body}</Text>
              </View>
            ))}
            {mode === 'script' && project?.transcript.map((cue) => (
              <View key={cue.id} style={styles.feedCard}>
                <Text style={styles.trackLabel}>{cue.speaker}</Text>
                <Text style={styles.feedText}>{cue.text}</Text>
              </View>
            ))}
            {mode === 'publish' && project?.publishJobs.map((job) => (
              <View key={job.id} style={styles.feedCard}>
                <Text style={styles.trackLabel}>{job.label}</Text>
                <Text style={styles.feedText}>{job.preset} · {job.destination} · {job.status.toLowerCase()}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={styles.quickActions}>
          {['Marker', 'AI Action', 'Trim', 'Approve'].map((action) => (
            <TouchableOpacity key={action} style={styles.quickAction}>
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
  exportBtn: {
    backgroundColor: '#6366f1',
  },
  toolBtnText: { color: '#f1f5f9', fontSize: 13 },
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
  sectionLabel: { color: '#64748b', fontSize: 10, marginBottom: 6, textTransform: 'uppercase' },
  assetItem: { color: '#cbd5e1', fontSize: 12, marginBottom: 6 },
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
  previewLabel: { color: '#e2e8f0', fontSize: 16, fontWeight: '600' },
  previewSubLabel: { color: '#64748b', fontSize: 12, marginTop: 8 },
  timeline: {
    height: 180,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    padding: 12,
  },
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
