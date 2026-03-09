// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Creator Workflow Module (CC-01 through CC-09)
// ═══════════════════════════════════════════════════════════════════════════

export * from './types';
export { AutoReframeEngine, createAutoReframeEngine } from './AutoReframeEngine';
export { YouTubeChapterExporter, createYouTubeChapterExporter } from './YouTubeChapterExporter';
export { ThumbnailDesignerEngine, createThumbnailDesigner, COLOR_BOOST_PRESETS, TEXT_STYLE_PRESETS } from './ThumbnailDesigner';
export { StockMusicConnector, createStockMusicConnector, detectBeats } from './StockMusicConnector';
export { StockVideoConnector, createStockVideoConnector } from './StockVideoConnector';
export { BeatSyncEngine, createBeatSyncEngine } from './BeatSyncEngine';
export { SeriesManager, createSeriesManager } from './SeriesManager';
export { PodcastModeEngine, createPodcastMode } from './PodcastMode';
