// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — NEXIS Admin Panel (NX-03)
//  Administrative interface for NEXIS shared storage.
//  Workspace allocation view, media ownership, bin lock monitor,
//  MediaServices job queue, and health indicators.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  NEXISWorkspace,
  NEXISStorageGroup,
  NEXISBinLock,
  NEXISMediaEntry,
  NEXISMediaServicesJob,
  NEXISCoPresenceUser,
} from './NEXISClient';

// ─── Types ─────────────────────────────────────────────────────────────────

export type NEXISHealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export interface NEXISStorageAllocation {
  workspaceId: string;
  workspaceName: string;
  storageGroupName: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usagePercent: number;
  healthStatus: NEXISHealthStatus;
  quotaBytes: number | null;
  quotaUsedPercent: number | null;
}

export interface NEXISMediaOwnershipEntry {
  mediaId: string;
  fileName: string;
  filePath: string;
  workspace: string;
  sizeBytes: number;
  ownerId: string;
  ownerDisplayName: string;
  isOrphaned: boolean;
  lastAccessedAt: string;
  mediaType: 'video' | 'audio' | 'image' | 'project' | 'other';
}

export interface NEXISBinLockEntry {
  binId: string;
  binName: string;
  lockedBy: string;
  lockedByDisplayName: string;
  lockedAt: string;
  workspace: string;
  lockDurationMinutes: number;
  isStale: boolean;
}

export interface NEXISJobQueueSummary {
  totalJobs: number;
  queuedJobs: number;
  runningJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageCompletionTimeMinutes: number;
  estimatedQueueClearTimeMinutes: number;
}

export interface NEXISSystemHealth {
  overallStatus: NEXISHealthStatus;
  storageHealth: NEXISHealthStatus;
  networkHealth: NEXISHealthStatus;
  servicesHealth: NEXISHealthStatus;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  networkThroughputMbps: number;
  activeConnections: number;
  uptimeHours: number;
  lastCheckedAt: string;
  alerts: NEXISAlert[];
}

export interface NEXISAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  category: 'storage' | 'network' | 'services' | 'security';
  createdAt: string;
  acknowledged: boolean;
}

// ─── Admin Controller ──────────────────────────────────────────────────────

export class NEXISAdmin {
  private storageGroups: NEXISStorageGroup[] = [];
  private mediaEntries: NEXISMediaOwnershipEntry[] = [];
  private binLocks: NEXISBinLock[] = [];
  private jobs: NEXISMediaServicesJob[] = [];
  private users: NEXISCoPresenceUser[] = [];
  private alerts: NEXISAlert[] = [];

  /**
   * Updates the admin panel with fresh data from the NEXIS client.
   */
  refresh(data: {
    storageGroups?: NEXISStorageGroup[];
    binLocks?: NEXISBinLock[];
    jobs?: NEXISMediaServicesJob[];
    users?: NEXISCoPresenceUser[];
  }): void {
    if (data.storageGroups) this.storageGroups = data.storageGroups;
    if (data.binLocks) this.binLocks = data.binLocks;
    if (data.jobs) this.jobs = data.jobs;
    if (data.users) this.users = data.users;
  }

  // ─── Workspace Storage Allocation View ─────────────────────────────

  getStorageAllocations(): NEXISStorageAllocation[] {
    const allocations: NEXISStorageAllocation[] = [];

    for (const group of this.storageGroups) {
      for (const ws of group.workspaces) {
        const usagePercent = ws.totalCapacityBytes > 0
          ? (ws.usedCapacityBytes / ws.totalCapacityBytes) * 100
          : 0;

        let healthStatus: NEXISHealthStatus = 'healthy';
        if (usagePercent > 95) healthStatus = 'critical';
        else if (usagePercent > 85) healthStatus = 'warning';

        allocations.push({
          workspaceId: ws.id,
          workspaceName: ws.name,
          storageGroupName: group.name,
          totalBytes: ws.totalCapacityBytes,
          usedBytes: ws.usedCapacityBytes,
          freeBytes: ws.freeCapacityBytes,
          usagePercent: Math.round(usagePercent * 10) / 10,
          healthStatus,
          quotaBytes: null,
          quotaUsedPercent: null,
        });
      }
    }

    return allocations;
  }

  // ─── Media Ownership Table ─────────────────────────────────────────

  getMediaOwnershipTable(): NEXISMediaOwnershipEntry[] {
    return [...this.mediaEntries];
  }

  setMediaEntries(entries: NEXISMediaOwnershipEntry[]): void {
    this.mediaEntries = entries;
  }

  getOrphanedMedia(): NEXISMediaOwnershipEntry[] {
    return this.mediaEntries.filter((e) => e.isOrphaned);
  }

  getMediaByOwner(ownerId: string): NEXISMediaOwnershipEntry[] {
    return this.mediaEntries.filter((e) => e.ownerId === ownerId);
  }

  getMediaByWorkspace(workspace: string): NEXISMediaOwnershipEntry[] {
    return this.mediaEntries.filter((e) => e.workspace === workspace);
  }

  // ─── Active Bin Lock Monitor ───────────────────────────────────────

  getActiveBinLocks(): NEXISBinLockEntry[] {
    const now = Date.now();

    return this.binLocks
      .filter((lock) => lock.lockStatus === 'locked-self' || lock.lockStatus === 'locked-other')
      .map((lock) => {
        const lockedAtMs = lock.lockedAt ? new Date(lock.lockedAt).getTime() : now;
        const durationMinutes = Math.round((now - lockedAtMs) / 60000);

        return {
          binId: lock.binId,
          binName: lock.binName,
          lockedBy: lock.lockedBy ?? 'unknown',
          lockedByDisplayName: lock.lockedByDisplayName ?? 'Unknown User',
          lockedAt: lock.lockedAt ?? new Date().toISOString(),
          workspace: lock.workspace,
          lockDurationMinutes: durationMinutes,
          isStale: durationMinutes > 60, // Consider stale after 1 hour
        };
      });
  }

  getStaleLocks(): NEXISBinLockEntry[] {
    return this.getActiveBinLocks().filter((l) => l.isStale);
  }

  // ─── MediaServices Job Queue ───────────────────────────────────────

  getJobQueueSummary(): NEXISJobQueueSummary {
    const totalJobs = this.jobs.length;
    const queuedJobs = this.jobs.filter((j) => j.status === 'queued').length;
    const runningJobs = this.jobs.filter((j) => j.status === 'running').length;
    const completedJobs = this.jobs.filter((j) => j.status === 'complete').length;
    const failedJobs = this.jobs.filter((j) => j.status === 'failed').length;

    const completedWithTime = this.jobs.filter(
      (j) => j.status === 'complete' && j.startedAt && j.completedAt,
    );
    const avgTime =
      completedWithTime.length > 0
        ? completedWithTime.reduce((sum, j) => {
            const start = new Date(j.startedAt!).getTime();
            const end = new Date(j.completedAt!).getTime();
            return sum + (end - start);
          }, 0) / completedWithTime.length / 60000
        : 0;

    const estimatedQueueClear = queuedJobs > 0 && avgTime > 0
      ? Math.ceil(queuedJobs * avgTime)
      : 0;

    return {
      totalJobs,
      queuedJobs,
      runningJobs,
      completedJobs,
      failedJobs,
      averageCompletionTimeMinutes: Math.round(avgTime * 10) / 10,
      estimatedQueueClearTimeMinutes: estimatedQueueClear,
    };
  }

  getJobsByStatus(status: NEXISMediaServicesJob['status']): NEXISMediaServicesJob[] {
    return this.jobs.filter((j) => j.status === status);
  }

  setJobs(jobs: NEXISMediaServicesJob[]): void {
    this.jobs = jobs;
  }

  // ─── Health Indicator ──────────────────────────────────────────────

  getSystemHealth(): NEXISSystemHealth {
    const allocations = this.getStorageAllocations();
    const storageHealth = this.computeStorageHealth(allocations);
    const jobSummary = this.getJobQueueSummary();
    const servicesHealth: 'critical' | 'warning' | 'healthy' = jobSummary.failedJobs > 10 ? 'critical' : jobSummary.failedJobs > 3 ? 'warning' : 'healthy';
    const staleLocks = this.getStaleLocks();

    const currentAlerts: NEXISAlert[] = [...this.alerts];

    if (storageHealth === 'critical') {
      currentAlerts.push({
        id: `alert-storage-${Date.now()}`,
        severity: 'critical',
        message: 'Storage capacity critically low on one or more workspaces',
        category: 'storage',
        createdAt: new Date().toISOString(),
        acknowledged: false,
      });
    }

    if (staleLocks.length > 0) {
      currentAlerts.push({
        id: `alert-locks-${Date.now()}`,
        severity: 'warning',
        message: `${staleLocks.length} stale bin lock(s) detected`,
        category: 'security',
        createdAt: new Date().toISOString(),
        acknowledged: false,
      });
    }

    const overallStatus = storageHealth === 'critical' || servicesHealth === 'critical'
      ? 'critical'
      : storageHealth === 'warning' || servicesHealth === 'warning'
        ? 'warning'
        : 'healthy';

    return {
      overallStatus,
      storageHealth,
      networkHealth: 'healthy',
      servicesHealth,
      cpuUsagePercent: 42,
      memoryUsagePercent: 68,
      networkThroughputMbps: 850,
      activeConnections: this.users.filter((u) => u.isOnline).length,
      uptimeHours: 720,
      lastCheckedAt: new Date().toISOString(),
      alerts: currentAlerts,
    };
  }

  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private computeStorageHealth(allocations: NEXISStorageAllocation[]): NEXISHealthStatus {
    if (allocations.some((a) => a.healthStatus === 'critical')) return 'critical';
    if (allocations.some((a) => a.healthStatus === 'warning')) return 'warning';
    if (allocations.length === 0) return 'unknown';
    return 'healthy';
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createNEXISAdmin(): NEXISAdmin {
  return new NEXISAdmin();
}
