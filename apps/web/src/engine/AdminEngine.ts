// =============================================================================
//  THE AVID -- Admin Engine (Team, RBAC, Audit, Storage & Token Governance)
// =============================================================================

/** User role levels in ascending order of privilege. */
export type Role = 'viewer' | 'reviewer' | 'editor' | 'senior_editor' | 'producer' | 'admin';

/** A team member with role, activity tracking, and token budget. */
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
  lastActive: number;
  tokenBudget: number;
  tokenUsed: number;
}

/** An entry in the audit log recording a user action. */
export interface AuditEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  target: string;
  timestamp: number;
  details: string;
}

/** Per-user storage consumption metrics. */
export interface StorageUsage {
  userId: string;
  userName: string;
  bytesUsed: number;
  projectCount: number;
}

/** Token usage policy for rate limiting AI operations. */
export interface TokenPolicy {
  userId?: string;
  teamId?: string;
  dailyLimit: number;
  monthlyLimit: number;
  used: number;
}

// -- Role permission matrix ---------------------------------------------------

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  viewer: ['project.view'],
  reviewer: ['project.view', 'project.comment'],
  editor: ['project.view', 'project.comment', 'project.create', 'timeline.edit', 'project.export'],
  senior_editor: [
    'project.view',
    'project.comment',
    'project.create',
    'timeline.edit',
    'project.export',
    'color.grade',
    'ai.use',
  ],
  producer: [
    'project.view',
    'project.comment',
    'project.create',
    'project.delete',
    'timeline.edit',
    'project.export',
    'color.grade',
    'ai.use',
    'billing.manage',
  ],
  admin: [
    'project.view',
    'project.comment',
    'project.create',
    'project.delete',
    'timeline.edit',
    'project.export',
    'color.grade',
    'ai.use',
    'admin.access',
    'billing.manage',
  ],
};

// -- Demo data ----------------------------------------------------------------

const now = Date.now();
const DAY = 86_400_000;
const HOUR = 3_600_000;

const DEMO_MEMBERS: TeamMember[] = [
  {
    id: 'u1',
    name: 'Sarah Kim',
    email: 'sarah.kim@studio.io',
    role: 'admin',
    avatar: undefined,
    lastActive: now - 12 * 60_000,
    tokenBudget: 5000,
    tokenUsed: 2140,
  },
  {
    id: 'u2',
    name: 'Marcus Torres',
    email: 'marcus.t@studio.io',
    role: 'senior_editor',
    avatar: undefined,
    lastActive: now - 2 * HOUR,
    tokenBudget: 3000,
    tokenUsed: 1875,
  },
  {
    id: 'u3',
    name: 'Li Wei',
    email: 'li.wei@studio.io',
    role: 'editor',
    avatar: undefined,
    lastActive: now - 5 * HOUR,
    tokenBudget: 2000,
    tokenUsed: 420,
  },
  {
    id: 'u4',
    name: 'Priya Sharma',
    email: 'priya.s@studio.io',
    role: 'producer',
    avatar: undefined,
    lastActive: now - 1 * DAY,
    tokenBudget: 4000,
    tokenUsed: 3210,
  },
  {
    id: 'u5',
    name: 'James O\'Brien',
    email: 'james.ob@studio.io',
    role: 'reviewer',
    avatar: undefined,
    lastActive: now - 3 * DAY,
    tokenBudget: 500,
    tokenUsed: 85,
  },
];

const DEMO_AUDIT: AuditEntry[] = [
  { id: 'a1', userId: 'u1', userName: 'Sarah Kim', action: 'project.create', target: 'Feature Film v2', timestamp: now - 10 * 60_000, details: 'Created new project from template' },
  { id: 'a2', userId: 'u2', userName: 'Marcus Torres', action: 'timeline.edit', target: 'Scene 3 Assembly', timestamp: now - 30 * 60_000, details: 'Trimmed 14 clips, added 3 transitions' },
  { id: 'a3', userId: 'u1', userName: 'Sarah Kim', action: 'ai.use', target: 'Agentic Assembly', timestamp: now - 1 * HOUR, details: 'Ran agentic assembly (50 tokens)' },
  { id: 'a4', userId: 'u3', userName: 'Li Wei', action: 'project.export', target: 'Rough Cut v1', timestamp: now - 2 * HOUR, details: 'Exported H.264 1080p for review' },
  { id: 'a5', userId: 'u4', userName: 'Priya Sharma', action: 'project.delete', target: 'Old Draft', timestamp: now - 4 * HOUR, details: 'Deleted archived project' },
  { id: 'a6', userId: 'u2', userName: 'Marcus Torres', action: 'color.grade', target: 'Scene 1', timestamp: now - 6 * HOUR, details: 'Applied Film Emulation LUT' },
  { id: 'a7', userId: 'u5', userName: 'James O\'Brien', action: 'project.comment', target: 'Scene 2 Review', timestamp: now - 8 * HOUR, details: 'Added 5 review comments with timecodes' },
  { id: 'a8', userId: 'u1', userName: 'Sarah Kim', action: 'admin.access', target: 'Team Settings', timestamp: now - 12 * HOUR, details: 'Updated token policy for editors' },
  { id: 'a9', userId: 'u3', userName: 'Li Wei', action: 'timeline.edit', target: 'Audio Mix', timestamp: now - 1 * DAY, details: 'Adjusted levels on A1-A4, added compressor' },
  { id: 'a10', userId: 'u4', userName: 'Priya Sharma', action: 'billing.manage', target: 'Subscription', timestamp: now - 2 * DAY, details: 'Upgraded plan to Team Pro' },
];

const DEMO_STORAGE: StorageUsage[] = [
  { userId: 'u1', userName: 'Sarah Kim', bytesUsed: 28_500_000_000, projectCount: 12 },
  { userId: 'u2', userName: 'Marcus Torres', bytesUsed: 34_200_000_000, projectCount: 8 },
  { userId: 'u3', userName: 'Li Wei', bytesUsed: 12_800_000_000, projectCount: 5 },
  { userId: 'u4', userName: 'Priya Sharma', bytesUsed: 19_600_000_000, projectCount: 15 },
  { userId: 'u5', userName: 'James O\'Brien', bytesUsed: 3_400_000_000, projectCount: 2 },
];

const DEMO_TOKEN_POLICIES: TokenPolicy[] = [
  { teamId: 'team-default', dailyLimit: 500, monthlyLimit: 10000, used: 7730 },
];

// -- Engine -------------------------------------------------------------------

/**
 * Admin engine for team management, RBAC, audit logging, storage tracking,
 * and AI token governance.
 *
 * Provides a subscribe/unsubscribe pattern so UI components (e.g. the admin
 * dashboard) can react to changes.
 */
class AdminEngine {
  private members: TeamMember[];
  private auditLog: AuditEntry[];
  private storageUsage: StorageUsage[];
  private tokenPolicies: TokenPolicy[];
  private listeners = new Set<() => void>();

  constructor() {
    this.members = DEMO_MEMBERS.map((m) => ({ ...m }));
    this.auditLog = DEMO_AUDIT.map((a) => ({ ...a }));
    this.storageUsage = DEMO_STORAGE.map((s) => ({ ...s }));
    this.tokenPolicies = DEMO_TOKEN_POLICIES.map((p) => ({ ...p }));
  }

  // -- Team management --------------------------------------------------------

  /**
   * Get all team members (returns copies to prevent external mutation).
   * @returns Array of TeamMember snapshots.
   */
  getTeamMembers(): TeamMember[] {
    return this.members.map((m) => ({ ...m }));
  }

  /**
   * Invite a new team member by email.
   * @param email The invitee's email address.
   * @param role  The role to assign.
   * @returns The newly created TeamMember.
   */
  inviteMember(email: string, role: Role): TeamMember {
    const id = `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const member: TeamMember = {
      id,
      name,
      email,
      role,
      lastActive: 0,
      tokenBudget: role === 'admin' ? 5000 : role === 'producer' ? 4000 : 2000,
      tokenUsed: 0,
    };
    this.members.push(member);
    this.logAction('u1', 'admin.access', `Invite: ${email}`, `Invited ${email} as ${role}`);
    this.notify();
    return { ...member };
  }

  /**
   * Update a member's role.
   * @param userId The user ID to update.
   * @param role   The new role.
   */
  updateMemberRole(userId: string, role: Role): void {
    const member = this.members.find((m) => m.id === userId);
    if (member) {
      const oldRole = member.role;
      member.role = role;
      this.logAction('u1', 'admin.access', member.name, `Changed role from ${oldRole} to ${role}`);
      this.notify();
    }
  }

  /**
   * Remove a team member.
   * @param userId The user ID to remove.
   */
  removeMember(userId: string): void {
    const idx = this.members.findIndex((m) => m.id === userId);
    if (idx >= 0) {
      const name = this.members[idx].name;
      this.members.splice(idx, 1);
      this.logAction('u1', 'admin.access', name, `Removed team member`);
      this.notify();
    }
  }

  // -- RBAC -------------------------------------------------------------------

  /**
   * Check whether a user has a specific permission.
   * @param userId     The user ID.
   * @param permission The permission string to check.
   * @returns `true` if the user's role grants the permission.
   */
  hasPermission(userId: string, permission: string): boolean {
    const member = this.members.find((m) => m.id === userId);
    if (!member) return false;
    return ROLE_PERMISSIONS[member.role]?.includes(permission) ?? false;
  }

  /**
   * Get all permissions granted to a role.
   * @param role The role to query.
   * @returns Array of permission strings.
   */
  getRolePermissions(role: Role): string[] {
    return [...(ROLE_PERMISSIONS[role] ?? [])];
  }

  // -- Audit ------------------------------------------------------------------

  /**
   * Retrieve audit log entries with optional filtering.
   * @param filters Optional filters for userId, action, and date range.
   * @returns Sorted array of matching AuditEntry objects (newest first).
   */
  getAuditLog(filters?: {
    userId?: string;
    action?: string;
    startDate?: number;
    endDate?: number;
  }): AuditEntry[] {
    let entries = [...this.auditLog];
    if (filters?.userId) {
      entries = entries.filter((e) => e.userId === filters.userId);
    }
    if (filters?.action) {
      entries = entries.filter((e) => e.action === filters.action);
    }
    if (filters?.startDate) {
      entries = entries.filter((e) => e.timestamp >= filters.startDate!);
    }
    if (filters?.endDate) {
      entries = entries.filter((e) => e.timestamp <= filters.endDate!);
    }
    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Record an action in the audit log.
   * @param userId  The acting user's ID.
   * @param action  The action identifier (e.g. 'project.create').
   * @param target  The target entity name.
   * @param details Human-readable description.
   */
  logAction(userId: string, action: string, target: string, details: string): void {
    const member = this.members.find((m) => m.id === userId);
    const entry: AuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      userName: member?.name ?? 'Unknown',
      action,
      target,
      timestamp: Date.now(),
      details,
    };
    this.auditLog.unshift(entry);
    this.notify();
  }

  // -- Storage ----------------------------------------------------------------

  /**
   * Get per-user storage consumption.
   * @returns Array of StorageUsage snapshots.
   */
  getStorageUsage(): StorageUsage[] {
    return this.storageUsage.map((s) => ({ ...s }));
  }

  /** Get total storage used across all users in bytes. */
  getTotalStorageUsed(): number {
    return this.storageUsage.reduce((sum, s) => sum + s.bytesUsed, 0);
  }

  /** Get the total storage quota in bytes (100 GB). */
  getStorageQuota(): number {
    return 100 * 1024 * 1024 * 1024; // 100 GB
  }

  // -- Token governance -------------------------------------------------------

  /**
   * Get all token usage policies.
   * @returns Array of TokenPolicy snapshots.
   */
  getTokenPolicies(): TokenPolicy[] {
    return this.tokenPolicies.map((p) => ({ ...p }));
  }

  /**
   * Create or update a token usage policy.
   * @param policy The policy to upsert (matched by userId or teamId).
   */
  setTokenPolicy(policy: TokenPolicy): void {
    const idx = this.tokenPolicies.findIndex(
      (p) =>
        (policy.userId && p.userId === policy.userId) ||
        (policy.teamId && p.teamId === policy.teamId),
    );
    if (idx >= 0) {
      this.tokenPolicies[idx] = { ...policy };
    } else {
      this.tokenPolicies.push({ ...policy });
    }
    this.notify();
  }

  /**
   * Get an aggregate summary of token usage across all team members.
   * @returns Object with total budget, total used, and per-user breakdown.
   */
  getTokenUsageSummary(): {
    total: number;
    used: number;
    byUser: { name: string; used: number }[];
  } {
    const total = this.members.reduce((sum, m) => sum + m.tokenBudget, 0);
    const used = this.members.reduce((sum, m) => sum + m.tokenUsed, 0);
    const byUser = this.members.map((m) => ({ name: m.name, used: m.tokenUsed }));
    return { total, used, byUser };
  }

  // -- Subscribe --------------------------------------------------------------

  /**
   * Subscribe to admin engine state changes.
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
        console.error('[AdminEngine] Listener error:', err);
      }
    });
  }
}

/** Singleton admin engine instance */
export const adminEngine = new AdminEngine();
