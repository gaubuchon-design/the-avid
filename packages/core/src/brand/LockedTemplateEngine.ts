// ─── Locked Template Engine ──────────────────────────────────────────────────
// Brand-protected templates with locked vs editable elements, padlock icon
// support, override request workflow, template versioning, and brand admin
// management.

import { generateId } from '../utils';
import type {
  LockedTemplate,
  TemplateElement,
  OverrideRequest,
} from './types';

// ─── In-memory stores ────────────────────────────────────────────────────────

const templateStore = new Map<string, LockedTemplate>();
const overrideRequestStore = new Map<string, OverrideRequest>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ─── Template CRUD ───────────────────────────────────────────────────────────

export function createTemplate(
  name: string,
  brandKitId: string,
  elements: TemplateElement[],
  lockedElementIds: string[],
  createdBy: string,
): LockedTemplate {
  const template: LockedTemplate = {
    id: generateId(),
    name,
    brandKitId,
    elements: clone(elements),
    lockedElementIds: [...lockedElementIds],
    version: 1,
    createdBy,
    createdAt: now(),
    updatedAt: now(),
  };
  templateStore.set(template.id, clone(template));
  return clone(template);
}

export function getTemplate(id: string): LockedTemplate | null {
  const t = templateStore.get(id);
  return t ? clone(t) : null;
}

export function listTemplates(brandKitId?: string): LockedTemplate[] {
  const all = Array.from(templateStore.values());
  const filtered = brandKitId
    ? all.filter((t) => t.brandKitId === brandKitId)
    : all;
  return filtered.map(clone);
}

export function deleteTemplate(id: string): void {
  if (!templateStore.has(id)) {
    throw new Error(`Template not found: ${id}`);
  }
  templateStore.delete(id);
}

// ─── Element locking ─────────────────────────────────────────────────────────

/** Check whether a specific element is locked (brand-protected). */
export function isElementLocked(template: LockedTemplate, elementId: string): boolean {
  return template.lockedElementIds.includes(elementId);
}

/** Lock an element (brand admin only). Bumps version. */
export function lockElement(templateId: string, elementId: string): LockedTemplate {
  const template = templateStore.get(templateId);
  if (!template) throw new Error(`Template not found: ${templateId}`);
  if (!template.elements.some((e) => e.id === elementId)) {
    throw new Error(`Element not found: ${elementId}`);
  }
  if (!template.lockedElementIds.includes(elementId)) {
    template.lockedElementIds.push(elementId);
    const element = template.elements.find((e) => e.id === elementId);
    if (element) element.locked = true;
  }
  template.version += 1;
  template.updatedAt = now();
  templateStore.set(templateId, clone(template));
  return clone(template);
}

/** Unlock an element (brand admin only). Bumps version. */
export function unlockElement(templateId: string, elementId: string): LockedTemplate {
  const template = templateStore.get(templateId);
  if (!template) throw new Error(`Template not found: ${templateId}`);
  template.lockedElementIds = template.lockedElementIds.filter((id) => id !== elementId);
  const element = template.elements.find((e) => e.id === elementId);
  if (element) element.locked = false;
  template.version += 1;
  template.updatedAt = now();
  templateStore.set(templateId, clone(template));
  return clone(template);
}

// ─── Element editing (respects locks) ────────────────────────────────────────

export interface EditElementResult {
  success: boolean;
  template?: LockedTemplate;
  error?: string;
}

/** Update an element's content. Fails if the element is locked. */
export function editElement(
  templateId: string,
  elementId: string,
  contentPatch: Record<string, unknown>,
): EditElementResult {
  const template = templateStore.get(templateId);
  if (!template) return { success: false, error: 'Template not found.' };

  if (isElementLocked(template, elementId)) {
    return {
      success: false,
      error: 'This element is brand-locked. Submit an override request to modify it.',
    };
  }

  const element = template.elements.find((e) => e.id === elementId);
  if (!element) return { success: false, error: 'Element not found.' };

  if (!element.editable) {
    return { success: false, error: 'This element is not editable.' };
  }

  element.content = { ...element.content, ...contentPatch };
  template.updatedAt = now();
  templateStore.set(templateId, clone(template));
  return { success: true, template: clone(template) };
}

// ─── Override requests ───────────────────────────────────────────────────────

export function requestOverride(
  templateId: string,
  elementId: string,
  requestedBy: string,
  reason: string,
): OverrideRequest {
  const template = templateStore.get(templateId);
  if (!template) throw new Error(`Template not found: ${templateId}`);
  if (!template.lockedElementIds.includes(elementId)) {
    throw new Error('Element is not locked; no override needed.');
  }

  const request: OverrideRequest = {
    id: generateId(),
    templateId,
    elementId,
    requestedBy,
    reason,
    status: 'pending',
    createdAt: now(),
  };
  overrideRequestStore.set(request.id, clone(request));
  return clone(request);
}

export function listOverrideRequests(templateId?: string): OverrideRequest[] {
  const all = Array.from(overrideRequestStore.values());
  const filtered = templateId
    ? all.filter((r) => r.templateId === templateId)
    : all;
  return filtered.map(clone);
}

export function reviewOverride(
  requestId: string,
  decision: 'approved' | 'rejected',
  reviewedBy: string,
): OverrideRequest {
  const request = overrideRequestStore.get(requestId);
  if (!request) throw new Error(`Override request not found: ${requestId}`);
  if (request.status !== 'pending') {
    throw new Error('Override request has already been reviewed.');
  }

  request.status = decision;
  request.reviewedBy = reviewedBy;
  request.reviewedAt = now();
  overrideRequestStore.set(requestId, clone(request));

  // If approved, temporarily unlock the element for one edit
  if (decision === 'approved') {
    const template = templateStore.get(request.templateId);
    if (template) {
      const element = template.elements.find((e) => e.id === request.elementId);
      if (element) {
        element.editable = true;
      }
      template.updatedAt = now();
      templateStore.set(request.templateId, clone(template));
    }
  }

  return clone(request);
}

// ─── Template versioning ─────────────────────────────────────────────────────

/** Create a new version of a template (deep copy with bumped version number). */
export function createTemplateVersion(templateId: string): LockedTemplate {
  const template = templateStore.get(templateId);
  if (!template) throw new Error(`Template not found: ${templateId}`);

  const newVersion: LockedTemplate = {
    ...clone(template),
    id: generateId(),
    version: template.version + 1,
    createdAt: now(),
    updatedAt: now(),
  };
  templateStore.set(newVersion.id, clone(newVersion));
  return clone(newVersion);
}

// ─── Seed data ───────────────────────────────────────────────────────────────

export function seedDemoTemplates(brandKitId: string): LockedTemplate[] {
  const logoElement: TemplateElement = {
    id: 'el-logo-1',
    type: 'logo',
    position: { x: 40, y: 40, width: 160, height: 60, rotation: 0, zIndex: 10 },
    locked: true,
    editable: false,
    content: { logoVariant: 'primary', opacity: 1 },
    label: 'Brand Logo',
  };

  const endcardElement: TemplateElement = {
    id: 'el-endcard-1',
    type: 'endcard',
    position: { x: 0, y: 0, width: 1920, height: 1080, rotation: 0, zIndex: 0 },
    locked: true,
    editable: false,
    content: { background: '#1A1A2E', ctaText: 'Learn More' },
    label: 'End Card',
  };

  const editableText: TemplateElement = {
    id: 'el-text-1',
    type: 'text',
    position: { x: 240, y: 300, width: 600, height: 80, rotation: 0, zIndex: 5 },
    locked: false,
    editable: true,
    content: { text: 'Your headline here', font: 'Montserrat', size: 48, color: '#FFFFFF' },
    label: 'Headline',
  };

  const ctaElement: TemplateElement = {
    id: 'el-cta-1',
    type: 'cta',
    position: { x: 760, y: 800, width: 400, height: 60, rotation: 0, zIndex: 8 },
    locked: true,
    editable: false,
    content: { text: 'Shop Now', background: '#E94560', textColor: '#FFFFFF' },
    label: 'CTA Button',
  };

  const heroTemplate = createTemplate(
    'Brand Hero Spot',
    brandKitId,
    [logoElement, endcardElement, editableText, ctaElement],
    ['el-logo-1', 'el-endcard-1', 'el-cta-1'],
    'brand-admin',
  );

  const socialTemplate = createTemplate(
    'Social Cutdown 15s',
    brandKitId,
    [
      { ...logoElement, id: 'el-logo-2', position: { ...logoElement.position, x: 20, y: 20, width: 100, height: 38 } },
      { ...editableText, id: 'el-text-2', position: { ...editableText.position, x: 40, y: 200, width: 1000, height: 60 } },
    ],
    ['el-logo-2'],
    'brand-admin',
  );

  return [heroTemplate, socialTemplate];
}

// ─── Reset (for tests) ──────────────────────────────────────────────────────

export function _resetTemplateStore(): void {
  templateStore.clear();
  overrideRequestStore.clear();
}
