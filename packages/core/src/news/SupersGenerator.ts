// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Supers Generator (N-05)
//  Read supers fields from NRCS story data, generate lower-third graphic
//  data, CG system integration (Vizrt, ChyronHego, Ross XPression),
//  and place on V2 track at specified timecode.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  SupersData,
  CGTemplate,
  CGSystemType,
  RundownEvent,
} from './types';

// ─── CG System Adapters ────────────────────────────────────────────────────

export interface CGSystemAdapter {
  readonly system: CGSystemType;
  buildPayload(supers: SupersData, template: CGTemplate): Record<string, unknown>;
  formatCommand(supers: SupersData, template: CGTemplate): string;
}

export class VizrtAdapter implements CGSystemAdapter {
  readonly system: CGSystemType = 'VIZRT';

  buildPayload(supers: SupersData, template: CGTemplate): Record<string, unknown> {
    return {
      viz_template: template.name,
      viz_scene: template.id,
      fields: {
        HEADLINE: supers.personName,
        SUBLINE: supers.title,
        LOCATION: supers.location ?? '',
        LINE1: supers.line1 ?? supers.personName,
        LINE2: supers.line2 ?? supers.title,
        LINE3: supers.line3 ?? supers.location ?? '',
      },
      take_in: supers.timecodeIn ?? '00:00:00:00',
      take_out: supers.timecodeOut ?? '',
      channel: 'A',
    };
  }

  formatCommand(supers: SupersData, template: CGTemplate): string {
    const fields = this.buildPayload(supers, template)['fields'] as Record<string, string>;
    const fieldStr = Object.entries(fields)
      .map(([key, val]) => `${key}=${val}`)
      .join('|');
    return `VIZ TAKE ${template.id} ${fieldStr}`;
  }
}

export class ChyronHegoAdapter implements CGSystemAdapter {
  readonly system: CGSystemType = 'CHYRON_HEGO';

  buildPayload(supers: SupersData, template: CGTemplate): Record<string, unknown> {
    return {
      template_id: template.id,
      template_name: template.name,
      data: {
        Name: supers.personName,
        Title: supers.title,
        Location: supers.location ?? '',
        Custom1: supers.line1 ?? '',
        Custom2: supers.line2 ?? '',
        Custom3: supers.line3 ?? '',
      },
      timecode_in: supers.timecodeIn,
      timecode_out: supers.timecodeOut,
      layer: 1,
    };
  }

  formatCommand(supers: SupersData, template: CGTemplate): string {
    return `LYRIC PAGE ${template.id} Name="${supers.personName}" Title="${supers.title}"`;
  }
}

export class RossXPressionAdapter implements CGSystemAdapter {
  readonly system: CGSystemType = 'ROSS_XPRESSION';

  buildPayload(supers: SupersData, template: CGTemplate): Record<string, unknown> {
    return {
      scene: template.id,
      take_id: `take_${supers.id}`,
      fields: {
        field_name: supers.personName,
        field_title: supers.title,
        field_location: supers.location ?? '',
        field_line1: supers.line1 ?? '',
        field_line2: supers.line2 ?? '',
      },
      tc_in: supers.timecodeIn,
      tc_out: supers.timecodeOut,
    };
  }

  formatCommand(supers: SupersData, template: CGTemplate): string {
    return `XPRESSION TAKE ${template.id} NAME="${supers.personName}" TITLE="${supers.title}"`;
  }
}

export class GenericCGAdapter implements CGSystemAdapter {
  readonly system: CGSystemType = 'GENERIC';

  buildPayload(supers: SupersData, template: CGTemplate): Record<string, unknown> {
    return {
      template: template.id,
      line1: supers.line1 ?? supers.personName,
      line2: supers.line2 ?? supers.title,
      line3: supers.line3 ?? supers.location ?? '',
      in: supers.timecodeIn,
      out: supers.timecodeOut,
    };
  }

  formatCommand(supers: SupersData, _template: CGTemplate): string {
    return `CG L1="${supers.personName}" L2="${supers.title}"`;
  }
}

// ─── Adapter Factory ───────────────────────────────────────────────────────

export function createCGAdapter(system: CGSystemType): CGSystemAdapter {
  switch (system) {
    case 'VIZRT':
      return new VizrtAdapter();
    case 'CHYRON_HEGO':
      return new ChyronHegoAdapter();
    case 'ROSS_XPRESSION':
      return new RossXPressionAdapter();
    case 'GENERIC':
      return new GenericCGAdapter();
    default:
      return new GenericCGAdapter();
  }
}

// ─── Default Templates ─────────────────────────────────────────────────────

export const DEFAULT_CG_TEMPLATES: CGTemplate[] = [
  {
    id: 'lt-standard',
    name: 'Lower Third - Standard',
    system: 'GENERIC',
    fields: ['personName', 'title'],
  },
  {
    id: 'lt-location',
    name: 'Lower Third - With Location',
    system: 'GENERIC',
    fields: ['personName', 'title', 'location'],
  },
  {
    id: 'lt-three-line',
    name: 'Lower Third - Three Line',
    system: 'GENERIC',
    fields: ['line1', 'line2', 'line3'],
  },
  {
    id: 'fn-name-only',
    name: 'Full Name Only',
    system: 'GENERIC',
    fields: ['personName'],
  },
  {
    id: 'loc-banner',
    name: 'Location Banner',
    system: 'GENERIC',
    fields: ['location'],
  },
];

// ─── Story -> Supers Extraction ────────────────────────────────────────────

const SUPER_PATTERN = /\{\{SUPER:\s*([^}]+)\}\}/gi;
const NAME_TITLE_PATTERN = /^(.+?)\s*[,\-|]\s*(.+)$/;
const LOCATION_PATTERN = /\{\{LOCATION:\s*([^}]+)\}\}/i;

export interface ExtractedSuper {
  personName: string;
  title: string;
  location?: string;
}

export function extractSupersFromScript(scriptText: string): ExtractedSuper[] {
  const supers: ExtractedSuper[] = [];
  let match: RegExpExecArray | null;

  const locationMatch = LOCATION_PATTERN.exec(scriptText);
  const globalLocation = locationMatch?.[1]?.trim();

  while ((match = SUPER_PATTERN.exec(scriptText)) !== null) {
    const raw = match[1]!.trim();
    const nameTitleMatch = NAME_TITLE_PATTERN.exec(raw);

    if (nameTitleMatch) {
      supers.push({
        personName: nameTitleMatch[1]!.trim(),
        title: nameTitleMatch[2]!.trim(),
        location: globalLocation,
      });
    } else {
      supers.push({
        personName: raw,
        title: '',
        location: globalLocation,
      });
    }
  }

  return supers;
}

// ─── Supers Generator ──────────────────────────────────────────────────────

function generateSuperId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `super-${globalThis.crypto.randomUUID()}`;
  }
  return `super-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface SupersPlacement {
  supers: SupersData;
  cgPayload: Record<string, unknown>;
  cgCommand: string;
}

export class SupersGenerator {
  private cgAdapters = new Map<CGSystemType, CGSystemAdapter>();
  private templates: CGTemplate[] = [...DEFAULT_CG_TEMPLATES];
  private defaultSystem: CGSystemType = 'GENERIC';
  private defaultTrackTarget = 'V2';

  constructor(config?: { defaultSystem?: CGSystemType; defaultTrackTarget?: string }) {
    if (config?.defaultSystem) {
      this.defaultSystem = config.defaultSystem;
    }
    if (config?.defaultTrackTarget) {
      this.defaultTrackTarget = config.defaultTrackTarget;
    }

    // Pre-initialize adapters
    this.cgAdapters.set('VIZRT', new VizrtAdapter());
    this.cgAdapters.set('CHYRON_HEGO', new ChyronHegoAdapter());
    this.cgAdapters.set('ROSS_XPRESSION', new RossXPressionAdapter());
    this.cgAdapters.set('GENERIC', new GenericCGAdapter());
  }

  setDefaultSystem(system: CGSystemType): void {
    this.defaultSystem = system;
  }

  setTemplates(templates: CGTemplate[]): void {
    this.templates = [...templates];
  }

  addTemplate(template: CGTemplate): void {
    this.templates.push(template);
  }

  getTemplates(): CGTemplate[] {
    return [...this.templates];
  }

  getTemplate(templateId: string): CGTemplate | undefined {
    return this.templates.find((t) => t.id === templateId);
  }

  // ─── Generate From Story ───────────────────────────────────────────

  generateFromStory(
    story: RundownEvent,
    options?: {
      templateId?: string;
      cgSystem?: CGSystemType;
      timecodeIn?: string;
      timecodeOut?: string;
      trackTarget?: string;
    },
  ): SupersPlacement[] {
    const extracted = extractSupersFromScript(story.scriptText);
    const system = options?.cgSystem ?? this.defaultSystem;
    const adapter = this.cgAdapters.get(system) ?? this.cgAdapters.get('GENERIC')!;
    const templateId = options?.templateId ?? this.selectTemplate(extracted);
    const template = this.getTemplate(templateId) ?? DEFAULT_CG_TEMPLATES[0];
    const trackTarget = options?.trackTarget ?? this.defaultTrackTarget;

    return extracted.map((ext, index) => {
      const supersData: SupersData = {
        id: generateSuperId(),
        storyId: story.storyId,
        personName: ext.personName,
        title: ext.title,
        location: ext.location,
        graphicTemplateId: template!.id,
        cgSystem: system,
        line1: ext.personName,
        line2: ext.title,
        line3: ext.location,
        timecodeIn: options?.timecodeIn ?? this.estimateTimecodeIn(story, index),
        timecodeOut: options?.timecodeOut,
        trackTarget,
      };

      return {
        supers: supersData,
        cgPayload: adapter.buildPayload(supersData, template!),
        cgCommand: adapter.formatCommand(supersData, template!),
      };
    });
  }

  // ─── Generate From Raw Data ────────────────────────────────────────

  generateSingle(
    data: {
      personName: string;
      title: string;
      location?: string;
      storyId: string;
    },
    options?: {
      templateId?: string;
      cgSystem?: CGSystemType;
      timecodeIn?: string;
      timecodeOut?: string;
      trackTarget?: string;
    },
  ): SupersPlacement {
    const system = options?.cgSystem ?? this.defaultSystem;
    const adapter = this.cgAdapters.get(system) ?? this.cgAdapters.get('GENERIC')!;
    const templateId = options?.templateId ?? 'lt-standard';
    const template = this.getTemplate(templateId) ?? DEFAULT_CG_TEMPLATES[0];
    const trackTarget = options?.trackTarget ?? this.defaultTrackTarget;

    const supersData: SupersData = {
      id: generateSuperId(),
      storyId: data.storyId,
      personName: data.personName,
      title: data.title,
      location: data.location,
      graphicTemplateId: template!.id,
      cgSystem: system,
      line1: data.personName,
      line2: data.title,
      line3: data.location,
      timecodeIn: options?.timecodeIn,
      timecodeOut: options?.timecodeOut,
      trackTarget,
    };

    return {
      supers: supersData,
      cgPayload: adapter.buildPayload(supersData, template!),
      cgCommand: adapter.formatCommand(supersData, template!),
    };
  }

  // ─── Internal ─────────────────────────────────────────────────────

  private selectTemplate(extracted: ExtractedSuper[]): string {
    if (extracted.length === 0) return 'lt-standard';

    const first = extracted[0];
    if (first!.location && first!.title) return 'lt-location';
    if (first!.title) return 'lt-standard';
    return 'fn-name-only';
  }

  private estimateTimecodeIn(story: RundownEvent, index: number): string {
    // Estimate placement offset: first super at ~2s, subsequent every 30s
    const offsetSeconds = 2 + index * 30;
    const hours = Math.floor(offsetSeconds / 3600);
    const minutes = Math.floor((offsetSeconds % 3600) / 60);
    const seconds = offsetSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:00`;
  }
}
