import React from 'react';
import type { ProjectTemplate } from '@mcua/core';

interface ProjectGlyphProps {
  template: ProjectTemplate;
  size?: number;
  stroke?: string;
  strokeWidth?: number;
}

export function ProjectGlyph({
  template,
  size = 18,
  stroke = 'currentColor',
  strokeWidth = 1.7,
}: ProjectGlyphProps) {
  const common = {
    fill: 'none',
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (template) {
    case 'film':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="14" rx="2" {...common} />
          <path d="M8 5v14M16 5v14M4 9h16M4 15h16" {...common} />
        </svg>
      );
    case 'documentary':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 4h7l3 3v13H7z" {...common} />
          <path d="M14 4v4h4" {...common} />
          <path d="M10 11h4M10 15h4" {...common} />
        </svg>
      );
    case 'commercial':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="6" width="17" height="12" rx="2" {...common} />
          <path d="M7 18v2M17 18v2M9 4h6" {...common} />
        </svg>
      );
    case 'podcast':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="9" y="4" width="6" height="10" rx="3" {...common} />
          <path d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6" {...common} />
        </svg>
      );
    case 'sports':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="7" {...common} />
          <path d="M12 5v14M5 12h14M7.5 7.5l9 9M16.5 7.5l-9 9" {...common} />
        </svg>
      );
    case 'news':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="5" width="14" height="14" rx="2" {...common} />
          <path d="M8 9h8M8 12h8M8 15h5" {...common} />
        </svg>
      );
    case 'social':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="3.5" width="10" height="17" rx="2.5" {...common} />
          <path d="M10 7h4M9.5 17h5" {...common} />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="7" {...common} />
          <path d="M12 9v3l2 2" {...common} />
        </svg>
      );
  }
}
