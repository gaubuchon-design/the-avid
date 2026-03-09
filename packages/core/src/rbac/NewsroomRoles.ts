// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Newsroom RBAC Roles (N-12)
//  Role-based access control definitions for newsroom workflow:
//  Producer, Reporter, Editor, Assignment Desk, News Director.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Permission Definitions ────────────────────────────────────────────────

export type NewsPermission =
  // Rundown
  | 'rundown:view'
  | 'rundown:edit'
  | 'rundown:reorder'
  | 'rundown:create'
  | 'rundown:delete'
  // Story
  | 'story:view'
  | 'story:edit'
  | 'story:assign'
  | 'story:approve'
  | 'story:kill'
  | 'story:create'
  // Script
  | 'script:view'
  | 'script:edit'
  | 'script:approve'
  // Timeline / Edit
  | 'timeline:view'
  | 'timeline:edit'
  | 'timeline:lock'
  // Playout
  | 'playout:send'
  | 'playout:cancel'
  | 'playout:configure'
  // Supers
  | 'supers:view'
  | 'supers:edit'
  | 'supers:approve'
  // NRCS
  | 'nrcs:connect'
  | 'nrcs:configure'
  | 'nrcs:disconnect'
  // Breaking News
  | 'breaking:acknowledge'
  | 'breaking:override'
  // Admin
  | 'admin:users'
  | 'admin:roles'
  | 'admin:destinations'
  | 'admin:templates'
  // Audio
  | 'audio:mix'
  | 'audio:loudness'
  // Review
  | 'review:comment'
  | 'review:approve'
  | 'review:request';

// ─── Newsroom Roles ────────────────────────────────────────────────────────

export type NewsroomRoleName =
  | 'NEWS_DIRECTOR'
  | 'PRODUCER'
  | 'ASSIGNMENT_DESK'
  | 'REPORTER'
  | 'EDITOR'
  | 'GRAPHICS_OPERATOR'
  | 'AUDIO_ENGINEER'
  | 'VIEWER';

export interface NewsroomRole {
  name: NewsroomRoleName;
  label: string;
  description: string;
  permissions: NewsPermission[];
  isSystem: boolean;
}

// ─── Role Definitions ──────────────────────────────────────────────────────

export const NEWS_DIRECTOR: NewsroomRole = {
  name: 'NEWS_DIRECTOR',
  label: 'News Director',
  description: 'Full access to all newsroom functions, user management, and configuration.',
  isSystem: true,
  permissions: [
    'rundown:view', 'rundown:edit', 'rundown:reorder', 'rundown:create', 'rundown:delete',
    'story:view', 'story:edit', 'story:assign', 'story:approve', 'story:kill', 'story:create',
    'script:view', 'script:edit', 'script:approve',
    'timeline:view', 'timeline:edit', 'timeline:lock',
    'playout:send', 'playout:cancel', 'playout:configure',
    'supers:view', 'supers:edit', 'supers:approve',
    'nrcs:connect', 'nrcs:configure', 'nrcs:disconnect',
    'breaking:acknowledge', 'breaking:override',
    'admin:users', 'admin:roles', 'admin:destinations', 'admin:templates',
    'audio:mix', 'audio:loudness',
    'review:comment', 'review:approve', 'review:request',
  ],
};

export const PRODUCER: NewsroomRole = {
  name: 'PRODUCER',
  label: 'Producer',
  description: 'Manage rundowns, approve stories, control playout. Cannot configure system settings.',
  isSystem: true,
  permissions: [
    'rundown:view', 'rundown:edit', 'rundown:reorder', 'rundown:create',
    'story:view', 'story:edit', 'story:assign', 'story:approve', 'story:kill', 'story:create',
    'script:view', 'script:edit', 'script:approve',
    'timeline:view', 'timeline:edit',
    'playout:send', 'playout:cancel',
    'supers:view', 'supers:edit', 'supers:approve',
    'nrcs:connect',
    'breaking:acknowledge', 'breaking:override',
    'audio:mix', 'audio:loudness',
    'review:comment', 'review:approve', 'review:request',
  ],
};

export const ASSIGNMENT_DESK: NewsroomRole = {
  name: 'ASSIGNMENT_DESK',
  label: 'Assignment Desk',
  description: 'Assign stories to editors and reporters. View and reorder rundowns.',
  isSystem: true,
  permissions: [
    'rundown:view', 'rundown:reorder',
    'story:view', 'story:assign', 'story:create',
    'script:view',
    'timeline:view',
    'supers:view',
    'breaking:acknowledge',
    'review:comment', 'review:request',
  ],
};

export const REPORTER: NewsroomRole = {
  name: 'REPORTER',
  label: 'Reporter',
  description: 'Write scripts, view rundowns, edit own stories in timeline.',
  isSystem: true,
  permissions: [
    'rundown:view',
    'story:view', 'story:edit', 'story:create',
    'script:view', 'script:edit',
    'timeline:view', 'timeline:edit',
    'supers:view', 'supers:edit',
    'breaking:acknowledge',
    'audio:mix',
    'review:comment',
  ],
};

export const EDITOR: NewsroomRole = {
  name: 'EDITOR',
  label: 'Editor',
  description: 'Full timeline editing, audio mixing, supers, and playout for assigned stories.',
  isSystem: true,
  permissions: [
    'rundown:view',
    'story:view', 'story:edit',
    'script:view',
    'timeline:view', 'timeline:edit', 'timeline:lock',
    'playout:send',
    'supers:view', 'supers:edit',
    'breaking:acknowledge',
    'audio:mix', 'audio:loudness',
    'review:comment',
  ],
};

export const GRAPHICS_OPERATOR: NewsroomRole = {
  name: 'GRAPHICS_OPERATOR',
  label: 'Graphics Operator',
  description: 'Manage supers and CG templates. Limited timeline access.',
  isSystem: true,
  permissions: [
    'rundown:view',
    'story:view',
    'script:view',
    'timeline:view',
    'supers:view', 'supers:edit', 'supers:approve',
    'admin:templates',
    'review:comment',
  ],
};

export const AUDIO_ENGINEER: NewsroomRole = {
  name: 'AUDIO_ENGINEER',
  label: 'Audio Engineer',
  description: 'Full audio mixing and loudness compliance. Timeline view only.',
  isSystem: true,
  permissions: [
    'rundown:view',
    'story:view',
    'timeline:view', 'timeline:edit',
    'audio:mix', 'audio:loudness',
    'review:comment',
  ],
};

export const VIEWER: NewsroomRole = {
  name: 'VIEWER',
  label: 'Viewer',
  description: 'Read-only access to rundowns and stories.',
  isSystem: true,
  permissions: [
    'rundown:view',
    'story:view',
    'script:view',
    'timeline:view',
    'supers:view',
  ],
};

// ─── Role Registry ─────────────────────────────────────────────────────────

export const NEWSROOM_ROLES: Record<NewsroomRoleName, NewsroomRole> = {
  NEWS_DIRECTOR,
  PRODUCER,
  ASSIGNMENT_DESK,
  REPORTER,
  EDITOR,
  GRAPHICS_OPERATOR,
  AUDIO_ENGINEER,
  VIEWER,
};

export function getRole(name: NewsroomRoleName): NewsroomRole {
  return NEWSROOM_ROLES[name];
}

export function getAllRoles(): NewsroomRole[] {
  return Object.values(NEWSROOM_ROLES);
}

export function hasPermission(role: NewsroomRoleName, permission: NewsPermission): boolean {
  return NEWSROOM_ROLES[role].permissions.includes(permission);
}

export function hasAnyPermission(role: NewsroomRoleName, permissions: NewsPermission[]): boolean {
  const rolePermissions = NEWSROOM_ROLES[role].permissions;
  return permissions.some((p) => rolePermissions.includes(p));
}

export function hasAllPermissions(role: NewsroomRoleName, permissions: NewsPermission[]): boolean {
  const rolePermissions = NEWSROOM_ROLES[role].permissions;
  return permissions.every((p) => rolePermissions.includes(p));
}

/**
 * Merge permissions from multiple roles (e.g., user with multiple roles).
 */
export function mergeRolePermissions(roles: NewsroomRoleName[]): NewsPermission[] {
  const permissionSet = new Set<NewsPermission>();
  for (const roleName of roles) {
    const role = NEWSROOM_ROLES[roleName];
    if (role) {
      for (const perm of role.permissions) {
        permissionSet.add(perm);
      }
    }
  }
  return Array.from(permissionSet);
}
