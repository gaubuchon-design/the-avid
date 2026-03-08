import React, { useMemo, useState } from 'react';
import { flattenAssets } from '@mcua/core';
import { useEditorStore } from '../../store/editor.store';

function formatTimeRange(startTime: number, endTime: number): string {
  const format = (seconds: number) => {
    const wholeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(wholeSeconds / 60);
    const secs = wholeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return `${format(startTime)}-${format(endTime)}`;
}

export function ScriptPanel() {
  const { bins, transcript, sourceAsset, setSourceAsset, setPlayhead, appendAssetToTimeline } = useEditorStore();
  const [search, setSearch] = useState('');
  const assetMap = useMemo(() => {
    return new Map(flattenAssets(bins).map((asset) => [asset.id, asset] as const));
  }, [bins]);

  const filteredCues = transcript.filter((cue) => {
    if (!search.trim()) {
      return true;
    }

    const assetName = cue.assetId ? assetMap.get(cue.assetId)?.name ?? '' : '';
    const needle = search.toLowerCase();
    return cue.text.toLowerCase().includes(needle)
      || cue.speaker.toLowerCase().includes(needle)
      || assetName.toLowerCase().includes(needle);
  });

  return (
    <div className="script-panel panel">
      <div className="panel-header">
        <span className="panel-title">ScriptSync</span>
        <span className="badge badge-accent" style={{ marginLeft: 'auto' }}>{filteredCues.length} cues</span>
      </div>

      <div className="bin-search" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search script, transcript, or speaker…"
        />
      </div>

      <div className="panel-body">
        {filteredCues.map((cue) => {
          const asset = cue.assetId ? assetMap.get(cue.assetId) ?? null : null;
          const isSelected = sourceAsset?.id === asset?.id;
          return (
            <button
              key={cue.id}
              type="button"
              className={`script-cue${isSelected ? ' active' : ''}`}
              onClick={() => {
                setPlayhead(cue.startTime);
                if (asset) {
                  setSourceAsset(asset);
                }
              }}
              onDoubleClick={() => {
                if (asset) {
                  appendAssetToTimeline(asset.id);
                }
              }}
            >
              <div className="script-cue-meta">
                <span>{cue.speaker}</span>
                <span>{formatTimeRange(cue.startTime, cue.endTime)}</span>
              </div>
              <div className="script-cue-text">{cue.text}</div>
              <div className="script-cue-footer">
                <span className={`badge ${cue.source === 'SCRIPT' ? 'badge-warning' : 'badge-muted'}`}>{cue.source.toLowerCase()}</span>
                <span className="truncate" style={{ flex: 1 }}>{asset?.name ?? 'Project note'}</span>
                {asset?.type && <span>{asset.type}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
