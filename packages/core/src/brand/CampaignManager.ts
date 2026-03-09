// ─── Campaign Manager ────────────────────────────────────────────────────────
// Above-project campaign layer: campaign with brief, dates, brand kit,
// deliverables, markets, deliverable status pipeline, campaign-level token
// budget, and campaign dashboard visualization.

import { generateId } from '../utils';
import type {
  CampaignProject,
  Deliverable,
  DeliverableStatus,
  ApprovalStep,
} from './types';

// ─── In-memory store ─────────────────────────────────────────────────────────

const campaignStore = new Map<string, CampaignProject>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ─── Deliverable Status Pipeline ─────────────────────────────────────────────

const STATUS_ORDER: DeliverableStatus[] = [
  'brief',
  'in-production',
  'review',
  'approved',
  'delivered',
];

export function getNextStatus(current: DeliverableStatus): DeliverableStatus | null {
  const idx = STATUS_ORDER.indexOf(current);
  return idx >= 0 && idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] ?? null : null;
}

export function getPreviousStatus(current: DeliverableStatus): DeliverableStatus | null {
  const idx = STATUS_ORDER.indexOf(current);
  return idx > 0 ? STATUS_ORDER[idx - 1] ?? null : null;
}

export function getStatusLabel(status: DeliverableStatus): string {
  const labels: Record<DeliverableStatus, string> = {
    'brief': 'Brief',
    'in-production': 'In Production',
    'review': 'Review',
    'approved': 'Approved',
    'delivered': 'Delivered',
  };
  return labels[status];
}

// ─── Campaign CRUD ───────────────────────────────────────────────────────────

export function createCampaign(
  params: Omit<CampaignProject, 'id' | 'tokensUsed' | 'status' | 'createdAt' | 'updatedAt'>,
): CampaignProject {
  const campaign: CampaignProject = {
    id: generateId(),
    name: params.name,
    brief: params.brief,
    startDate: params.startDate,
    endDate: params.endDate,
    brandKitId: params.brandKitId,
    deliverables: clone(params.deliverables),
    markets: [...params.markets],
    tokenBudget: params.tokenBudget,
    tokensUsed: 0,
    status: 'planning',
    createdAt: now(),
    updatedAt: now(),
  };
  campaignStore.set(campaign.id, clone(campaign));
  return clone(campaign);
}

export function getCampaign(id: string): CampaignProject | null {
  const campaign = campaignStore.get(id);
  return campaign ? clone(campaign) : null;
}

export function listCampaigns(): CampaignProject[] {
  return Array.from(campaignStore.values())
    .map(clone)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function updateCampaign(
  id: string,
  patch: Partial<Omit<CampaignProject, 'id' | 'createdAt'>>,
): CampaignProject {
  const existing = campaignStore.get(id);
  if (!existing) throw new Error(`Campaign not found: ${id}`);
  const updated: CampaignProject = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now(),
  };
  campaignStore.set(id, clone(updated));
  return clone(updated);
}

export function deleteCampaign(id: string): void {
  if (!campaignStore.has(id)) throw new Error(`Campaign not found: ${id}`);
  campaignStore.delete(id);
}

// ─── Deliverable management ──────────────────────────────────────────────────

export function addDeliverable(
  campaignId: string,
  deliverable: Omit<Deliverable, 'id'>,
): Deliverable {
  const campaign = campaignStore.get(campaignId);
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

  const newDeliverable: Deliverable = {
    id: generateId(),
    ...clone(deliverable),
  };
  campaign.deliverables.push(clone(newDeliverable));
  campaign.updatedAt = now();
  campaignStore.set(campaignId, clone(campaign));
  return clone(newDeliverable);
}

export function updateDeliverableStatus(
  campaignId: string,
  deliverableId: string,
  status: DeliverableStatus,
): Deliverable {
  const campaign = campaignStore.get(campaignId);
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

  const deliverable = campaign.deliverables.find((d) => d.id === deliverableId);
  if (!deliverable) throw new Error(`Deliverable not found: ${deliverableId}`);

  deliverable.status = status;
  campaign.updatedAt = now();

  // Auto-update campaign status based on deliverables
  campaign.status = inferCampaignStatus(campaign);
  campaignStore.set(campaignId, clone(campaign));
  return clone(deliverable);
}

export function assignEditor(
  campaignId: string,
  deliverableId: string,
  editor: string,
): Deliverable {
  const campaign = campaignStore.get(campaignId);
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

  const deliverable = campaign.deliverables.find((d) => d.id === deliverableId);
  if (!deliverable) throw new Error(`Deliverable not found: ${deliverableId}`);

  deliverable.assignedEditor = editor;
  campaign.updatedAt = now();
  campaignStore.set(campaignId, clone(campaign));
  return clone(deliverable);
}

// ─── Approval chain ──────────────────────────────────────────────────────────

export function addApprovalStep(
  campaignId: string,
  deliverableId: string,
  reviewer: string,
  role: string,
): ApprovalStep {
  const campaign = campaignStore.get(campaignId);
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

  const deliverable = campaign.deliverables.find((d) => d.id === deliverableId);
  if (!deliverable) throw new Error(`Deliverable not found: ${deliverableId}`);

  const step: ApprovalStep = {
    id: generateId(),
    reviewer,
    role,
    status: 'pending',
  };
  deliverable.approvalChain.push(clone(step));
  campaign.updatedAt = now();
  campaignStore.set(campaignId, clone(campaign));
  return clone(step);
}

export function reviewDeliverable(
  campaignId: string,
  deliverableId: string,
  stepId: string,
  decision: 'approved' | 'rejected',
  notes?: string,
): ApprovalStep {
  const campaign = campaignStore.get(campaignId);
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

  const deliverable = campaign.deliverables.find((d) => d.id === deliverableId);
  if (!deliverable) throw new Error(`Deliverable not found: ${deliverableId}`);

  const step = deliverable.approvalChain.find((s) => s.id === stepId);
  if (!step) throw new Error(`Approval step not found: ${stepId}`);

  step.status = decision;
  step.notes = notes;
  step.reviewedAt = now();

  // Auto-advance deliverable status if all approvers approve
  if (decision === 'approved') {
    const allApproved = deliverable.approvalChain.every((s) => s.status === 'approved');
    if (allApproved && deliverable.status === 'review') {
      deliverable.status = 'approved';
    }
  }

  campaign.updatedAt = now();
  campaign.status = inferCampaignStatus(campaign);
  campaignStore.set(campaignId, clone(campaign));
  return clone(step);
}

// ─── Token Budget ────────────────────────────────────────────────────────────

export function deductTokens(campaignId: string, amount: number): number {
  const campaign = campaignStore.get(campaignId);
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

  const remaining = campaign.tokenBudget - campaign.tokensUsed;
  if (amount > remaining) {
    throw new Error(`Insufficient token budget. Remaining: ${remaining}, Requested: ${amount}`);
  }

  campaign.tokensUsed += amount;
  campaign.updatedAt = now();
  campaignStore.set(campaignId, clone(campaign));
  return campaign.tokenBudget - campaign.tokensUsed;
}

export function getTokenUsage(campaignId: string): { budget: number; used: number; remaining: number } {
  const campaign = campaignStore.get(campaignId);
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
  return {
    budget: campaign.tokenBudget,
    used: campaign.tokensUsed,
    remaining: campaign.tokenBudget - campaign.tokensUsed,
  };
}

// ─── Dashboard statistics ────────────────────────────────────────────────────

export interface CampaignDashboardStats {
  totalDeliverables: number;
  byStatus: Record<DeliverableStatus, number>;
  completionPercent: number;
  tokenUsagePercent: number;
  overdueCount: number;
}

export function getCampaignStats(campaignId: string): CampaignDashboardStats {
  const campaign = campaignStore.get(campaignId);
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

  const byStatus: Record<DeliverableStatus, number> = {
    'brief': 0,
    'in-production': 0,
    'review': 0,
    'approved': 0,
    'delivered': 0,
  };

  let overdueCount = 0;
  const nowDate = new Date();

  for (const d of campaign.deliverables) {
    byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
    if (d.dueDate && new Date(d.dueDate) < nowDate && d.status !== 'delivered') {
      overdueCount++;
    }
  }

  const total = campaign.deliverables.length;
  const delivered = byStatus['delivered'];
  const completionPercent = total > 0 ? Math.round((delivered / total) * 100) : 0;
  const tokenUsagePercent = campaign.tokenBudget > 0
    ? Math.round((campaign.tokensUsed / campaign.tokenBudget) * 100)
    : 0;

  return {
    totalDeliverables: total,
    byStatus,
    completionPercent,
    tokenUsagePercent,
    overdueCount,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function inferCampaignStatus(campaign: CampaignProject): CampaignProject['status'] {
  if (campaign.deliverables.length === 0) return 'planning';
  const allDelivered = campaign.deliverables.every((d) => d.status === 'delivered');
  if (allDelivered) return 'complete';
  const anyInProgress = campaign.deliverables.some(
    (d) => d.status !== 'brief' && d.status !== 'delivered',
  );
  return anyInProgress ? 'active' : 'planning';
}

// ─── Seed data ───────────────────────────────────────────────────────────────

export function seedDemoCampaign(brandKitId: string): CampaignProject {
  return createCampaign({
    name: 'Q1 2026 Brand Launch',
    brief: 'Launch the refreshed Acme brand across all digital channels. Hero spot + 4 cutdowns + social variants per market.',
    startDate: '2026-01-15',
    endDate: '2026-03-31',
    brandKitId,
    markets: ['US', 'UK', 'DE', 'FR', 'JP'],
    tokenBudget: 5000,
    deliverables: [
      {
        id: generateId(),
        name: 'Hero Spot :60',
        type: 'hero',
        status: 'in-production',
        assignedEditor: 'Sarah K.',
        approvalChain: [
          { id: generateId(), reviewer: 'Creative Director', role: 'CD', status: 'pending' },
          { id: generateId(), reviewer: 'Brand Manager', role: 'Brand', status: 'pending' },
        ],
        platform: 'YouTube',
        aspectRatio: '16:9',
        duration: 60,
        dueDate: '2026-02-28',
      },
      {
        id: generateId(),
        name: 'Cutdown :30',
        type: 'cutdown',
        status: 'brief',
        approvalChain: [
          { id: generateId(), reviewer: 'Creative Director', role: 'CD', status: 'pending' },
        ],
        platform: 'Meta',
        aspectRatio: '16:9',
        duration: 30,
        dueDate: '2026-03-07',
      },
      {
        id: generateId(),
        name: 'Social Vertical :15',
        type: 'social',
        status: 'brief',
        approvalChain: [],
        platform: 'TikTok',
        aspectRatio: '9:16',
        duration: 15,
        dueDate: '2026-03-14',
      },
      {
        id: generateId(),
        name: 'Pre-roll :06',
        type: 'bumper',
        status: 'brief',
        approvalChain: [],
        platform: 'YouTube',
        aspectRatio: '16:9',
        duration: 6,
        dueDate: '2026-03-14',
      },
    ],
  });
}

// ─── Reset (for tests) ──────────────────────────────────────────────────────

export function _resetCampaignStore(): void {
  campaignStore.clear();
}
