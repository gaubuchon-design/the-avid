import React from 'react';

export type AvidEditorialGlyphName =
  | 'add-edit'
  | 'lift-overwrite'
  | 'extract-splice'
  | 'overwrite-trim'
  | 'ripple-trim';

interface AvidEditorialGlyphProps {
  name: AvidEditorialGlyphName;
  size?: number;
  title?: string;
  className?: string;
}

function LiftOverwriteGlyph() {
  return (
    <>
      <rect x="4.5" y="6" width="9" height="12" rx="1.5" />
      <path d="M15.5 8.5h4v7h-4" />
      <path d="M16 12h-4" />
      <path d="M13 9.5L10.5 12 13 14.5" />
    </>
  );
}

function ExtractSpliceGlyph() {
  return (
    <>
      <rect x="4.5" y="6" width="9" height="12" rx="1.5" />
      <path d="M15.5 8.5h4v7h-4" />
      <path d="M12 12h5" />
      <path d="M14.5 9.5L17 12l-2.5 2.5" />
    </>
  );
}

function OverwriteTrimGlyph() {
  return (
    <>
      <path d="M4.5 7.5h6v9h-6z" />
      <path d="M13.5 5.5h2v13h-2z" />
      <circle cx="18.5" cy="12" r="2" />
    </>
  );
}

function RippleTrimGlyph() {
  return (
    <>
      <path d="M4.5 7.5h6v9h-6z" />
      <path d="M13 6.5l5 5.5-5 5.5" />
      <path d="M11.5 12h6" />
    </>
  );
}

function AddEditGlyph() {
  return (
    <>
      <path d="M5 7.5h5.5" />
      <path d="M13.5 7.5H19" />
      <path d="M5 16.5h5.5" />
      <path d="M13.5 16.5H19" />
      <path d="M12 4.5v15" />
    </>
  );
}

export function AvidEditorialGlyph({
  name,
  size = 14,
  title,
  className,
}: AvidEditorialGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : 'presentation'}
    >
      {title ? <title>{title}</title> : null}
      {name === 'lift-overwrite' ? <LiftOverwriteGlyph /> : null}
      {name === 'extract-splice' ? <ExtractSpliceGlyph /> : null}
      {name === 'overwrite-trim' ? <OverwriteTrimGlyph /> : null}
      {name === 'ripple-trim' ? <RippleTrimGlyph /> : null}
      {name === 'add-edit' ? <AddEditGlyph /> : null}
    </svg>
  );
}
