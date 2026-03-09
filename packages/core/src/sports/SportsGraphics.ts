// ─── Sports Lower-Third & Graphics Templates ─────────────────────────────────
// SP-06: Pre-built sports graphic templates for player name cards, score bugs,
// game clocks, stats cards, league standings, and sponsor bugs.
// LIVE data binding support with _LIVE suffix auto-populate.
// Bake live data to static at export time.

import type {
  SportsGraphicTemplate,
  GraphicField,
  GraphicsDataBinding,
  GraphicTemplateCategory,
  SportsLeague,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createId(prefix: string): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Template Factory ─────────────────────────────────────────────────────────

function createField(
  name: string,
  type: GraphicField['type'],
  defaultValue: string,
  position: { x: number; y: number },
  options: Partial<GraphicField> = {},
): GraphicField {
  return {
    id: createId('field'),
    name,
    type,
    defaultValue,
    position,
    isRequired: options.isRequired ?? true,
    liveBinding: options.liveBinding,
    maxLength: options.maxLength,
    style: options.style ?? {},
  };
}

// ─── Built-in Templates ───────────────────────────────────────────────────────

function createPlayerNameTemplate(league: SportsLeague): SportsGraphicTemplate {
  return {
    id: createId('tmpl'),
    name: `Player Name & Number - ${league}`,
    category: 'PLAYER_NAME',
    league,
    width: 640,
    height: 120,
    duration: 4,
    animationIn: 'slide-left',
    animationOut: 'slide-left',
    fields: [
      createField('Player Name', 'TEXT', 'Player Name', { x: 120, y: 20 }, {
        maxLength: 30,
        style: { fontSize: 28, fontWeight: 'bold', color: '#ffffff' },
      }),
      createField('Player Number', 'NUMBER', '10', { x: 20, y: 20 }, {
        maxLength: 3,
        style: { fontSize: 36, fontWeight: 'bold', color: '#ffffff' },
      }),
      createField('Team Color', 'COLOR', '#c94f84', { x: 0, y: 0 }, {
        isRequired: false,
        style: {},
      }),
      createField('Position', 'TEXT', 'Forward', { x: 120, y: 60 }, {
        isRequired: false,
        maxLength: 20,
        style: { fontSize: 16, color: '#cccccc' },
      }),
    ],
  };
}

function createScoreBugTemplate(league: SportsLeague): SportsGraphicTemplate {
  return {
    id: createId('tmpl'),
    name: `Score Bug - ${league}`,
    category: 'SCORE_BUG',
    league,
    width: 400,
    height: 80,
    duration: 0, // Persistent
    animationIn: 'fade',
    animationOut: 'fade',
    fields: [
      createField('Home Team', 'TEXT', 'HOME', { x: 10, y: 10 }, {
        maxLength: 5,
        style: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
      }),
      createField('Away Team', 'TEXT', 'AWAY', { x: 220, y: 10 }, {
        maxLength: 5,
        style: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
      }),
      createField('Home Score', 'NUMBER', '0', { x: 150, y: 10 }, {
        liveBinding: 'HOME_SCORE_LIVE',
        style: { fontSize: 32, fontWeight: 'bold', color: '#ffffff' },
      }),
      createField('Away Score', 'NUMBER', '0', { x: 200, y: 10 }, {
        liveBinding: 'AWAY_SCORE_LIVE',
        style: { fontSize: 32, fontWeight: 'bold', color: '#ffffff' },
      }),
      createField('Game Clock', 'TEXT', '00:00', { x: 160, y: 50 }, {
        liveBinding: 'GAME_CLOCK_LIVE',
        style: { fontSize: 14, color: '#cccccc' },
      }),
      createField('Period', 'TEXT', '1st', { x: 340, y: 50 }, {
        liveBinding: 'PERIOD_LIVE',
        style: { fontSize: 14, color: '#cccccc' },
      }),
    ],
  };
}

function createGameClockTemplate(league: SportsLeague): SportsGraphicTemplate {
  return {
    id: createId('tmpl'),
    name: `Game Clock - ${league}`,
    category: 'GAME_CLOCK',
    league,
    width: 200,
    height: 60,
    duration: 0,
    animationIn: 'fade',
    animationOut: 'fade',
    fields: [
      createField('Clock', 'TEXT', '00:00', { x: 20, y: 10 }, {
        liveBinding: 'GAME_CLOCK_LIVE',
        style: { fontSize: 36, fontWeight: 'bold', color: '#ffffff', fontFamily: 'monospace' },
      }),
      createField('Period', 'TEXT', '1st Half', { x: 20, y: 45 }, {
        liveBinding: 'PERIOD_LIVE',
        style: { fontSize: 12, color: '#aaaaaa' },
      }),
    ],
  };
}

function createStatsCardTemplate(league: SportsLeague): SportsGraphicTemplate {
  return {
    id: createId('tmpl'),
    name: `Stats Card - ${league}`,
    category: 'STATS_CARD',
    league,
    width: 500,
    height: 300,
    duration: 6,
    animationIn: 'scale-up',
    animationOut: 'scale-down',
    fields: [
      createField('Player Name', 'TEXT', 'Player Name', { x: 20, y: 20 }, {
        style: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
      }),
      createField('Stat 1 Label', 'TEXT', 'Goals', { x: 20, y: 80 }, {
        style: { fontSize: 14, color: '#aaaaaa' },
      }),
      createField('Stat 1 Value', 'NUMBER', '12', { x: 20, y: 100 }, {
        style: { fontSize: 32, fontWeight: 'bold', color: '#ffffff' },
      }),
      createField('Stat 2 Label', 'TEXT', 'Assists', { x: 180, y: 80 }, {
        style: { fontSize: 14, color: '#aaaaaa' },
      }),
      createField('Stat 2 Value', 'NUMBER', '8', { x: 180, y: 100 }, {
        style: { fontSize: 32, fontWeight: 'bold', color: '#ffffff' },
      }),
      createField('Stat 3 Label', 'TEXT', 'Minutes', { x: 340, y: 80 }, {
        style: { fontSize: 14, color: '#aaaaaa' },
      }),
      createField('Stat 3 Value', 'NUMBER', '2340', { x: 340, y: 100 }, {
        style: { fontSize: 32, fontWeight: 'bold', color: '#ffffff' },
      }),
      createField('Player Image', 'IMAGE', '', { x: 350, y: 10 }, {
        isRequired: false,
        style: { width: 120, height: 120, borderRadius: 60 },
      }),
    ],
  };
}

function createStandingsTemplate(league: SportsLeague): SportsGraphicTemplate {
  return {
    id: createId('tmpl'),
    name: `League Standings - ${league}`,
    category: 'LEAGUE_STANDINGS',
    league,
    width: 600,
    height: 400,
    duration: 8,
    animationIn: 'slide-up',
    animationOut: 'slide-down',
    fields: [
      createField('Title', 'TEXT', `${league} Standings`, { x: 20, y: 20 }, {
        style: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
      }),
      ...Array.from({ length: 5 }, (_, i) => [
        createField(`Team ${i + 1}`, 'TEXT', `Team ${i + 1}`, { x: 60, y: 80 + i * 50 }, {
          style: { fontSize: 18, color: '#ffffff' },
        }),
        createField(`Points ${i + 1}`, 'NUMBER', String(30 - i * 3), { x: 400, y: 80 + i * 50 }, {
          style: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
        }),
      ]).flat(),
    ],
  };
}

function createSponsorBugTemplate(league: SportsLeague): SportsGraphicTemplate {
  return {
    id: createId('tmpl'),
    name: `Sponsor Bug - ${league}`,
    category: 'SPONSOR_BUG',
    league,
    width: 300,
    height: 60,
    duration: 5,
    animationIn: 'fade',
    animationOut: 'fade',
    fields: [
      createField('Sponsor Logo', 'IMAGE', '', { x: 10, y: 5 }, {
        style: { width: 50, height: 50 },
      }),
      createField('Sponsor Text', 'TEXT', 'Brought to you by', { x: 70, y: 10 }, {
        style: { fontSize: 12, color: '#aaaaaa' },
      }),
      createField('Sponsor Name', 'TEXT', 'Sponsor', { x: 70, y: 30 }, {
        style: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
      }),
    ],
  };
}

function createLowerThirdTemplate(league: SportsLeague): SportsGraphicTemplate {
  return {
    id: createId('tmpl'),
    name: `Lower Third - ${league}`,
    category: 'LOWER_THIRD',
    league,
    width: 720,
    height: 100,
    duration: 5,
    animationIn: 'slide-left',
    animationOut: 'slide-left',
    fields: [
      createField('Title', 'TEXT', 'Breaking News', { x: 20, y: 15 }, {
        style: { fontSize: 24, fontWeight: 'bold', color: '#ffffff' },
      }),
      createField('Subtitle', 'TEXT', 'Additional details here', { x: 20, y: 55 }, {
        style: { fontSize: 16, color: '#cccccc' },
      }),
      createField('Accent Color', 'COLOR', '#c94f84', { x: 0, y: 0 }, {
        isRequired: false,
        style: {},
      }),
    ],
  };
}

// ─── Template Registry ────────────────────────────────────────────────────────

export class SportsGraphicsRegistry {
  private templates: Map<string, SportsGraphicTemplate> = new Map();
  private initialized = false;

  constructor() {
    // Templates are lazy-initialized on first access
  }

  private ensureInitialized(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.seedBuiltInTemplates();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  getAllTemplates(): SportsGraphicTemplate[] {
    this.ensureInitialized();
    return Array.from(this.templates.values());
  }

  getTemplate(id: string): SportsGraphicTemplate | null {
    this.ensureInitialized();
    return this.templates.get(id) ?? null;
  }

  getTemplatesByCategory(category: GraphicTemplateCategory): SportsGraphicTemplate[] {
    this.ensureInitialized();
    return Array.from(this.templates.values()).filter((t) => t.category === category);
  }

  getTemplatesByLeague(league: SportsLeague): SportsGraphicTemplate[] {
    this.ensureInitialized();
    return Array.from(this.templates.values()).filter((t) => t.league === league);
  }

  addTemplate(template: SportsGraphicTemplate): void {
    this.ensureInitialized();
    this.templates.set(template.id, template);
  }

  removeTemplate(id: string): void {
    this.templates.delete(id);
  }

  /**
   * Create a live-bound instance of a template, resolving _LIVE bindings
   * from the current data.
   */
  createInstance(
    templateId: string,
    fieldValues: Record<string, string>,
    liveResolver?: (key: string) => string | null,
  ): { template: SportsGraphicTemplate; resolvedFields: Record<string, string> } | null {
    const template = this.getTemplate(templateId);
    if (!template) return null;

    const resolvedFields: Record<string, string> = {};

    for (const field of template.fields) {
      if (field.liveBinding && liveResolver) {
        const liveValue = liveResolver(field.liveBinding);
        resolvedFields[field.id] = liveValue ?? fieldValues[field.name] ?? field.defaultValue;
      } else {
        resolvedFields[field.id] = fieldValues[field.name] ?? field.defaultValue;
      }
    }

    return { template, resolvedFields };
  }

  /**
   * Bake live data bindings to static values for export.
   * Returns a new set of field values with all live bindings resolved.
   */
  bakeToStatic(
    templateId: string,
    currentFields: Record<string, string>,
    liveResolver: (key: string) => string | null,
  ): Record<string, string> {
    const template = this.getTemplate(templateId);
    if (!template) return currentFields;

    const baked = { ...currentFields };
    for (const field of template.fields) {
      if (field.liveBinding) {
        const liveValue = liveResolver(field.liveBinding);
        if (liveValue !== null) {
          baked[field.id] = liveValue;
        }
      }
    }
    return baked;
  }

  /**
   * Get all fields that have live bindings for a given template.
   */
  getLiveFields(templateId: string): GraphicField[] {
    const template = this.getTemplate(templateId);
    if (!template) return [];
    return template.fields.filter((f) => f.liveBinding);
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private seedBuiltInTemplates(): void {
    const leagues: SportsLeague[] = ['EPL', 'NFL', 'NBA', 'NHL', 'MLB', 'LA_LIGA'];

    for (const league of leagues) {
      const templates = [
        createPlayerNameTemplate(league),
        createScoreBugTemplate(league),
        createGameClockTemplate(league),
        createStatsCardTemplate(league),
        createStandingsTemplate(league),
        createSponsorBugTemplate(league),
        createLowerThirdTemplate(league),
      ];

      for (const template of templates) {
        this.templates.set(template.id, template);
      }
    }
  }
}

/**
 * Create a pre-configured SportsGraphicsRegistry.
 */
export function createSportsGraphicsRegistry(): SportsGraphicsRegistry {
  return new SportsGraphicsRegistry();
}
