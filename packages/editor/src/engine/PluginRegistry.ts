// =============================================================================
//  THE AVID -- Plugin Registry & Marketplace
// =============================================================================

/** Supported plugin setting value type. */
export type PluginSettingValue = string | number | boolean | string[] | number[];

/** Supported plugin types. */
export type PluginType = 'videoEffect' | 'audioEffect' | 'exportFormat' | 'aiTool' | 'panelExtension';

/** The manifest describing a plugin's metadata and capabilities. */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  type: PluginType;
  icon?: string;
  entryPoint: string;
  permissions: string[];
  pricing: { type: 'free' | 'paid' | 'subscription'; price?: number };
}

/** An installed plugin with local state. */
export interface InstalledPlugin extends PluginManifest {
  installedAt: number;
  enabled: boolean;
  settings: Record<string, PluginSettingValue>;
}

/** A marketplace listing with community metadata. */
export interface MarketplacePlugin extends PluginManifest {
  downloads: number;
  rating: number;
  ratingCount: number;
  screenshots: string[];
  tags: string[];
  lastUpdated: number;
}

// -- Demo marketplace data ----------------------------------------------------

const MARKETPLACE_PLUGINS: MarketplacePlugin[] = [
  {
    id: 'ai-scene-detect',
    name: 'AI Scene Detect',
    version: '2.1.0',
    author: 'AvidLabs',
    description:
      'Automatically detect scene boundaries, shot types, and camera movements using deep-learning models. Supports batch processing across entire bins and exports EDL/XML markers.',
    type: 'aiTool',
    icon: '',
    entryPoint: 'https://plugins.theavid.app/ai-scene-detect/main.js',
    permissions: ['timeline.read', 'media.read'],
    pricing: { type: 'free' },
    downloads: 28450,
    rating: 4.7,
    ratingCount: 312,
    screenshots: ['/screenshots/ai-scene-1.png', '/screenshots/ai-scene-2.png'],
    tags: ['ai', 'detection', 'scene', 'automation'],
    lastUpdated: Date.now() - 7 * 86400_000,
  },
  {
    id: 'prores-export',
    name: 'ProRes Export',
    version: '1.4.2',
    author: 'CodecWorks',
    description:
      'Extended ProRes export profiles including ProRes RAW, LT, and Proxy variants. Adds hardware-accelerated encoding on Apple Silicon with batch queue support.',
    type: 'exportFormat',
    icon: '',
    entryPoint: 'https://plugins.theavid.app/prores-export/main.js',
    permissions: ['timeline.read', 'media.read'],
    pricing: { type: 'paid', price: 9.99 },
    downloads: 15230,
    rating: 4.5,
    ratingCount: 187,
    screenshots: ['/screenshots/prores-1.png'],
    tags: ['export', 'prores', 'codec'],
    lastUpdated: Date.now() - 14 * 86400_000,
  },
  {
    id: 'film-emulation',
    name: 'Film Emulation Pack',
    version: '3.0.0',
    author: 'ColorSuite',
    description:
      '50+ photochemical film stock emulations including Kodak Vision3, Fuji Eterna, and Technicolor processes. GPU-accelerated LUT pipeline with real-time preview.',
    type: 'videoEffect',
    icon: '',
    entryPoint: 'https://plugins.theavid.app/film-emulation/main.js',
    permissions: ['timeline.read', 'timeline.write', 'media.read'],
    pricing: { type: 'paid', price: 29.99 },
    downloads: 41200,
    rating: 4.9,
    ratingCount: 528,
    screenshots: ['/screenshots/film-emu-1.png', '/screenshots/film-emu-2.png', '/screenshots/film-emu-3.png'],
    tags: ['color', 'film', 'lut', 'grade'],
    lastUpdated: Date.now() - 3 * 86400_000,
  },
  {
    id: 'loudness-meter-pro',
    name: 'Loudness Meter Pro',
    version: '1.2.1',
    author: 'AudioForge',
    description:
      'EBU R128 / ATSC A/85 compliant loudness metering with true-peak detection. Real-time histograms, loudness range display, and compliance report generation.',
    type: 'audioEffect',
    icon: '',
    entryPoint: 'https://plugins.theavid.app/loudness-meter/main.js',
    permissions: ['timeline.read', 'media.read'],
    pricing: { type: 'free' },
    downloads: 19870,
    rating: 4.6,
    ratingCount: 245,
    screenshots: ['/screenshots/loudness-1.png'],
    tags: ['audio', 'loudness', 'metering', 'broadcast'],
    lastUpdated: Date.now() - 21 * 86400_000,
  },
  {
    id: 'social-templates',
    name: 'Social Media Templates',
    version: '2.0.3',
    author: 'TemplateHQ',
    description:
      'Pre-built motion graphic templates optimized for every major social platform. Includes lower thirds, end screens, stories, and vertical video frames with customizable branding.',
    type: 'panelExtension',
    icon: '',
    entryPoint: 'https://plugins.theavid.app/social-templates/main.js',
    permissions: ['timeline.read', 'timeline.write'],
    pricing: { type: 'subscription', price: 4.99 },
    downloads: 34100,
    rating: 4.3,
    ratingCount: 412,
    screenshots: ['/screenshots/social-1.png', '/screenshots/social-2.png'],
    tags: ['social', 'templates', 'graphics', 'motion'],
    lastUpdated: Date.now() - 10 * 86400_000,
  },
  {
    id: 'auto-subtitle',
    name: 'Auto Subtitle',
    version: '1.8.0',
    author: 'AvidLabs',
    description:
      'Whisper-powered auto-subtitling with 99+ language support, speaker diarization, and word-level timing. Exports SRT, VTT, SCC, and burn-in with customizable styles.',
    type: 'aiTool',
    icon: '',
    entryPoint: 'https://plugins.theavid.app/auto-subtitle/main.js',
    permissions: ['timeline.read', 'timeline.write', 'media.read'],
    pricing: { type: 'paid', price: 14.99 },
    downloads: 52300,
    rating: 4.8,
    ratingCount: 673,
    screenshots: ['/screenshots/subtitle-1.png', '/screenshots/subtitle-2.png'],
    tags: ['ai', 'subtitle', 'caption', 'transcription'],
    lastUpdated: Date.now() - 5 * 86400_000,
  },
  {
    id: 'noise-reduction',
    name: 'Noise Reduction',
    version: '2.3.1',
    author: 'AudioForge',
    description:
      'AI-driven noise reduction, de-reverb, and hum removal. Spectral editing mode with adjustable frequency bands and real-time A/B comparison for transparent results.',
    type: 'audioEffect',
    icon: '',
    entryPoint: 'https://plugins.theavid.app/noise-reduction/main.js',
    permissions: ['timeline.read', 'timeline.write', 'media.read'],
    pricing: { type: 'paid', price: 19.99 },
    downloads: 27600,
    rating: 4.4,
    ratingCount: 318,
    screenshots: ['/screenshots/noise-1.png'],
    tags: ['audio', 'noise', 'cleanup', 'ai'],
    lastUpdated: Date.now() - 18 * 86400_000,
  },
  {
    id: 'motion-graphics-pack',
    name: 'Motion Graphics Pack',
    version: '4.1.0',
    author: 'MoGraph Studio',
    description:
      '200+ animated titles, transitions, lower thirds, and infographic elements. Data-driven templates with JSON binding, expression controls, and responsive layouts.',
    type: 'videoEffect',
    icon: '',
    entryPoint: 'https://plugins.theavid.app/motion-graphics/main.js',
    permissions: ['timeline.read', 'timeline.write'],
    pricing: { type: 'paid', price: 49.99 },
    downloads: 63400,
    rating: 4.7,
    ratingCount: 891,
    screenshots: ['/screenshots/mograph-1.png', '/screenshots/mograph-2.png', '/screenshots/mograph-3.png'],
    tags: ['motion', 'graphics', 'titles', 'transitions', 'animation'],
    lastUpdated: Date.now() - 1 * 86400_000,
  },
];

// -- Engine -------------------------------------------------------------------

/**
 * Plugin registry and marketplace manager.
 *
 * Handles browsing, installing, enabling/disabling, and sandboxing of plugins.
 * Provides a subscribe/unsubscribe pattern so UI components can react to
 * plugin state changes.
 */
class PluginRegistry {
  private installed: Map<string, InstalledPlugin> = new Map();
  private marketplace: MarketplacePlugin[];
  private listeners = new Set<() => void>();

  /** Initialise with demo marketplace data. */
  constructor() {
    this.marketplace = [...MARKETPLACE_PLUGINS];
  }

  // -- Marketplace ------------------------------------------------------------

  /**
   * Browse marketplace plugins with optional text search and type filter.
   * @param query Optional search string (matches name, description, tags, author).
   * @param type  Optional plugin type filter.
   * @returns Matching marketplace plugins.
   */
  browseMarketplace(query?: string, type?: PluginType): MarketplacePlugin[] {
    let results = [...this.marketplace];
    if (type) {
      results = results.filter((p) => p.type === type);
    }
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.includes(q)) ||
          p.author.toLowerCase().includes(q),
      );
    }
    return results;
  }

  /**
   * Get detailed information about a marketplace plugin.
   * @param id Plugin identifier.
   * @returns The marketplace plugin, or `undefined` if not found.
   */
  getPluginDetails(id: string): MarketplacePlugin | undefined {
    return this.marketplace.find((p) => p.id === id);
  }

  // -- Install / Manage -------------------------------------------------------

  /**
   * Install a plugin from the marketplace.
   * @param id Plugin identifier.
   * @returns The installed plugin object.
   * @throws If the plugin is not found in the marketplace.
   */
  installPlugin(id: string): InstalledPlugin {
    const existing = this.installed.get(id);
    if (existing) return { ...existing };

    const manifest = this.marketplace.find((p) => p.id === id);
    if (!manifest) {
      throw new Error(`Plugin "${id}" not found in marketplace`);
    }

    const plugin: InstalledPlugin = {
      ...manifest,
      installedAt: Date.now(),
      enabled: true,
      settings: {},
    };
    this.installed.set(id, plugin);

    // Bump downloads on the marketplace entry
    const mp = this.marketplace.find((p) => p.id === id);
    if (mp) mp.downloads += 1;

    this.notify();
    return { ...plugin };
  }

  /**
   * Uninstall a plugin.
   * @param id Plugin identifier.
   */
  uninstallPlugin(id: string): void {
    this.installed.delete(id);
    this.notify();
  }

  /**
   * Enable an installed plugin.
   * @param id Plugin identifier.
   */
  enablePlugin(id: string): void {
    const plugin = this.installed.get(id);
    if (plugin) {
      plugin.enabled = true;
      this.notify();
    }
  }

  /**
   * Disable an installed plugin.
   * @param id Plugin identifier.
   */
  disablePlugin(id: string): void {
    const plugin = this.installed.get(id);
    if (plugin) {
      plugin.enabled = false;
      this.notify();
    }
  }

  /**
   * Get all installed plugins.
   * @returns Array of InstalledPlugin snapshots.
   */
  getInstalledPlugins(): InstalledPlugin[] {
    return Array.from(this.installed.values()).map((p) => ({ ...p }));
  }

  /**
   * Get only the enabled installed plugins.
   * @returns Array of enabled InstalledPlugin snapshots.
   */
  getEnabledPlugins(): InstalledPlugin[] {
    return this.getInstalledPlugins().filter((p) => p.enabled);
  }

  /**
   * Update settings for an installed plugin, merging with existing settings.
   * @param id       Plugin identifier.
   * @param settings Settings object to merge.
   */
  updatePluginSettings(id: string, settings: Record<string, PluginSettingValue>): void {
    const plugin = this.installed.get(id);
    if (plugin) {
      plugin.settings = { ...plugin.settings, ...settings };
      this.notify();
    }
  }

  // -- Plugin sandbox (stub) --------------------------------------------------

  /**
   * Create a sandboxed execution context for a plugin.
   * In production, this would create an iframe or Web Worker sandbox
   * with restricted API access based on the plugin's permissions.
   * @param pluginId Plugin identifier.
   * @returns An object with `postMessage` and `destroy` methods.
   * @throws If the plugin is not installed.
   */
  createSandbox(pluginId: string): { postMessage: (msg: unknown) => void; destroy: () => void } {
    const plugin = this.installed.get(pluginId);
    if (!plugin) throw new Error(`Plugin "${pluginId}" is not installed`);

    let destroyed = false;

    return {
      postMessage: (msg: unknown) => {
        if (destroyed) return;
        console.debug(`[PluginSandbox:${pluginId}] message:`, msg);
      },
      destroy: () => {
        destroyed = true;
      },
    };
  }

  // -- Subscribe --------------------------------------------------------------

  /**
   * Subscribe to registry state changes.
   * @param cb Callback invoked on change.
   * @returns An unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Notify all subscribers that state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (err) {
        console.error('[PluginRegistry] Listener error:', err);
      }
    });
  }
}

/** Singleton plugin registry instance. */
export const pluginRegistry = new PluginRegistry();
