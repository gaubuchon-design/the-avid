import React, { useEffect, useState } from 'react';
import {
  flattenAssets,
  getMediaAssetTechnicalSummary,
  getMediaAssetSurfaceCapability,
  getMediaCapabilityDispositionLabel,
} from '@mcua/core';
import { useEditorStore } from '../../store/editor.store';

function getCapabilityBadgeClass(disposition?: string): string {
  switch (disposition) {
    case 'native':
      return 'badge-success';
    case 'proxy-only':
      return 'badge-accent';
    case 'unsupported':
      return 'badge-error';
    default:
      return 'badge-warning';
  }
}

export function IngestPanel() {
  const { bins, desktopJobs, projectId, watchFolders, loadProject } = useEditorStore();
  const assets = flattenAssets(bins);
  const currentSurface = window.electronAPI ? 'desktop' : 'web';
  const videoCount = assets.filter((asset) => asset.type === 'VIDEO').length;
  const audioCount = assets.filter((asset) => asset.type === 'AUDIO').length;
  const indexedCount = assets.filter((asset) => asset.indexStatus === 'READY').length;
  const relinkReadyCount = assets.filter((asset) => Boolean(asset.relinkIdentity?.assetKey)).length;
  const proxyReadyCount = assets.filter((asset) => asset.proxyMetadata?.status === 'READY').length;
  const waveformReadyCount = assets.filter((asset) => asset.waveformMetadata?.status === 'READY').length;
  const semanticTaggedCount = assets.filter((asset) => (asset.semanticMetadata?.tags.length ?? 0) > 0).length;
  const missingAssets = assets.filter((asset) => asset.indexStatus === 'MISSING');
  const surfaceDispositionCounts = assets.reduce<Record<string, number>>((counts, asset) => {
    const capability = getMediaAssetSurfaceCapability(asset, currentSurface) ?? asset.capabilityReport?.surfaces[0];
    const key = capability?.disposition ?? 'unsupported';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const recentlyIndexed = [...assets]
    .sort((left, right) => (right.ingestMetadata?.importedAt ?? '').localeCompare(left.ingestMetadata?.importedAt ?? ''))
    .slice(0, 6);
  const [mediaTools, setMediaTools] = useState<{ ffmpeg: string | null; ffprobe: string | null } | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    void window.electronAPI.getMediaTools().then((tools) => {
      setMediaTools(tools);
    }).catch((error) => {
      console.error('Failed to load media tool info', error);
    });
  }, []);

  const refreshProject = async () => {
    if (!projectId) {
      return;
    }
    await loadProject(projectId);
  };

  const handleMediaScan = async () => {
    if (!window.electronAPI || !projectId || isWorking) {
      return;
    }

    setIsWorking(true);
    setActionStatus('Scanning indexed media...');
    try {
      await window.electronAPI.scanProjectMedia(projectId);
      await refreshProject();
      setActionStatus('Media scan complete.');
    } catch (error) {
      console.error('Failed to scan media', error);
      setActionStatus('Media scan failed.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRelink = async () => {
    if (!window.electronAPI || !projectId || isWorking) {
      return;
    }

    const result = await window.electronAPI.openFile({
      title: 'Choose folders to search for missing media',
      properties: ['openDirectory', 'multiSelections'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return;
    }

    setIsWorking(true);
    setActionStatus('Relinking missing media...');
    try {
      const relinkResult = await window.electronAPI.relinkProjectMedia(projectId, result.filePaths);
      await refreshProject();
      setActionStatus(`Relinked ${relinkResult.relinkedCount} asset(s), ${relinkResult.missingCount} still missing.`);
    } catch (error) {
      console.error('Failed to relink media', error);
      setActionStatus('Relink failed.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleAddWatchFolder = async () => {
    if (!window.electronAPI || !projectId || isWorking) {
      return;
    }

    const result = await window.electronAPI.openFile({
      title: 'Choose a watch folder',
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return;
    }

    setIsWorking(true);
    setActionStatus('Adding watch folder...');
    try {
      await window.electronAPI.addWatchFolder(projectId, result.filePaths[0]!);
      await refreshProject();
      setActionStatus(`Watching ${result.filePaths[0]}.`);
    } catch (error) {
      console.error('Failed to add watch folder', error);
      setActionStatus('Adding watch folder failed.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRemoveWatchFolder = async (watchFolderId: string) => {
    if (!window.electronAPI || !projectId || isWorking) {
      return;
    }

    setIsWorking(true);
    setActionStatus('Removing watch folder...');
    try {
      await window.electronAPI.removeWatchFolder(projectId, watchFolderId);
      await refreshProject();
      setActionStatus('Watch folder removed.');
    } catch (error) {
      console.error('Failed to remove watch folder', error);
      setActionStatus('Removing watch folder failed.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRescanWatchFolders = async () => {
    if (!window.electronAPI || !projectId || isWorking) {
      return;
    }

    setIsWorking(true);
    setActionStatus('Rescanning watch folders...');
    try {
      await window.electronAPI.rescanWatchFolders(projectId);
      await refreshProject();
      setActionStatus('Watch folders rescanned.');
    } catch (error) {
      console.error('Failed to rescan watch folders', error);
      setActionStatus('Watch-folder rescan failed.');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="ingest-panel panel">
      <div className="panel-header">
        <span className="panel-title">Ingest Control</span>
        {actionStatus && <span className="badge badge-accent" style={{ marginLeft: 'auto' }}>{actionStatus}</span>}
      </div>

      <div className="panel-body">
        <div className="review-section">
          <div className="inspector-section-title">Media Services</div>
          <div className="publish-preset-list">
            <button type="button" className="publish-preset-card" onClick={() => { void handleMediaScan(); }} disabled={!window.electronAPI || !projectId || isWorking}>
              <div className="publish-preset-title">Scan Media Index</div>
              <div className="publish-preset-meta">Refresh missing-media status, playback paths, and index health.</div>
            </button>
            <button type="button" className="publish-preset-card" onClick={() => { void handleRelink(); }} disabled={!window.electronAPI || !projectId || missingAssets.length === 0 || isWorking}>
              <div className="publish-preset-title">Relink Missing Media</div>
              <div className="publish-preset-meta">Search selected folders using relink keys, filename stems, and fingerprints.</div>
            </button>
            <button type="button" className="publish-preset-card" onClick={() => { void handleAddWatchFolder(); }} disabled={!window.electronAPI || !projectId || isWorking}>
              <div className="publish-preset-title">Add Watch Folder</div>
              <div className="publish-preset-meta">Automatically ingest and index newly dropped media.</div>
            </button>
            <button type="button" className="publish-preset-card" onClick={() => { void handleRescanWatchFolders(); }} disabled={!window.electronAPI || !projectId || watchFolders.length === 0 || isWorking}>
              <div className="publish-preset-title">Rescan Watch Folders</div>
              <div className="publish-preset-meta">Force a background indexing pass across all tracked watch folders.</div>
            </button>
          </div>
          {mediaTools && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              <span className={`badge ${mediaTools.ffmpeg ? 'badge-success' : 'badge-warning'}`}>ffmpeg {mediaTools.ffmpeg ? 'ready' : 'missing'}</span>
              <span className={`badge ${mediaTools.ffprobe ? 'badge-success' : 'badge-warning'}`}>ffprobe {mediaTools.ffprobe ? 'ready' : 'missing'}</span>
            </div>
          )}
        </div>

        <div className="review-section">
          <div className="inspector-section-title">Current Library</div>
          <div className="ingest-stat-grid">
            <div className="ingest-stat-card">
              <div className="publish-preset-title">{assets.length}</div>
              <div className="publish-preset-meta">Total assets</div>
            </div>
            <div className="ingest-stat-card">
              <div className="publish-preset-title">{videoCount}</div>
              <div className="publish-preset-meta">Video clips</div>
            </div>
            <div className="ingest-stat-card">
              <div className="publish-preset-title">{audioCount}</div>
              <div className="publish-preset-meta">Audio clips</div>
            </div>
            <div className="ingest-stat-card">
              <div className="publish-preset-title">{indexedCount}</div>
              <div className="publish-preset-meta">Indexed assets</div>
            </div>
            <div className="ingest-stat-card">
              <div className="publish-preset-title">{relinkReadyCount}</div>
              <div className="publish-preset-meta">Relink-ready</div>
            </div>
            <div className="ingest-stat-card">
              <div className="publish-preset-title">{proxyReadyCount}</div>
              <div className="publish-preset-meta">Proxies ready</div>
            </div>
            <div className="ingest-stat-card">
              <div className="publish-preset-title">{waveformReadyCount}</div>
              <div className="publish-preset-meta">Waveforms ready</div>
            </div>
            <div className="ingest-stat-card">
              <div className="publish-preset-title">{semanticTaggedCount}</div>
              <div className="publish-preset-meta">Semantic tags</div>
            </div>
            <div className="ingest-stat-card">
              <div className="publish-preset-title">{surfaceDispositionCounts['native'] ?? 0}</div>
              <div className="publish-preset-meta">{currentSurface} native</div>
            </div>
            <div className="ingest-stat-card">
              <div className="publish-preset-title">{surfaceDispositionCounts['proxy-only'] ?? 0}</div>
              <div className="publish-preset-meta">{currentSurface} proxy-only</div>
            </div>
            <div className="ingest-stat-card">
              <div className="publish-preset-title">{surfaceDispositionCounts['mezzanine-required'] ?? 0}</div>
              <div className="publish-preset-meta">{currentSurface} mezzanine</div>
            </div>
            <div className="ingest-stat-card">
              <div className="publish-preset-title">{surfaceDispositionCounts['unsupported'] ?? 0}</div>
              <div className="publish-preset-meta">{currentSurface} unsupported</div>
            </div>
          </div>
        </div>

        <div className="review-section">
          <div className="inspector-section-title">Watch Folders</div>
          <div className="publish-job-list">
            {watchFolders.length === 0 ? (
              <div className="publish-job-card">
                <div className="ai-job-title">No watch folders configured</div>
                <div className="ai-job-desc">Add a directory to automatically index and ingest new media drops.</div>
              </div>
            ) : watchFolders.map((watchFolder) => (
              <div key={watchFolder.id} className="publish-job-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ai-job-title">{watchFolder.name}</div>
                    <div className="ai-job-desc">{watchFolder.path}</div>
                  </div>
                  <span className={`badge ${watchFolder.status === 'WATCHING' ? 'badge-success' : watchFolder.status === 'ERROR' ? 'badge-error' : 'badge-warning'}`}>
                    {watchFolder.status.toLowerCase()}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  <span className="badge badge-muted">{watchFolder.importedAssetCount} imported</span>
                  {watchFolder.lastScannedAt && <span className="badge badge-muted">scanned {new Date(watchFolder.lastScannedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
                </div>
                <div className="review-approval-actions" style={{ marginTop: 10 }}>
                  <button className="btn btn-sm btn-danger" onClick={() => { void handleRemoveWatchFolder(watchFolder.id); }} disabled={isWorking}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {missingAssets.length > 0 && (
          <div className="review-section">
            <div className="inspector-section-title">Missing Media</div>
            <div className="publish-job-list">
              {missingAssets.slice(0, 8).map((asset) => (
                (() => {
                  const currentCapability = getMediaAssetSurfaceCapability(asset, currentSurface) ?? asset.capabilityReport?.surfaces[0];
                  return (
                    <div key={asset.id} className="publish-job-card">
                      <div className="ai-job-title">{asset.name}</div>
                      <div className="ai-job-desc">
                        {asset.locations?.originalPath ?? asset.locations?.managedPath ?? 'No known path'}
                      </div>
                      {currentCapability && (
                        <div className="ai-job-desc" style={{ marginTop: 6 }}>
                          {currentCapability.reasons[0] ?? 'Capability details unavailable.'}
                        </div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        <span className="badge badge-error">missing</span>
                        {currentCapability && (
                          <span className={`badge ${getCapabilityBadgeClass(currentCapability.disposition)}`}>
                            {currentSurface} {getMediaCapabilityDispositionLabel(currentCapability.disposition)}
                          </span>
                        )}
                        {asset.relinkIdentity?.assetKey && <span className="badge badge-muted">relink key</span>}
                      </div>
                    </div>
                  );
                })()
              ))}
            </div>
          </div>
        )}

        <div className="review-section">
          <div className="inspector-section-title">Media Strategy</div>
          <div className="publish-preset-list">
            {[
              ['Link / AMA', 'Preserve original media location and build metadata-first access.'],
              ['Consolidate', 'Copy source media into managed project packages for offline reliability.'],
              ['Transcode + Proxy', 'Prepare lightweight review media and keep finishing media intact.'],
            ].map(([title, body]) => (
              <div key={title} className="publish-preset-card" style={{ cursor: 'default' }}>
                <div className="publish-preset-title">{title}</div>
                <div className="publish-preset-meta">{body}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="review-section">
          <div className="inspector-section-title">Index Health</div>
          <div className="publish-job-list">
            {recentlyIndexed.map((asset) => {
              const currentCapability = getMediaAssetSurfaceCapability(asset, currentSurface) ?? asset.capabilityReport?.surfaces[0];
              const otherSurfaceBadges = (asset.capabilityReport?.surfaces ?? []).filter((surface) => surface.surface !== currentSurface);

              return (
                <div key={asset.id} className="publish-job-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ai-job-title">{asset.name}</div>
                      <div className="ai-job-desc">
                        {[
                          asset.ingestMetadata?.storageMode ?? 'Seeded',
                          ...getMediaAssetTechnicalSummary(asset).slice(0, 2),
                        ].filter(Boolean).join(' · ')}
                      </div>
                      {currentCapability && (
                        <div className="ai-job-desc" style={{ marginTop: 6 }}>
                          {currentCapability.reasons.slice(0, 2).join(' ')}
                        </div>
                      )}
                    </div>
                    <span className={`badge ${asset.indexStatus === 'READY' ? 'badge-success' : asset.indexStatus === 'ERROR' ? 'badge-error' : 'badge-warning'}`}>
                      {(asset.indexStatus ?? 'UNSCANNED').toLowerCase()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {currentCapability && (
                      <span className={`badge ${getCapabilityBadgeClass(currentCapability.disposition)}`}>
                        {currentSurface} {getMediaCapabilityDispositionLabel(currentCapability.disposition)}
                      </span>
                    )}
                    {otherSurfaceBadges.map((surface) => (
                      <span key={`${asset.id}-${surface.surface}`} className="badge badge-muted">
                        {surface.surface} {getMediaCapabilityDispositionLabel(surface.disposition)}
                      </span>
                    ))}
                    {asset.supportTier && <span className="badge badge-muted">{asset.supportTier}</span>}
                    {asset.relinkIdentity?.assetKey && <span className="badge badge-muted">Relink key</span>}
                    {asset.proxyMetadata?.status === 'READY' && <span className="badge badge-accent">Proxy</span>}
                    {asset.waveformMetadata?.status === 'READY' && <span className="badge badge-muted">Waveform</span>}
                    {(asset.semanticMetadata?.tags.length ?? 0) > 0 && <span className="badge badge-muted">{asset.semanticMetadata?.tags.length} semantic tags</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {desktopJobs.length > 0 && (
          <div className="review-section">
            <div className="inspector-section-title">Recent Ingest Activity</div>
            <div className="publish-job-list">
              {desktopJobs.filter((job) => job.kind === 'INGEST').map((job) => (
                <div key={job.id} className="publish-job-card">
                  <div className="ai-job-title">{job.label}</div>
                  <div className="ai-job-desc">{job.status.toLowerCase()} · {job.progress}%</div>
                  <div className="ai-progress-bar" style={{ marginTop: 8 }}>
                    <div className="ai-progress-fill" style={{ width: `${job.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
