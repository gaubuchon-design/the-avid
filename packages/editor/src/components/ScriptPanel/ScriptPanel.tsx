import React, { useMemo, useRef, useState } from 'react';
import { flattenAssets } from '@mcua/core';
import { useEditorStore, type TranscriptCue, type ScriptDocumentLine } from '../../store/editor.store';
import { useUserSettingsStore } from '../../store/userSettings.store';
import {
  buildScriptDocumentFromText,
  buildScriptDocumentFromTranscript,
  phraseFindTranscriptWorkbench,
} from '../../lib/transcriptWorkbench';
import { importScriptDocument, importTranscriptDocument } from '../../lib/transcriptImport';
import { transcribeMediaAsset } from '../../lib/transcriptionClient';

const DEMO_SCRIPT = `SARAH: We need to talk about the project deadline.

MARCUS: I know. It's tomorrow.

SARAH: Can we get it done in time?

MARCUS: If we work together, absolutely. Let's start with the opening.

SARAH: Look at that sunset. Perfect for the opening sequence.

MARCUS: We should use the wide shot first. Then cut to the close-up for the reaction.`;

type JobState = 'idle' | 'running' | 'completed' | 'failed';
type EditMode = 'insert' | 'overwrite';

function formatTimecode(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function normalizeLanguage(language: string | undefined): string {
  return language?.trim() || 'und';
}

export function ScriptPanel() {
  const [query, setQuery] = useState('');
  const [selectedCueIds, setSelectedCueIds] = useState<string[]>([]);
  const [jobState, setJobState] = useState<JobState>('idle');
  const [jobMessage, setJobMessage] = useState('Ready to transcribe, import, and build paper edits.');
  const [jobWarnings, setJobWarnings] = useState<string[]>([]);
  const transcriptInputRef = useRef<HTMLInputElement | null>(null);
  const scriptInputRef = useRef<HTMLInputElement | null>(null);

  const {
    bins,
    transcript,
    transcriptSpeakers,
    scriptDocument,
    sourceAsset,
    transcriptionSettings,
    setPlayhead,
    setSourceAsset,
    setSourcePlayhead,
    setSourceInPoint,
    setSourceOutPoint,
    clearSourceInOut,
    overwriteEdit,
    insertEdit,
    updateTranscriptCue,
    replaceTranscript,
    setScriptDocument,
    updateScriptDocumentText,
    syncScriptDocumentToTranscript,
    updateTranscriptionSettings,
    buildTranscriptTitleEffects,
  } = useEditorStore();
  const aiSettings = useUserSettingsStore((state) => ({
    transcriptionProvider: state.settings.transcriptionProvider,
    translationProvider: state.settings.translationProvider,
    transcriptionLanguageMode: state.settings.transcriptionLanguageMode,
    transcriptionLanguage: state.settings.transcriptionLanguage,
    transcriptionTargetLanguage: state.settings.transcriptionTargetLanguage,
    enableTranscriptionDiarization: state.settings.enableTranscriptionDiarization,
    enableSpeakerIdentification: state.settings.enableSpeakerIdentification,
  }));

  const allAssets = useMemo(() => flattenAssets(bins), [bins]);
  const assetMap = useMemo(() => {
    return new Map(allAssets.map((asset) => [asset.id, asset] as const));
  }, [allAssets]);

  const transcriptionCandidate = useMemo(() => {
    if (sourceAsset && (sourceAsset.type === 'VIDEO' || sourceAsset.type === 'AUDIO')) {
      return sourceAsset;
    }

    return allAssets.find((asset) => (
      (asset.type === 'VIDEO' || asset.type === 'AUDIO')
      && asset.status !== 'ERROR'
      && asset.status !== 'OFFLINE'
    )) ?? null;
  }, [allAssets, sourceAsset]);

  const phraseFindResults = useMemo(() => {
    return phraseFindTranscriptWorkbench(query, transcript, scriptDocument);
  }, [query, scriptDocument, transcript]);

  const activeTranscript = query.trim()
    ? phraseFindResults
        .filter((result) => result.kind === 'transcript')
        .map((result) => transcript.find((cue) => cue.id === result.linkedCueIds[0]))
        .filter((cue): cue is NonNullable<typeof cue> => Boolean(cue))
    : transcript;

  const linkedCueCount = useMemo(() => {
    return scriptDocument?.lines.reduce((count: number, line: ScriptDocumentLine) => count + (line.linkedCueIds?.length ?? 0), 0) ?? 0;
  }, [scriptDocument]);

  const providerLabel = aiSettings.transcriptionProvider === 'local-faster-whisper'
    ? 'Local faster-whisper'
    : 'Cloud STT';

  const selectedCues = useMemo(() => {
    return selectedCueIds
      .map((cueId) => transcript.find((cue) => cue.id === cueId))
      .filter((cue): cue is TranscriptCue => Boolean(cue));
  }, [selectedCueIds, transcript]);

  function syncGeneratedScriptDocument(nextTranscript: TranscriptCue[]): void {
    if (nextTranscript.length === 0) {
      return;
    }

    if (!scriptDocument || scriptDocument.source === 'GENERATED') {
      setScriptDocument(buildScriptDocumentFromTranscript(nextTranscript, scriptDocument));
    }
  }

  function persistTranscriptionPreferences(language: string): void {
    updateTranscriptionSettings({
      provider: aiSettings.transcriptionProvider,
      language,
    } as any);
  }

  function toggleCueSelection(cueId: string): void {
    setSelectedCueIds((current) => (
      current.includes(cueId)
        ? current.filter((id) => id !== cueId)
        : [...current, cueId]
    ));
  }

  function resolveCueAsset(cue: TranscriptCue) {
    return cue.assetId ? assetMap.get(cue.assetId) ?? null : null;
  }

  function loadCueToSource(cue: TranscriptCue, markRange = false): void {
    const asset = resolveCueAsset(cue);
    if (!asset) {
      setJobState('failed');
      setJobMessage(`Cue "${cue.text.slice(0, 32)}" is not linked to a media asset.`);
      return;
    }

    setPlayhead(cue.startTime);
    setSourceAsset(asset);
    setSourcePlayhead(cue.startTime);

    if (markRange) {
      setSourceInPoint(cue.startTime);
      setSourceOutPoint(cue.endTime);
    } else {
      clearSourceInOut();
    }

    setJobState('completed');
    setJobMessage(`${markRange ? 'Marked' : 'Loaded'} ${asset.name} at ${formatTimecode(cue.startTime)}.`);
  }

  function executeCueEdit(cues: TranscriptCue[], mode: EditMode): void {
    const orderedCues = [...cues].filter((cue) => Boolean(resolveCueAsset(cue)));
    if (orderedCues.length === 0) {
      setJobState('failed');
      setJobMessage('No cue in this selection is linked to editable media.');
      return;
    }

    for (const cue of orderedCues) {
      loadCueToSource(cue, true);
      if (mode === 'insert') {
        insertEdit();
      } else {
        overwriteEdit();
      }
    }

    setJobState('completed');
    setJobMessage(`${mode === 'insert' ? 'Inserted' : 'Overwrote'} ${orderedCues.length} transcript range${orderedCues.length === 1 ? '' : 's'} onto the timeline.`);
  }

  function resolveLineCues(line: ScriptDocumentLine): TranscriptCue[] {
    return (line.linkedCueIds ?? [])
      .map((cueId) => transcript.find((cue) => cue.id === cueId))
      .filter((cue): cue is TranscriptCue => Boolean(cue));
  }

  async function handleTranscribeSource(): Promise<void> {
    if (!transcriptionCandidate) {
      setJobState('failed');
      setJobMessage('Select a source clip first, or import media before transcribing.');
      return;
    }

    setJobState('running');
    setJobWarnings([]);
    setJobMessage(`Transcribing ${transcriptionCandidate.name}...`);

    try {
      const result = await transcribeMediaAsset(transcriptionCandidate, aiSettings);
      replaceTranscript(result.cues, result.speakers);
      persistTranscriptionPreferences(result.detectedLanguage);
      syncGeneratedScriptDocument(result.cues);
      setSelectedCueIds([]);
      setJobState('completed');
      setJobWarnings(result.warnings);
      setJobMessage(`Transcribed ${transcriptionCandidate.name} into ${result.cues.length} cue${result.cues.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setJobState('failed');
      setJobWarnings([]);
      setJobMessage((error as Error).message);
    }
  }

  async function handleTranscriptImport(file: File): Promise<void> {
    setJobState('running');
    setJobWarnings([]);
    setJobMessage(`Importing ${file.name}...`);

    try {
      const imported = importTranscriptDocument({
        fileName: file.name,
        text: await file.text(),
        assetId: sourceAsset?.id,
        defaultLanguage: aiSettings.transcriptionLanguageMode === 'manual'
          ? aiSettings.transcriptionLanguage
          : undefined,
        provider: transcriptionSettings.provider,
      });
      replaceTranscript(imported.cues, imported.speakers);
      syncGeneratedScriptDocument(imported.cues);
      persistTranscriptionPreferences(imported.language);
      setSelectedCueIds([]);
      setJobState('completed');
      setJobMessage(`Imported ${imported.cues.length} transcript cue${imported.cues.length === 1 ? '' : 's'} from ${file.name}.`);
    } catch (error) {
      setJobState('failed');
      setJobMessage(`Transcript import failed: ${(error as Error).message}`);
    }
  }

  async function handleScriptImport(file: File): Promise<void> {
    setJobState('running');
    setJobWarnings([]);
    setJobMessage(`Importing ${file.name}...`);

    try {
      const nextDocument = importScriptDocument(file.name, await file.text(), scriptDocument);
      setScriptDocument(nextDocument);
      setJobState('completed');
      setJobMessage(`Imported script document from ${file.name}.`);
    } catch (error) {
      setJobState('failed');
      setJobMessage(`Script import failed: ${(error as Error).message}`);
    }
  }

  return (
    <div className="scriptsync-workbench">
      <input
        ref={transcriptInputRef}
        className="scriptsync-file-input"
        type="file"
        accept=".json,.srt,.vtt"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = '';
          if (!file) {
            return;
          }
          void handleTranscriptImport(file);
        }}
      />
      <input
        ref={scriptInputRef}
        className="scriptsync-file-input"
        type="file"
        accept=".txt,.md"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = '';
          if (!file) {
            return;
          }
          void handleScriptImport(file);
        }}
      />

      <div className="scriptsync-toolbar">
        <div className="scriptsync-toolbar-copy">
          <div className="scriptsync-title">PhraseFind / ScriptSync</div>
          <div className="scriptsync-subtitle">
            Transcribe, sync, search, and cut directly from text-linked media.
          </div>
        </div>

        <div className="scriptsync-toolbar-actions">
          <span className="scriptsync-pill">{providerLabel}</span>
          <span className="scriptsync-pill">
            {aiSettings.translationProvider === 'local-runtime' ? 'Local translation' : 'Cloud translation'}
          </span>
          <button
            type="button"
            className="tl-btn"
            onClick={() => transcriptInputRef.current?.click()}
          >
            Import Transcript
          </button>
          <button
            type="button"
            className="tl-btn"
            onClick={() => scriptInputRef.current?.click()}
          >
            Import Script
          </button>
          <button
            type="button"
            className="tl-btn"
            onClick={() => updateScriptDocumentText(DEMO_SCRIPT)}
          >
            Load Demo Script
          </button>
          <button
            type="button"
            className="tl-btn"
            onClick={() => {
              if (transcript.length === 0) {
                return;
              }
              setScriptDocument(buildScriptDocumentFromTranscript(transcript, scriptDocument));
              setJobState('completed');
              setJobMessage(`Generated ${transcript.length} script line${transcript.length === 1 ? '' : 's'} from the current transcript.`);
            }}
          >
            Build Script
          </button>
          <button
            type="button"
            className="tl-btn tl-btn--primary"
            onClick={() => {
              void handleTranscribeSource();
            }}
          >
            {jobState === 'running' ? 'Transcribing…' : 'Transcribe Source'}
          </button>
          <button
            type="button"
            className="tl-btn tl-btn--primary"
            onClick={() => syncScriptDocumentToTranscript()}
          >
            Auto-sync Script
          </button>
          <button
            type="button"
            className="tl-btn"
            onClick={() => {
              const created = buildTranscriptTitleEffects({
                useTranslations: true,
                includeSpeakerLabels: false,
              });
              if (created === 0) {
                setJobState('failed');
                setJobMessage('No transcript cues are available to build title overlays.');
                return;
              }
              setJobState('completed');
              setJobMessage(`Built ${created} editable title subtitle${created === 1 ? '' : 's'} from the transcript.`);
            }}
          >
            Build Title Captions
          </button>
        </div>
      </div>

      <div className="scriptsync-searchbar">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="PhraseFind across transcript and script..."
        />
        <div className="scriptsync-search-meta">
          <span>{phraseFindResults.length} hits</span>
          <span>{transcriptSpeakers.length} speakers</span>
          <span>{linkedCueCount} linked ranges</span>
          <span>{selectedCueIds.length} selected</span>
        </div>
      </div>

      <div className="scriptsync-grid">
        <section className="scriptsync-pane scriptsync-pane--transcript">
          <div className="scriptsync-pane-header">
            <div>
              <div className="scriptsync-pane-title">Transcript</div>
              <div className="scriptsync-pane-subtitle">
                {aiSettings.transcriptionLanguageMode === 'manual'
                  ? `Language locked to ${aiSettings.transcriptionLanguage}`
                  : 'Language auto-detect'}
                {' · '}
                {aiSettings.enableTranscriptionDiarization ? 'Diarization on' : 'Diarization off'}
              </div>
            </div>
          </div>

          <div className="scriptsync-pane-body">
            {activeTranscript.length === 0 ? (
              <div className="transcript-empty">No transcript cues yet. Transcribe a source clip or import SRT, VTT, or JSON transcript data.</div>
            ) : (
              activeTranscript.map((cue) => {
                const asset = resolveCueAsset(cue);
                const isSelectedAsset = sourceAsset?.id === asset?.id;
                const isSelectedCue = selectedCueIds.includes(cue.id);

                return (
                  <article
                    key={cue.id}
                    className={`scriptsync-cue-card${isSelectedAsset ? ' is-active' : ''}${isSelectedCue ? ' is-selected' : ''}`}
                  >
                    <div className="scriptsync-cue-meta">
                      <button
                        type="button"
                        className="scriptsync-timecode"
                        onClick={() => loadCueToSource(cue, false)}
                      >
                        {formatTimecode(cue.startTime)}-{formatTimecode(cue.endTime)}
                      </button>
                      <span className="scriptsync-cue-pill">{cue.provider ?? transcriptionSettings.provider}</span>
                    </div>

                    <input
                      type="text"
                      className="scriptsync-cue-speaker"
                      value={cue.speaker}
                      onChange={(event) => updateTranscriptCue(cue.id, { speaker: event.target.value })}
                    />

                    <textarea
                      className="scriptsync-cue-text"
                      value={cue.text}
                      onChange={(event) => updateTranscriptCue(cue.id, { text: event.target.value })}
                    />

                    {cue.translation ? (
                      <div className="scriptsync-cue-translation">
                        {cue.translation}
                      </div>
                    ) : null}

                    <div className="scriptsync-cue-footer">
                      <span>{cue.language ?? 'und'}</span>
                      <span>{cue.linkedScriptLineIds?.length ?? 0} script links</span>
                      {asset?.name && <span className="truncate">{asset.name}</span>}
                    </div>

                    <div className="scriptsync-cue-actions">
                      <button
                        type="button"
                        className="tl-btn"
                        onClick={() => toggleCueSelection(cue.id)}
                      >
                        {isSelectedCue ? 'Deselect' : 'Select'}
                      </button>
                      <button
                        type="button"
                        className="tl-btn"
                        onClick={() => loadCueToSource(cue, false)}
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        className="tl-btn"
                        onClick={() => loadCueToSource(cue, true)}
                      >
                        Mark
                      </button>
                      <button
                        type="button"
                        className="tl-btn"
                        onClick={() => executeCueEdit([cue], 'insert')}
                      >
                        Insert
                      </button>
                      <button
                        type="button"
                        className="tl-btn"
                        onClick={() => executeCueEdit([cue], 'overwrite')}
                      >
                        Overwrite
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="scriptsync-pane scriptsync-pane--script">
          <div className="scriptsync-pane-header">
            <div>
              <div className="scriptsync-pane-title">Script</div>
              <div className="scriptsync-pane-subtitle">
                Editable paper script with linked transcript lines and direct edit actions.
              </div>
            </div>
          </div>

          <div className="scriptsync-script-editor">
            <textarea
              spellCheck={false}
              value={scriptDocument?.text ?? ''}
              onChange={(event) => updateScriptDocumentText(event.target.value)}
              placeholder="Paste or type your script here..."
            />
          </div>

          <div className="scriptsync-script-lines">
            {(scriptDocument?.lines ?? []).map((line) => {
              const linkedCues = resolveLineCues(line);
              return (
                <div key={line.id} className="scriptsync-script-line">
                  <div className="scriptsync-script-line-meta">
                    <span>L{line.lineNumber ?? '?'}</span>
                    <span>{(line.linkedCueIds?.length ?? 0) > 0 ? `${line.linkedCueIds!.length} linked cue${line.linkedCueIds!.length === 1 ? '' : 's'}` : 'Unlinked'}</span>
                  </div>
                  <div className="scriptsync-script-line-text">
                    {line.speaker ? `${line.speaker}: ` : ''}
                    {line.text}
                  </div>
                  <div className="scriptsync-script-line-actions">
                    <button
                      type="button"
                      className="tl-btn"
                      onClick={() => {
                        const firstCue = linkedCues[0];
                        if (firstCue) {
                          loadCueToSource(firstCue, false);
                        }
                      }}
                      disabled={linkedCues.length === 0}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      className="tl-btn"
                      onClick={() => executeCueEdit(linkedCues, 'insert')}
                      disabled={linkedCues.length === 0}
                    >
                      Insert Line
                    </button>
                    <button
                      type="button"
                      className="tl-btn"
                      onClick={() => executeCueEdit(linkedCues, 'overwrite')}
                      disabled={linkedCues.length === 0}
                    >
                      Overwrite Line
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="scriptsync-pane scriptsync-pane--details">
          <div className="scriptsync-pane-header">
            <div>
              <div className="scriptsync-pane-title">Sync Status</div>
              <div className="scriptsync-pane-subtitle">
                Provider status, transcription jobs, and paper-edit actions.
              </div>
            </div>
          </div>

          <div className="scriptsync-pane-body scriptsync-status-list">
            <div className={`scriptsync-status-alert is-${jobState}`}>
              {jobMessage}
            </div>

            {jobWarnings.length > 0 ? (
              <div className="scriptsync-status-card">
                <div className="scriptsync-status-label">Warnings</div>
                <div className="scriptsync-status-value">
                  {jobWarnings.join(' ')}
                </div>
              </div>
            ) : null}

            <div className="scriptsync-status-card">
              <div className="scriptsync-status-label">Transcription</div>
              <div className="scriptsync-status-value">{providerLabel}</div>
            </div>
            <div className="scriptsync-status-card">
              <div className="scriptsync-status-label">Translation</div>
              <div className="scriptsync-status-value">
                {aiSettings.translationProvider === 'local-runtime' ? 'Local runtime' : 'Cloud provider'}
              </div>
            </div>
            <div className="scriptsync-status-card">
              <div className="scriptsync-status-label">Source Clip</div>
              <div className="scriptsync-status-value">
                {transcriptionCandidate?.name ?? 'No media selected'}
              </div>
            </div>
            <div className="scriptsync-status-card">
              <div className="scriptsync-status-label">Speaker Labels</div>
              <div className="scriptsync-status-value">
                {aiSettings.enableSpeakerIdentification ? 'Preserve IDs' : 'Generic labels'}
              </div>
            </div>
            <div className="scriptsync-status-card">
              <div className="scriptsync-status-label">PhraseFind</div>
              <div className="scriptsync-status-value">{query.trim() ? `${phraseFindResults.length} active hits` : 'Ready'}</div>
            </div>
            <div className="scriptsync-status-card">
              <div className="scriptsync-status-label">Script Document</div>
              <div className="scriptsync-status-value">
                {scriptDocument ? `${scriptDocument.lines.length} lines` : 'Not created'}
              </div>
            </div>

            <div className="scriptsync-status-card">
              <div className="scriptsync-status-label">Selected Cues</div>
              <div className="scriptsync-status-value">
                {selectedCues.length === 0 ? 'None selected' : `${selectedCues.length} cue${selectedCues.length === 1 ? '' : 's'} ready`}
              </div>
              <div className="scriptsync-cue-actions">
                <button
                  type="button"
                  className="tl-btn"
                  onClick={() => executeCueEdit(selectedCues, 'insert')}
                  disabled={selectedCues.length === 0}
                >
                  Insert Selection
                </button>
                <button
                  type="button"
                  className="tl-btn"
                  onClick={() => executeCueEdit(selectedCues, 'overwrite')}
                  disabled={selectedCues.length === 0}
                >
                  Overwrite Selection
                </button>
                <button
                  type="button"
                  className="tl-btn"
                  onClick={() => setSelectedCueIds([])}
                  disabled={selectedCues.length === 0}
                >
                  Clear Selection
                </button>
              </div>
            </div>

            <button
              type="button"
              className="tl-btn"
              onClick={() => {
                const next = buildScriptDocumentFromText(scriptDocument?.text ?? DEMO_SCRIPT, scriptDocument);
                setScriptDocument(next);
                setJobState('completed');
                setJobMessage(`Rebuilt ${next.lines.length} script line${next.lines.length === 1 ? '' : 's'} from the current script text.`);
              }}
            >
              Rebuild Script Lines
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
