import React, { useEffect, useMemo, useRef, useState } from 'react';
import { flattenAssets } from '@mcua/core';
import { useEditorStore } from '../../store/editor.store';

type PaletteItem = {
  id: string;
  category: 'Command' | 'Asset' | 'Transcript';
  title: string;
  subtitle: string;
  action: () => void;
};

export function CommandPalette() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const {
    bins,
    transcript,
    isCommandPaletteOpen,
    toggleCommandPalette,
    setActivePanel,
    addMarkerAtPlayhead,
    razorAtPlayhead,
    matchFrame,
    setSourceAsset,
    appendAssetToTimeline,
    setPlayhead,
  } = useEditorStore();

  const items = useMemo<PaletteItem[]>(() => {
    const commands: PaletteItem[] = [
      { id: 'cmd-workspace-edit', category: 'Command', title: 'Switch to Editorial workspace', subtitle: 'Bins + dual monitor + timeline', action: () => setActivePanel('edit') },
      { id: 'cmd-workspace-script', category: 'Command', title: 'Switch to Script workspace', subtitle: 'Transcript-driven editing', action: () => setActivePanel('script') },
      { id: 'cmd-workspace-review', category: 'Command', title: 'Switch to Review workspace', subtitle: 'Approvals and timeline comments', action: () => setActivePanel('review') },
      { id: 'cmd-workspace-publish', category: 'Command', title: 'Switch to Publish workspace', subtitle: 'Export and delivery queue', action: () => setActivePanel('publish') },
      { id: 'cmd-marker', category: 'Command', title: 'Add marker at playhead', subtitle: 'Create a timeline marker on the current frame', action: () => addMarkerAtPlayhead('Command palette marker') },
      { id: 'cmd-razor', category: 'Command', title: 'Razor at playhead', subtitle: 'Split every unlocked clip under the playhead', action: () => razorAtPlayhead() },
      { id: 'cmd-match-frame', category: 'Command', title: 'Match frame', subtitle: 'Load the source clip for the current frame', action: () => matchFrame() },
    ];

    const assetItems: PaletteItem[] = flattenAssets(bins).map((asset) => ({
      id: `asset-${asset.id}`,
      category: 'Asset',
      title: asset.name,
      subtitle: `${asset.type} · ${asset.tags.join(' · ') || 'untagged'} · Load source and append to timeline`,
      action: () => {
        setSourceAsset(asset);
        appendAssetToTimeline(asset.id);
      },
    }));

    const transcriptItems: PaletteItem[] = transcript.map((cue) => ({
      id: `cue-${cue.id}`,
      category: 'Transcript',
      title: cue.text,
      subtitle: `${cue.speaker} · ${cue.source.toLowerCase()} · ${cue.startTime.toFixed(1)}s`,
      action: () => {
        setPlayhead(cue.startTime);
        if (cue.assetId) {
          const asset = flattenAssets(bins).find((item) => item.id === cue.assetId);
          if (asset) {
            setSourceAsset(asset);
          }
        }
      },
    }));

    return [...commands, ...assetItems, ...transcriptItems];
  }, [
    addMarkerAtPlayhead,
    appendAssetToTimeline,
    bins,
    matchFrame,
    razorAtPlayhead,
    setActivePanel,
    setPlayhead,
    setSourceAsset,
    transcript,
  ]);

  const filteredItems = items.filter((item) => {
    if (!query.trim()) {
      return true;
    }
    const needle = query.toLowerCase();
    return item.title.toLowerCase().includes(needle) || item.subtitle.toLowerCase().includes(needle);
  }).slice(0, 10);

  useEffect(() => {
    if (!isCommandPaletteOpen) {
      setQuery('');
      return;
    }
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [isCommandPaletteOpen]);

  useEffect(() => {
    if (!isCommandPaletteOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        toggleCommandPalette(false);
        return;
      }

      if (event.key === 'Enter' && filteredItems[0]) {
        event.preventDefault();
        filteredItems[0].action();
        toggleCommandPalette(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredItems, isCommandPaletteOpen, toggleCommandPalette]);

  if (!isCommandPaletteOpen) {
    return null;
  }

  return (
    <div className="command-palette-backdrop" onClick={() => toggleCommandPalette(false)}>
      <div className="command-palette" onClick={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search commands, media, and transcripts…"
        />

        <div className="command-palette-results">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="command-palette-item"
              onClick={() => {
                item.action();
                toggleCommandPalette(false);
              }}
            >
              <div>
                <div className="command-palette-title">{item.title}</div>
                <div className="command-palette-subtitle">{item.subtitle}</div>
              </div>
              <span className="badge badge-muted">{item.category}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
