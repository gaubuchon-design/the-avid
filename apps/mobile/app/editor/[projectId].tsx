import React, { useEffect, useMemo, useState, useCallback, useRef, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  Platform,
  Pressable,
  BackHandler,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { flattenAssets } from '@mcua/core';
import type {
  EditorProject,
  EditorTrack,
  EditorBin,
  EditorReviewComment,
  EditorTranscriptCue,
  EditorPublishJob,
  EditorApproval,
} from '@mcua/core';
import { useAppTheme } from '../_layout';
import type { AppTheme } from '../_layout';
import { getProjectFromRepository, saveProjectToRepository } from '../lib/projectRepository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EditorMode = 'timeline' | 'review' | 'script' | 'publish';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimecode(seconds: number, frameRate = 30): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * frameRate);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Loading indicator shown while the project is being fetched. */
function EditorLoading({ theme }: { theme: AppTheme }) {
  return (
    <View
      style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading project"
    >
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
        Loading project...
      </Text>
    </View>
  );
}

/** Error screen with retry button. */
function EditorError({
  message,
  onRetry,
  onBack,
  theme,
}: {
  message: string;
  onRetry: () => void;
  onBack: () => void;
  theme: AppTheme;
}) {
  return (
    <View
      style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}
      accessibilityRole="alert"
    >
      <Text style={[styles.errorTitle, { color: theme.colors.text }]}>{message}</Text>
      <Text style={[styles.errorSubtitle, { color: theme.colors.textSecondary }]}>
        The project may have been deleted or moved.
      </Text>
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [
          styles.retryBtn,
          { backgroundColor: theme.colors.primaryContainer, opacity: pressed ? 0.7 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Retry loading project"
      >
        <Text style={[styles.retryBtnText, { color: theme.colors.primary }]}>Retry</Text>
      </Pressable>
      <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
        <Text style={styles.backButtonText}>Back to Projects</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Toolbar at the top of the editor workspace. */
function EditorToolbar({
  project,
  saving,
  onSave,
  onExport,
  theme,
}: {
  project: EditorProject;
  saving: boolean;
  onSave: () => void;
  onExport: () => void;
  theme: AppTheme;
}) {
  return (
    <View style={[styles.toolbar, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
      <TouchableOpacity
        style={[styles.toolBtn, { backgroundColor: theme.colors.border }]}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Play"
      >
        <Text style={[styles.toolBtnText, { color: theme.colors.text }]}>{'\u25B6'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.toolBtn, { backgroundColor: theme.colors.border }]}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Stop"
      >
        <Text style={[styles.toolBtnText, { color: theme.colors.text }]}>{'\u23F9'}</Text>
      </TouchableOpacity>
      <Text
        style={[
          styles.timecodeDisplay,
          { color: theme.colors.textSecondary },
        ]}
        accessibilityLabel={`Timecode ${formatTimecode(0, project.settings.frameRate)}`}
      >
        {formatTimecode(0, project.settings.frameRate)}
      </Text>

      <View style={styles.toolbarSpacer} />

      {project.tokenBalance > 0 && (
        <View
          style={[styles.toolBtn, { backgroundColor: theme.colors.border }]}
          accessibilityLabel={`${project.tokenBalance} AI tokens remaining`}
        >
          <Text style={[styles.toolBtnText, { color: theme.colors.text }]}>
            {project.tokenBalance} AI
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.toolBtn, styles.saveBtn]}
        onPress={onSave}
        disabled={saving}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={saving ? 'Saving project' : 'Save project'}
        accessibilityState={{ busy: saving }}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.toolBtnText}>Save</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.toolBtn, { backgroundColor: theme.colors.primary }]}
        onPress={onExport}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Export project"
      >
        <Text style={styles.toolBtnText}>Export</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Side panel showing bins / review / script / publish content. */
function AssetPanel({
  project,
  mode,
  setMode,
  panelWidth,
  theme,
}: {
  project: EditorProject;
  mode: EditorMode;
  setMode: (m: EditorMode) => void;
  panelWidth: number;
  theme: AppTheme;
}) {
  return (
    <ScrollView
      style={[
        styles.assetPanel,
        {
          width: panelWidth,
          backgroundColor: theme.colors.surfaceAlt,
          borderRightColor: theme.colors.border,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.panelTitle, { color: theme.colors.text }]} numberOfLines={1}>
        {project.name}
      </Text>
      <Text style={[styles.panelMeta, { color: theme.colors.textSecondary }]}>
        {project.settings.width}x{project.settings.height} {'\u00b7'} {project.settings.frameRate}fps
      </Text>

      {/* Mode tabs */}
      <View style={styles.modeTabs} accessibilityRole="tablist">
        {(['timeline', 'review', 'script', 'publish'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.modeTab,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
              mode === tab && { backgroundColor: theme.colors.primaryContainer, borderColor: theme.colors.primary },
            ]}
            onPress={() => setMode(tab)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === tab }}
            accessibilityLabel={`${tab} mode`}
          >
            <Text
              style={[
                styles.modeTabText,
                { color: theme.colors.textSecondary },
                mode === tab && { color: theme.colors.text, fontWeight: '600' },
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Mode-specific content */}
      {mode === 'timeline' && (
        <TimelinePanelContent bins={project.bins} theme={theme} />
      )}
      {mode === 'review' && (
        <ReviewPanelContent approvals={project.approvals} theme={theme} />
      )}
      {mode === 'script' && (
        <ScriptPanelContent transcript={project.transcript} theme={theme} />
      )}
      {mode === 'publish' && (
        <PublishPanelContent jobs={project.publishJobs} theme={theme} />
      )}
    </ScrollView>
  );
}

function TimelinePanelContent({ bins, theme }: { bins: EditorBin[]; theme: AppTheme }) {
  return (
    <>
      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        Bins ({bins.length})
      </Text>
      {bins.map((bin) => {
        const childAssets = bin.children.reduce(
          (total, child) => total + child.assets.length,
          0,
        );
        return (
          <View key={bin.id} style={styles.assetRow}>
            <Text style={[styles.assetItem, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {bin.name}
            </Text>
            <Text style={[styles.assetCount, { color: theme.colors.textMuted }]}>
              {bin.assets.length + childAssets}
            </Text>
          </View>
        );
      })}
    </>
  );
}

function ReviewPanelContent({ approvals, theme }: { approvals: EditorApproval[]; theme: AppTheme }) {
  return (
    <>
      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        Approvals ({approvals.length})
      </Text>
      {approvals.length === 0 && (
        <Text style={[styles.emptyHint, { color: theme.colors.textMuted }]}>No approvals yet</Text>
      )}
      {approvals.map((approval) => (
        <View key={approval.id} style={styles.assetRow}>
          <Text style={[styles.assetItem, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {approval.reviewer}
          </Text>
          <Text
            style={[
              styles.statusBadge,
              { color: theme.colors.textSecondary },
              approval.status === 'APPROVED' && { color: theme.colors.success },
              approval.status === 'CHANGES_REQUESTED' && { color: theme.colors.error },
            ]}
          >
            {approval.status.toLowerCase().replace(/_/g, ' ')}
          </Text>
        </View>
      ))}
    </>
  );
}

function ScriptPanelContent({ transcript, theme }: { transcript: EditorTranscriptCue[]; theme: AppTheme }) {
  const MAX_VISIBLE = 8;
  return (
    <>
      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        Transcript ({transcript.length} cues)
      </Text>
      {transcript.length === 0 && (
        <Text style={[styles.emptyHint, { color: theme.colors.textMuted }]}>No transcript cues</Text>
      )}
      {transcript.slice(0, MAX_VISIBLE).map((cue) => (
        <View key={cue.id} style={styles.cueRow}>
          <Text style={[styles.cueSpeaker, { color: theme.colors.primary }]}>{cue.speaker}</Text>
          <Text style={[styles.cueText, { color: theme.colors.textSecondary }]} numberOfLines={2}>
            {cue.text}
          </Text>
        </View>
      ))}
      {transcript.length > MAX_VISIBLE && (
        <Text style={[styles.moreText, { color: theme.colors.textMuted }]}>
          +{transcript.length - MAX_VISIBLE} more cues
        </Text>
      )}
    </>
  );
}

function PublishPanelContent({ jobs, theme }: { jobs: EditorPublishJob[]; theme: AppTheme }) {
  return (
    <>
      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        Deliverables ({jobs.length})
      </Text>
      {jobs.length === 0 && (
        <Text style={[styles.emptyHint, { color: theme.colors.textMuted }]}>No delivery jobs</Text>
      )}
      {jobs.map((job) => (
        <View key={job.id} style={styles.assetRow}>
          <Text style={[styles.assetItem, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {job.label}
          </Text>
          <Text style={[styles.assetCount, { color: theme.colors.textMuted }]}>
            {job.status.toLowerCase()}
          </Text>
        </View>
      ))}
    </>
  );
}

/** Preview canvas. */
function PreviewArea({
  project,
  mode,
  clipCount,
  assetCount,
  totalDuration,
  theme,
}: {
  project: EditorProject;
  mode: EditorMode;
  clipCount: number;
  assetCount: number;
  totalDuration: number;
  theme: AppTheme;
}) {
  const previewLabel = useMemo(() => {
    switch (mode) {
      case 'timeline': return `${clipCount} clips in timeline`;
      case 'review': return `${project.reviewComments.length} review notes`;
      case 'script': return `${project.transcript.length} transcript cues`;
      case 'publish': return `${project.publishJobs.length} delivery jobs`;
    }
  }, [mode, clipCount, project]);

  const previewSubLabel = useMemo(() => {
    switch (mode) {
      case 'timeline': return `${assetCount} assets available`;
      case 'review': return 'Mobile approval and annotation workspace';
      case 'script': return 'Transcript-led rough cut companion';
      case 'publish': return 'Queue and destination overview';
    }
  }, [mode, assetCount]);

  return (
    <View style={styles.preview} accessibilityRole="image" accessibilityLabel={previewLabel}>
      <View
        style={[
          styles.previewCanvas,
          { backgroundColor: theme.dark ? '#080e1a' : '#e2e8f0', borderColor: theme.colors.border },
        ]}
      >
        <Text style={[styles.previewLabel, { color: theme.colors.text }]}>
          {previewLabel}
        </Text>
        <Text style={[styles.previewSubLabel, { color: theme.colors.textMuted }]}>
          {previewSubLabel}
        </Text>
        {mode === 'timeline' && totalDuration > 0 && (
          <Text style={[styles.previewDuration, { color: theme.colors.primary }]}>
            Duration: {formatTimecode(totalDuration, project.settings.frameRate)}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Timeline / feed area at the bottom of the editor. */
function TimelineArea({
  project,
  mode,
  theme,
  timelineHeight,
}: {
  project: EditorProject;
  mode: EditorMode;
  theme: AppTheme;
  timelineHeight: number;
}) {
  const headerLabels: Record<EditorMode, string> = {
    timeline: 'Timeline',
    review: 'Review Feed',
    script: 'Script Cues',
    publish: 'Publish Queue',
  };
  const countLabels: Record<EditorMode, string> = {
    timeline: `${project.tracks.length} tracks`,
    review: `${project.reviewComments.length} notes`,
    script: `${project.transcript.length} cues`,
    publish: `${project.publishJobs.length} jobs`,
  };

  return (
    <View
      style={[
        styles.timeline,
        {
          height: timelineHeight,
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.timelineHeader}>
        <Text style={[styles.panelTitle, { color: theme.colors.text }]}>
          {headerLabels[mode]}
        </Text>
        <Text style={[styles.trackCount, { color: theme.colors.textMuted }]}>
          {countLabels[mode]}
        </Text>
      </View>

      <ScrollView
        horizontal={mode === 'timeline'}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={mode !== 'timeline'}
      >
        <View style={styles.timelineContent}>
          {mode === 'timeline' && project.tracks.map((track) => (
            <TimelineTrackRow key={track.id} track={track} theme={theme} />
          ))}

          {mode === 'review' && project.reviewComments.map((comment) => (
            <ReviewCommentCard key={comment.id} comment={comment} theme={theme} />
          ))}

          {mode === 'script' && project.transcript.map((cue) => (
            <TranscriptCueCard key={cue.id} cue={cue} theme={theme} />
          ))}

          {mode === 'publish' && project.publishJobs.map((job) => (
            <PublishJobCard key={job.id} job={job} theme={theme} />
          ))}
        </View>
      </ScrollView>

      {/* Quick actions */}
      <View style={styles.quickActions}>
        {['Marker', 'AI Action', 'Trim', 'Approve'].map((action) => (
          <TouchableOpacity
            key={action}
            style={[
              styles.quickAction,
              { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
            ]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={action}
          >
            <Text style={[styles.quickActionText, { color: theme.colors.text }]}>{action}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const TimelineTrackRow = memo(function TimelineTrackRow({ track, theme }: { track: EditorTrack; theme: AppTheme }) {
  return (
    <View
      style={[styles.timelineTrack, { backgroundColor: theme.colors.border }]}
      accessibilityLabel={`${track.name}: ${track.clips.length} clips`}
    >
      <Text style={[styles.trackLabel, { color: theme.colors.text }]}>{track.name}</Text>
      <View style={styles.clipIndicators}>
        {track.clips.slice(0, 12).map((clip) => (
          <View
            key={clip.id}
            style={[
              styles.clipBlock,
              { backgroundColor: theme.colors.primary },
              track.type === 'AUDIO' && { backgroundColor: theme.colors.success },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.trackMeta, { color: theme.colors.textSecondary }]}>
        {track.clips.length} clips
      </Text>
    </View>
  );
});

const ReviewCommentCard = memo(function ReviewCommentCard({ comment, theme }: { comment: EditorReviewComment; theme: AppTheme }) {
  return (
    <View style={[styles.feedCard, { backgroundColor: theme.colors.border }]}>
      <View style={styles.feedHeader}>
        <Text style={[styles.trackLabel, { color: theme.colors.text }]}>{comment.author}</Text>
        <Text
          style={[
            styles.statusBadge,
            { color: theme.colors.textSecondary },
            comment.status === 'RESOLVED' && { color: theme.colors.success },
          ]}
        >
          {comment.status.toLowerCase()}
        </Text>
      </View>
      <Text style={[styles.feedText, { color: theme.colors.textSecondary }]} numberOfLines={3}>
        {comment.body}
      </Text>
    </View>
  );
});

const TranscriptCueCard = memo(function TranscriptCueCard({ cue, theme }: { cue: EditorTranscriptCue; theme: AppTheme }) {
  return (
    <View style={[styles.feedCard, { backgroundColor: theme.colors.border }]}>
      <Text style={[styles.trackLabel, { color: theme.colors.text }]}>{cue.speaker}</Text>
      <Text style={[styles.feedText, { color: theme.colors.textSecondary }]} numberOfLines={3}>
        {cue.text}
      </Text>
    </View>
  );
});

const PublishJobCard = memo(function PublishJobCard({ job, theme }: { job: EditorPublishJob; theme: AppTheme }) {
  return (
    <View style={[styles.feedCard, { backgroundColor: theme.colors.border }]}>
      <Text style={[styles.trackLabel, { color: theme.colors.text }]}>{job.label}</Text>
      <Text style={[styles.feedText, { color: theme.colors.textSecondary }]}>
        {job.preset} {'\u00b7'} {job.destination} {'\u00b7'} {job.status.toLowerCase()}
      </Text>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Main editor screen
// ---------------------------------------------------------------------------

export default function EditorScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const theme = useAppTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const isCompact = screenWidth < 700;
  const isLandscape = screenWidth > screenHeight;

  const [project, setProject] = useState<EditorProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('timeline');
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const loadAttemptRef = useRef(0);

  const resolvedProjectId = Array.isArray(projectId) ? projectId[0] : projectId;

  // ---- Load project ---------------------------------------------------------

  const loadProject = useCallback(async () => {
    if (!resolvedProjectId) {
      setError('No project ID provided');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    loadAttemptRef.current += 1;

    try {
      const nextProject = await getProjectFromRepository(resolvedProjectId);
      if (!nextProject) {
        setError('Project not found');
      } else {
        setProject(nextProject);
        setHasUnsavedChanges(false);
        navigation.setOptions({ title: nextProject.name });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load project';
      setError(message);
      console.error('[EditorScreen] Load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [resolvedProjectId, navigation]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  // ---- Derived data ---------------------------------------------------------

  const assets = useMemo(
    () => (project ? flattenAssets(project.bins) : []),
    [project],
  );
  const clipCount = useMemo(
    () => project?.tracks.reduce((total, track) => total + track.clips.length, 0) ?? 0,
    [project],
  );
  const totalDuration = useMemo(() => {
    if (!project) return 0;
    return project.tracks.reduce((max, track) => {
      const trackEnd = track.clips.reduce(
        (end, clip) => Math.max(end, clip.endTime),
        0,
      );
      return Math.max(max, trackEnd);
    }, 0);
  }, [project]);

  // ---- Save -----------------------------------------------------------------

  const handleSave = useCallback(async () => {
    if (!project || saving) return;
    setSaving(true);
    try {
      const saved = await saveProjectToRepository(project);
      setProject(saved);
      setHasUnsavedChanges(false);
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

  // ---- Unsaved changes guard ------------------------------------------------

  const confirmDiscardOrSave = useCallback((): boolean => {
    if (!hasUnsavedChanges) return true;

    Alert.alert(
      'Unsaved Changes',
      'You have unsaved changes. What would you like to do?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setHasUnsavedChanges(false);
            if (router.canGoBack()) {
              router.back();
            }
          },
        },
        {
          text: 'Save & Exit',
          onPress: async () => {
            await handleSave();
            if (router.canGoBack()) {
              router.back();
            }
          },
        },
      ],
    );
    return false;
  }, [hasUnsavedChanges, router, handleSave]);

  // Android hardware back button
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (hasUnsavedChanges) {
        confirmDiscardOrSave();
        return true; // prevent default back
      }
      return false; // allow default back
    });

    return () => subscription.remove();
  }, [hasUnsavedChanges, confirmDiscardOrSave]);

  // Intercept navigation back gesture (iOS / header back button)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      confirmDiscardOrSave();
    });
    return unsubscribe;
  }, [navigation, hasUnsavedChanges, confirmDiscardOrSave]);

  // ---- Responsive layout values ---------------------------------------------

  const assetPanelWidth = isCompact ? 140 : 190;
  const timelineHeight = isLandscape ? Math.max(160, screenHeight * 0.28) : 200;

  // ---- Render ---------------------------------------------------------------

  if (loading) {
    return <EditorLoading theme={theme} />;
  }

  if (error || !project) {
    return (
      <EditorError
        message={error ?? 'Project not found'}
        onRetry={loadProject}
        onBack={() => router.back()}
        theme={theme}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <EditorToolbar
        project={project}
        saving={saving}
        onSave={() => { void handleSave(); }}
        onExport={handleExport}
        theme={theme}
      />

      {/* Workspace: side panel + preview */}
      <View style={styles.workspace}>
        <AssetPanel
          project={project}
          mode={mode}
          setMode={setMode}
          panelWidth={assetPanelWidth}
          theme={theme}
        />

        <PreviewArea
          project={project}
          mode={mode}
          clipCount={clipCount}
          assetCount={assets.length}
          totalDuration={totalDuration}
          theme={theme}
        />
      </View>

      <TimelineArea
        project={project}
        mode={mode}
        theme={theme}
        timelineHeight={timelineHeight}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { fontSize: 14, marginTop: 12 },
  errorTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  errorSubtitle: { fontSize: 14, textAlign: 'center', marginBottom: 24 },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: { fontSize: 16, fontWeight: '600' },
  backButton: {
    backgroundColor: '#334155',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  backButtonText: { color: '#f1f5f9', fontWeight: '600', fontSize: 14 },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    padding: 8,
    gap: 8,
  },
  toolBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 40,
    alignItems: 'center',
  },
  saveBtn: { backgroundColor: '#065f46' },
  toolBtnText: { color: '#f1f5f9', fontSize: 13, fontWeight: '500' },
  toolbarSpacer: { flex: 1 },
  timecodeDisplay: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    marginLeft: 4,
  },

  // Workspace
  workspace: { flex: 1, flexDirection: 'row' },
  assetPanel: {
    borderRightWidth: 1,
    padding: 12,
  },
  panelTitle: { fontWeight: '600', fontSize: 13, marginBottom: 8 },
  panelMeta: { fontSize: 11, marginBottom: 12 },
  sectionLabel: {
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
  assetItem: { fontSize: 12, flex: 1 },
  assetCount: { fontSize: 11, marginLeft: 8 },
  emptyHint: { fontSize: 11, fontStyle: 'italic', marginBottom: 6 },
  statusBadge: {
    fontSize: 10,
    textTransform: 'capitalize',
  },
  cueRow: { marginBottom: 10 },
  cueSpeaker: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  cueText: { fontSize: 12, lineHeight: 16 },
  moreText: { fontSize: 11, marginTop: 4, fontStyle: 'italic' },

  // Mode tabs
  modeTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  modeTab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  modeTabText: { fontSize: 11, textTransform: 'capitalize' },

  // Preview
  preview: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  previewCanvas: {
    width: '90%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  previewLabel: { fontSize: 16, fontWeight: '600' },
  previewSubLabel: { fontSize: 12, marginTop: 8 },
  previewDuration: { fontSize: 11, marginTop: 12, fontVariant: ['tabular-nums'] },

  // Timeline
  timeline: {
    borderTopWidth: 1,
    padding: 12,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  trackCount: { fontSize: 11 },
  timelineContent: { gap: 8 },
  timelineTrack: {
    height: 40,
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
    borderRadius: 2,
    opacity: 0.7,
  },
  trackLabel: { fontSize: 12, fontWeight: '600' },
  trackMeta: { fontSize: 11 },
  feedCard: {
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
  feedText: { fontSize: 12, marginTop: 6, lineHeight: 18 },

  // Quick actions
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  quickAction: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  quickActionText: { fontSize: 11, fontWeight: '600' },
});
