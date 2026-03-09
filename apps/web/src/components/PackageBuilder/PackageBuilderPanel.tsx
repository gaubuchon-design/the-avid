// ─── Package Builder Panel ────────────────────────────────────────────────────
// SP-11d: Sports package builder with template selection, elements checklist,
// requirements tracking, and one-click delivery.

import React, { useMemo } from 'react';
import { useSportsStore } from '../../store/sports.store';
import type { SportsPackage, PackageElement, PackageRequirement, DeliveryTarget, SportsPackageType } from '@mcua/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    DRAFT: '#888',
    IN_PROGRESS: '#f59e0b',
    REVIEW: '#818cf8',
    APPROVED: '#4ade80',
    DELIVERED: '#25a865',
    MISSING: '#ef4444',
    PLACED: '#f59e0b',
    PENDING: '#888',
    QUEUED: '#f59e0b',
    DELIVERING: '#818cf8',
    FAILED: '#ef4444',
  };
  return colors[status] ?? '#888';
}

function getElementIcon(type: PackageElement['type']): string {
  switch (type) {
    case 'CLIP': return 'V';
    case 'GRAPHIC': return 'G';
    case 'AUDIO': return 'A';
    case 'VOICEOVER': return 'VO';
    case 'STATS_CARD': return 'S';
  }
}

function getPackageTypeLabel(type: SportsPackageType): string {
  switch (type) {
    case 'PRE_GAME': return 'Pre-Game';
    case 'HALFTIME': return 'Half-Time';
    case 'POST_GAME': return 'Post-Game';
    case 'SOCIAL_CLIP': return 'Social Clip';
  }
}

// ─── Element Row ──────────────────────────────────────────────────────────────

function ElementRow({ element }: { element: PackageElement }) {
  const statusColor = getStatusColor(element.status);
  const icon = getElementIcon(element.type);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        fontSize: 12,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 3,
          background: element.status === 'MISSING' ? 'rgba(255,255,255,0.06)' : 'rgba(91,106,245,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          fontWeight: 700,
          color: element.status === 'MISSING' ? '#666' : '#5b6af5',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      <div style={{ flex: 1, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {element.label}
      </div>

      <span style={{ fontSize: 10, color: '#888', fontFamily: 'monospace' }}>
        {element.duration}s
      </span>

      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: statusColor,
          flexShrink: 0,
        }}
      />
    </div>
  );
}

// ─── Requirement Checkbox ─────────────────────────────────────────────────────

function RequirementRow({ req }: { req: PackageRequirement }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '3px 10px',
        fontSize: 11,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          border: `1px solid ${req.isMet ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
          background: req.isMet ? 'rgba(74,222,128,0.2)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          color: req.isMet ? '#4ade80' : 'transparent',
          flexShrink: 0,
        }}
      >
        {req.isMet ? '\u2713' : ''}
      </div>

      <span style={{ color: req.isMet ? '#999' : '#ccc', textDecoration: req.isMet ? 'line-through' : 'none' }}>
        {req.label}
      </span>
    </div>
  );
}

// ─── Delivery Target Row ──────────────────────────────────────────────────────

function DeliveryRow({ target }: { target: DeliveryTarget }) {
  const statusColor = getStatusColor(target.status);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 10px',
        fontSize: 11,
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: statusColor,
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, color: '#ccc' }}>{target.name}</span>
      <span style={{ color: '#888', fontSize: 10 }}>{target.format}</span>
      <span
        style={{
          color: statusColor,
          fontSize: 9,
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        {target.status}
      </span>
    </div>
  );
}

// ─── Package Card ─────────────────────────────────────────────────────────────

function PackageCard({
  pkg,
  isActive,
  onSelect,
}: {
  pkg: SportsPackage;
  isActive: boolean;
  onSelect: () => void;
}) {
  const placedCount = pkg.elements.filter((e) => e.status !== 'MISSING').length;
  const totalCount = pkg.elements.length;
  const completionPercent = Math.round((placedCount / totalCount) * 100);
  const statusColor = getStatusColor(pkg.status);

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '8px 10px',
        cursor: 'pointer',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: isActive ? 'rgba(91,106,245,0.12)' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0', flex: 1 }}>
          {pkg.name}
        </span>
        <span
          style={{
            background: statusColor,
            color: '#fff',
            padding: '1px 6px',
            borderRadius: 3,
            fontSize: 9,
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {pkg.status.replace(/_/g, ' ')}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: '#888' }}>
          {getPackageTypeLabel(pkg.type)}
        </span>
        <span style={{ fontSize: 10, color: '#666' }}>|</span>
        <span style={{ fontSize: 10, color: '#888' }}>
          {placedCount}/{totalCount} elements
        </span>

        {/* Progress bar */}
        <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
          <div
            style={{
              width: `${completionPercent}%`,
              height: '100%',
              background: completionPercent === 100 ? '#4ade80' : '#5b6af5',
              borderRadius: 2,
              transition: 'width 0.3s',
            }}
          />
        </div>

        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#aaa' }}>
          {completionPercent}%
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PackageBuilderPanel() {
  const {
    packages,
    activePackageId,
    setActivePackage,
  } = useSportsStore();

  const activePackage = useMemo(
    () => packages.find((p) => p.id === activePackageId) ?? null,
    [packages, activePackageId],
  );

  return (
    <div
      className="package-builder-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#1a1a1a',
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: '#222',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0' }}>
          Package Builder
        </span>
        <span style={{ fontSize: 11, color: '#888' }}>
          {packages.length} packages
        </span>
      </div>

      {/* Package List (when no active package) */}
      {!activePackage && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {packages.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 8,
                color: '#555',
                fontSize: 12,
              }}
            >
              <span>No packages created</span>
              <span style={{ fontSize: 10, color: '#444' }}>
                Create a Pre-Game, Half-Time, Post-Game, or Social package
              </span>
            </div>
          ) : (
            packages.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                isActive={false}
                onSelect={() => setActivePackage(pkg.id)}
              />
            ))
          )}
        </div>
      )}

      {/* Active Package Detail */}
      {activePackage && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          {/* Back button */}
          <div
            onClick={() => setActivePackage(null)}
            style={{
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 11,
              color: '#5b6af5',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            &larr; Back to packages
          </div>

          {/* Package Info */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0' }}>
              {activePackage.name}
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              {getPackageTypeLabel(activePackage.type)} | {activePackage.league}
            </div>
          </div>

          {/* Elements */}
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div
              style={{
                padding: '6px 10px',
                fontSize: 10,
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: 600,
              }}
            >
              Elements
            </div>
            {activePackage.elements.map((element) => (
              <ElementRow key={element.id} element={element} />
            ))}
          </div>

          {/* Requirements */}
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div
              style={{
                padding: '6px 10px',
                fontSize: 10,
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: 600,
              }}
            >
              Requirements
            </div>
            {activePackage.requiredElements.map((req) => (
              <RequirementRow key={req.id} req={req} />
            ))}
          </div>

          {/* Delivery Targets */}
          <div>
            <div
              style={{
                padding: '6px 10px',
                fontSize: 10,
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: 600,
              }}
            >
              Delivery
            </div>
            {activePackage.deliveryTargets.map((target) => (
              <DeliveryRow key={target.id} target={target} />
            ))}
          </div>
        </div>
      )}

      {/* Footer: Deliver All button */}
      {activePackage && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '6px 10px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            gap: 8,
          }}
        >
          <button
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: '#ccc',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              padding: '4px 12px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Auto-Fill
          </button>
          <button
            style={{
              background: '#25a865',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Deliver All
          </button>
        </div>
      )}
    </div>
  );
}
