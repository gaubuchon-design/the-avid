/**
 * @module workflows/data/seed-data
 * @description Curated seed datasets for every exemplar workflow vertical.
 *
 * Each dataset provides a coherent set of media assets, bins, and optional
 * transcript segments that model a realistic post-production scenario. The
 * data is intentionally detailed enough to exercise every tool in the
 * corresponding workflow while remaining small enough for fast demo cycles.
 */

import type { SeedData } from '../types';

// ---------------------------------------------------------------------------
// Creator / Social
// ---------------------------------------------------------------------------

const CREATOR_SOCIAL: SeedData = {
  id: 'creator-social',
  name: 'Creator Social Shoot',
  description:
    'Full-day smartphone shoot for a product review channel — selfie intros, b-roll montage, ' +
    'product close-ups, and a sit-down interview. Targeting a 60-second vertical reel.',
  assets: [
    {
      id: 'cs-001',
      name: 'selfie-intro-take3.mov',
      type: 'video',
      duration: 42,
      tags: ['intro', 'selfie', 'talent', 'take-3'],
      metadata: { resolution: '1080x1920', codec: 'h264', fps: 30 },
    },
    {
      id: 'cs-002',
      name: 'broll-city-walk.mov',
      type: 'video',
      duration: 120,
      tags: ['b-roll', 'city', 'walking', 'establishing'],
      metadata: { resolution: '3840x2160', codec: 'h265', fps: 60 },
    },
    {
      id: 'cs-003',
      name: 'broll-coffee-shop.mov',
      type: 'video',
      duration: 85,
      tags: ['b-roll', 'interior', 'lifestyle'],
      metadata: { resolution: '3840x2160', codec: 'h265', fps: 60 },
    },
    {
      id: 'cs-004',
      name: 'product-closeup-hero.mov',
      type: 'video',
      duration: 35,
      tags: ['product', 'close-up', 'hero-shot', 'approved'],
      metadata: { resolution: '3840x2160', codec: 'h265', fps: 24 },
    },
    {
      id: 'cs-005',
      name: 'product-closeup-detail.mov',
      type: 'video',
      duration: 28,
      tags: ['product', 'close-up', 'detail'],
      metadata: { resolution: '3840x2160', codec: 'h265', fps: 24 },
    },
    {
      id: 'cs-006',
      name: 'interview-sit-down.mov',
      type: 'video',
      duration: 320,
      tags: ['interview', 'sit-down', 'talent', 'main-content'],
      metadata: { resolution: '1920x1080', codec: 'h264', fps: 30 },
    },
    {
      id: 'cs-007',
      name: 'trending-beat-lofi.mp3',
      type: 'audio',
      duration: 180,
      tags: ['music', 'lofi', 'trending', 'royalty-free'],
      metadata: { sampleRate: 48000, channels: 2, bitrate: 320 },
    },
    {
      id: 'cs-008',
      name: 'channel-logo-animated.png',
      type: 'image',
      duration: 0,
      tags: ['logo', 'branding', 'overlay'],
      metadata: { resolution: '1024x1024', format: 'png', hasAlpha: true },
    },
  ],
  bins: [
    {
      id: 'cs-bin-raw',
      name: 'Raw Footage',
      assetIds: ['cs-001', 'cs-002', 'cs-003', 'cs-004', 'cs-005', 'cs-006'],
    },
    {
      id: 'cs-bin-selects',
      name: 'Selects',
      assetIds: ['cs-001', 'cs-004', 'cs-007', 'cs-008'],
    },
  ],
  transcriptSegments: [
    {
      assetId: 'cs-006',
      startTime: 0,
      endTime: 12.5,
      text: 'Hey everyone, welcome back to the channel. Today I have something really special to show you.',
      speaker: 'Host',
    },
    {
      assetId: 'cs-006',
      startTime: 12.5,
      endTime: 28.3,
      text: 'I have been using this product for about two weeks now and honestly, it completely changed my daily routine.',
      speaker: 'Host',
    },
    {
      assetId: 'cs-006',
      startTime: 28.3,
      endTime: 45.0,
      text: 'The build quality is incredible. You can feel the weight of it in your hand — it just feels premium.',
      speaker: 'Host',
    },
    {
      assetId: 'cs-006',
      startTime: 45.0,
      endTime: 62.1,
      text: 'Let me walk you through the main features one by one, starting with the design.',
      speaker: 'Host',
    },
    {
      assetId: 'cs-006',
      startTime: 62.1,
      endTime: 80.0,
      text: 'And the battery life? Honestly, I forgot to charge it for three days and it was still at forty percent.',
      speaker: 'Host',
    },
  ],
};

// ---------------------------------------------------------------------------
// Sports / Live Production
// ---------------------------------------------------------------------------

const SPORTS_LIVE: SeedData = {
  id: 'sports-live',
  name: 'Sports Live Game Coverage',
  description:
    'Multi-camera live production of a regional basketball game — four camera angles, ' +
    'instant replay, post-game interview, crowd reactions, and broadcast audio feeds.',
  assets: [
    {
      id: 'sl-001',
      name: 'cam1-center-court.mxf',
      type: 'video',
      duration: 5400,
      tags: ['camera', 'center-court', 'wide', 'main'],
      metadata: { resolution: '1920x1080', codec: 'xdcam', fps: 59.94 },
    },
    {
      id: 'sl-002',
      name: 'cam2-baseline-left.mxf',
      type: 'video',
      duration: 5400,
      tags: ['camera', 'baseline', 'left', 'close-up'],
      metadata: { resolution: '1920x1080', codec: 'xdcam', fps: 59.94 },
    },
    {
      id: 'sl-003',
      name: 'cam3-baseline-right.mxf',
      type: 'video',
      duration: 5400,
      tags: ['camera', 'baseline', 'right', 'close-up'],
      metadata: { resolution: '1920x1080', codec: 'xdcam', fps: 59.94 },
    },
    {
      id: 'sl-004',
      name: 'cam4-handheld-bench.mxf',
      type: 'video',
      duration: 5400,
      tags: ['camera', 'handheld', 'bench', 'reactions'],
      metadata: { resolution: '1920x1080', codec: 'xdcam', fps: 59.94 },
    },
    {
      id: 'sl-005',
      name: 'replay-dunk-q3-04-22.mxf',
      type: 'video',
      duration: 18,
      tags: ['replay', 'highlight', 'dunk', 'q3'],
      metadata: { resolution: '1920x1080', codec: 'xdcam', fps: 59.94, superSlow: true },
    },
    {
      id: 'sl-006',
      name: 'post-game-interview-mvp.mxf',
      type: 'video',
      duration: 180,
      tags: ['interview', 'post-game', 'mvp', 'talent'],
      metadata: { resolution: '1920x1080', codec: 'xdcam', fps: 29.97 },
    },
    {
      id: 'sl-007',
      name: 'crowd-celebration-buzzer.mxf',
      type: 'video',
      duration: 45,
      tags: ['crowd', 'celebration', 'buzzer-beater', 'reaction'],
      metadata: { resolution: '1920x1080', codec: 'xdcam', fps: 59.94 },
    },
    {
      id: 'sl-008',
      name: 'scoreboard-overlay.png',
      type: 'image',
      duration: 0,
      tags: ['scoreboard', 'overlay', 'graphics'],
      metadata: { resolution: '1920x1080', format: 'png', hasAlpha: true },
    },
    {
      id: 'sl-009',
      name: 'ambient-arena-stereo.wav',
      type: 'audio',
      duration: 5400,
      tags: ['ambient', 'arena', 'crowd-noise', 'stereo'],
      metadata: { sampleRate: 48000, channels: 2, bitDepth: 24 },
    },
    {
      id: 'sl-010',
      name: 'commentary-booth.wav',
      type: 'audio',
      duration: 5400,
      tags: ['commentary', 'announcer', 'booth', 'broadcast'],
      metadata: { sampleRate: 48000, channels: 2, bitDepth: 24 },
    },
  ],
  bins: [
    {
      id: 'sl-bin-cameras',
      name: 'Camera Isos',
      assetIds: ['sl-001', 'sl-002', 'sl-003', 'sl-004'],
    },
    {
      id: 'sl-bin-highlights',
      name: 'Highlights',
      assetIds: ['sl-005', 'sl-006', 'sl-007', 'sl-008'],
    },
    {
      id: 'sl-bin-audio',
      name: 'Audio',
      assetIds: ['sl-009', 'sl-010'],
    },
  ],
};

// ---------------------------------------------------------------------------
// Multilingual / Localization
// ---------------------------------------------------------------------------

const MULTILINGUAL_INTERVIEW: SeedData = {
  id: 'multilingual-interview',
  name: 'Multilingual Interview Package',
  description:
    'Corporate interview piece with a CEO — main camera, b-roll of the office, branded graphics, ' +
    'lower-third templates, and intro/outro sequences. Destined for Spanish, French, and Japanese markets.',
  assets: [
    {
      id: 'ml-001',
      name: 'ceo-interview-main.mxf',
      type: 'video',
      duration: 480,
      tags: ['interview', 'ceo', 'main-camera', 'a-roll'],
      metadata: { resolution: '3840x2160', codec: 'prores422', fps: 23.976 },
    },
    {
      id: 'ml-002',
      name: 'office-broll-montage.mxf',
      type: 'video',
      duration: 240,
      tags: ['b-roll', 'office', 'establishing', 'team'],
      metadata: { resolution: '3840x2160', codec: 'prores422', fps: 23.976 },
    },
    {
      id: 'ml-003',
      name: 'brand-graphics-pack.mov',
      type: 'video',
      duration: 15,
      tags: ['graphics', 'brand', 'motion-graphics', 'animated'],
      metadata: { resolution: '1920x1080', codec: 'proresHQ', fps: 23.976, hasAlpha: true },
    },
    {
      id: 'ml-004',
      name: 'lower-third-template.mov',
      type: 'video',
      duration: 8,
      tags: ['lower-third', 'template', 'name-super', 'graphics'],
      metadata: { resolution: '1920x1080', codec: 'proresHQ', fps: 23.976, hasAlpha: true },
    },
    {
      id: 'ml-005',
      name: 'intro-sequence.mov',
      type: 'video',
      duration: 12,
      tags: ['intro', 'opening', 'brand', 'animated'],
      metadata: { resolution: '1920x1080', codec: 'proresHQ', fps: 23.976 },
    },
    {
      id: 'ml-006',
      name: 'outro-sequence.mov',
      type: 'video',
      duration: 10,
      tags: ['outro', 'closing', 'brand', 'animated'],
      metadata: { resolution: '1920x1080', codec: 'proresHQ', fps: 23.976 },
    },
  ],
  bins: [
    {
      id: 'ml-bin-project',
      name: 'Project',
      assetIds: ['ml-001', 'ml-002', 'ml-003', 'ml-004', 'ml-005', 'ml-006'],
    },
  ],
  transcriptSegments: [
    {
      assetId: 'ml-001',
      startTime: 0,
      endTime: 15.2,
      text: 'Thank you for having me. I am excited to share what we have been building over the past year.',
      speaker: 'CEO',
    },
    {
      assetId: 'ml-001',
      startTime: 15.2,
      endTime: 32.8,
      text: 'Our vision has always been to make professional tools accessible to everyone, regardless of their background.',
      speaker: 'CEO',
    },
    {
      assetId: 'ml-001',
      startTime: 32.8,
      endTime: 48.5,
      text: 'We launched three major features this quarter and the response from the creative community has been phenomenal.',
      speaker: 'CEO',
    },
    {
      assetId: 'ml-001',
      startTime: 48.5,
      endTime: 65.0,
      text: 'The collaboration engine alone saved our beta users an average of four hours per project.',
      speaker: 'CEO',
    },
    {
      assetId: 'ml-001',
      startTime: 65.0,
      endTime: 82.3,
      text: 'Looking ahead, we are doubling down on AI-assisted workflows. The goal is to remove repetitive tasks entirely.',
      speaker: 'CEO',
    },
    {
      assetId: 'ml-001',
      startTime: 82.3,
      endTime: 98.1,
      text: 'Localization is a huge priority for us. We want creators to reach audiences in every language.',
      speaker: 'CEO',
    },
    {
      assetId: 'ml-001',
      startTime: 98.1,
      endTime: 115.0,
      text: 'I truly believe that the best creative work happens when the tools get out of the way.',
      speaker: 'CEO',
    },
    {
      assetId: 'ml-001',
      startTime: 115.0,
      endTime: 130.0,
      text: 'Thank you to the entire team. None of this would be possible without their dedication and passion.',
      speaker: 'CEO',
    },
  ],
};

// ---------------------------------------------------------------------------
// Audio Cleanup
// ---------------------------------------------------------------------------

const AUDIO_CLEANUP: SeedData = {
  id: 'audio-cleanup',
  name: 'Audio Cleanup Session',
  description:
    'Interview recorded on location with noticeable HVAC background noise. Includes room-tone ' +
    'reference, a music bed for temp scoring, transition SFX, and a rough voiceover draft.',
  assets: [
    {
      id: 'ac-001',
      name: 'interview-raw-location.wav',
      type: 'audio',
      duration: 600,
      tags: ['interview', 'raw', 'noisy', 'location', 'hvac-noise'],
      metadata: { sampleRate: 48000, channels: 1, bitDepth: 24, peakDb: -3.2, lufs: -18.5 },
    },
    {
      id: 'ac-002',
      name: 'room-tone-30s.wav',
      type: 'audio',
      duration: 30,
      tags: ['room-tone', 'reference', 'noise-profile'],
      metadata: { sampleRate: 48000, channels: 1, bitDepth: 24 },
    },
    {
      id: 'ac-003',
      name: 'music-bed-ambient-piano.wav',
      type: 'audio',
      duration: 240,
      tags: ['music', 'ambient', 'piano', 'underscore', 'royalty-free'],
      metadata: { sampleRate: 48000, channels: 2, bitDepth: 24, lufs: -28 },
    },
    {
      id: 'ac-004',
      name: 'sfx-transition-whoosh.wav',
      type: 'audio',
      duration: 2,
      tags: ['sfx', 'transition', 'whoosh', 'effect'],
      metadata: { sampleRate: 48000, channels: 2, bitDepth: 24 },
    },
    {
      id: 'ac-005',
      name: 'voiceover-draft-v2.wav',
      type: 'audio',
      duration: 90,
      tags: ['voiceover', 'draft', 'narration', 'v2'],
      metadata: { sampleRate: 48000, channels: 1, bitDepth: 24, lufs: -20 },
    },
  ],
  bins: [
    {
      id: 'ac-bin-raw',
      name: 'Raw Audio',
      assetIds: ['ac-001', 'ac-002', 'ac-005'],
    },
    {
      id: 'ac-bin-music',
      name: 'Music & SFX',
      assetIds: ['ac-003', 'ac-004'],
    },
  ],
};

// ---------------------------------------------------------------------------
// Contextual Archive / Corporate
// ---------------------------------------------------------------------------

const ARCHIVE_CORPORATE: SeedData = {
  id: 'archive-corporate',
  name: 'Corporate Archive Library',
  description:
    'Three years of corporate video assets — CEO keynotes, product demos, factory tours, team ' +
    'photos, and brand elements. The brief is a 2-minute brand reel pulling the best bites.',
  assets: [
    {
      id: 'ar-001',
      name: 'ceo-keynote-2024-annual.mxf',
      type: 'video',
      duration: 1800,
      tags: ['ceo', 'keynote', 'annual-meeting', '2024', 'approved', 'executive'],
      metadata: { resolution: '3840x2160', codec: 'prores422', fps: 23.976, campaign: 'annual-2024' },
    },
    {
      id: 'ar-002',
      name: 'product-demo-v3-launch.mxf',
      type: 'video',
      duration: 420,
      tags: ['product', 'demo', 'launch', '2023', 'close-up', 'approved'],
      metadata: { resolution: '3840x2160', codec: 'prores422', fps: 23.976, campaign: 'product-launch-2023' },
    },
    {
      id: 'ar-003',
      name: 'factory-tour-bts.mxf',
      type: 'video',
      duration: 900,
      tags: ['factory', 'behind-the-scenes', 'manufacturing', 'b-roll'],
      metadata: { resolution: '1920x1080', codec: 'h264', fps: 29.97, campaign: 'brand-story-2023' },
    },
    {
      id: 'ar-004',
      name: 'team-photo-all-hands-2025.jpg',
      type: 'image',
      duration: 0,
      tags: ['team', 'photo', 'all-hands', '2025', 'people'],
      metadata: { resolution: '6000x4000', format: 'jpeg' },
    },
    {
      id: 'ar-005',
      name: 'logo-animation-v4.mov',
      type: 'video',
      duration: 5,
      tags: ['logo', 'animation', 'brand', 'ident', 'approved'],
      metadata: { resolution: '1920x1080', codec: 'proresHQ', fps: 23.976, hasAlpha: true },
    },
    {
      id: 'ar-006',
      name: 'quarterly-results-chart-q4.mov',
      type: 'video',
      duration: 20,
      tags: ['chart', 'quarterly', 'results', 'motion-graphics', 'q4-2024'],
      metadata: { resolution: '1920x1080', codec: 'proresHQ', fps: 23.976 },
    },
    {
      id: 'ar-007',
      name: 'customer-testimonial-acme.mxf',
      type: 'video',
      duration: 150,
      tags: ['testimonial', 'customer', 'acme-corp', 'approved', 'interview'],
      metadata: { resolution: '1920x1080', codec: 'h264', fps: 23.976, campaign: 'customer-stories-2024' },
    },
    {
      id: 'ar-008',
      name: 'aerial-drone-hq-campus.mxf',
      type: 'video',
      duration: 90,
      tags: ['aerial', 'drone', 'campus', 'establishing', 'hero-shot', 'b-roll'],
      metadata: { resolution: '3840x2160', codec: 'h265', fps: 23.976 },
    },
  ],
  bins: [
    {
      id: 'ar-bin-executives',
      name: 'Executives',
      assetIds: ['ar-001', 'ar-007'],
    },
    {
      id: 'ar-bin-products',
      name: 'Products',
      assetIds: ['ar-002', 'ar-006'],
    },
    {
      id: 'ar-bin-broll',
      name: 'B-Roll & Brand',
      assetIds: ['ar-003', 'ar-004', 'ar-005', 'ar-008'],
    },
  ],
};

// ---------------------------------------------------------------------------
// Generative / VFX
// ---------------------------------------------------------------------------

const GENERATIVE_VFX: SeedData = {
  id: 'generative-vfx',
  name: 'Generative VFX Composite',
  description:
    'Green-screen studio shoot for a product hero spot — talent plate, green screen footage, ' +
    'background plate, particle references, logo reveal, and dust stock elements.',
  assets: [
    {
      id: 'gv-001',
      name: 'hero-shot-talent-plate.mxf',
      type: 'video',
      duration: 30,
      tags: ['hero', 'talent', 'plate', 'main', 'studio'],
      metadata: { resolution: '3840x2160', codec: 'prores4444', fps: 23.976, hasShake: true },
    },
    {
      id: 'gv-002',
      name: 'green-screen-plate.mxf',
      type: 'video',
      duration: 30,
      tags: ['green-screen', 'plate', 'keying', 'chroma'],
      metadata: { resolution: '3840x2160', codec: 'prores4444', fps: 23.976, chromaKey: 'green' },
    },
    {
      id: 'gv-003',
      name: 'bg-plate-cityscape-sunset.exr',
      type: 'video',
      duration: 30,
      tags: ['background', 'plate', 'cityscape', 'sunset', 'cg'],
      metadata: { resolution: '3840x2160', codec: 'exr', fps: 23.976, hdr: true },
    },
    {
      id: 'gv-004',
      name: 'particle-ref-embers.mov',
      type: 'video',
      duration: 10,
      tags: ['particle', 'reference', 'embers', 'vfx', 'stock'],
      metadata: { resolution: '1920x1080', codec: 'proresHQ', fps: 23.976, hasAlpha: true },
    },
    {
      id: 'gv-005',
      name: 'logo-reveal-3d.mov',
      type: 'video',
      duration: 8,
      tags: ['logo', 'reveal', '3d', 'animation', 'brand'],
      metadata: { resolution: '1920x1080', codec: 'proresHQ', fps: 23.976, hasAlpha: true },
    },
    {
      id: 'gv-006',
      name: 'dust-stock-atmospheric.mov',
      type: 'video',
      duration: 15,
      tags: ['dust', 'atmospheric', 'stock', 'overlay', 'organic'],
      metadata: { resolution: '1920x1080', codec: 'proresHQ', fps: 23.976, hasAlpha: true },
    },
  ],
  bins: [
    {
      id: 'gv-bin-plates',
      name: 'Plates',
      assetIds: ['gv-001', 'gv-002', 'gv-003'],
    },
    {
      id: 'gv-bin-references',
      name: 'References & Stock',
      assetIds: ['gv-004', 'gv-005', 'gv-006'],
    },
  ],
};

// ---------------------------------------------------------------------------
// Registry Export
// ---------------------------------------------------------------------------

/**
 * Complete collection of seed datasets keyed by identifier.
 *
 * Used by the {@link WorkflowRunner} to resolve seed data for any registered
 * workflow via its `seedDataId`.
 */
export const SEED_DATASETS: Readonly<Record<string, SeedData>> = {
  'creator-social': CREATOR_SOCIAL,
  'sports-live': SPORTS_LIVE,
  'multilingual-interview': MULTILINGUAL_INTERVIEW,
  'audio-cleanup': AUDIO_CLEANUP,
  'archive-corporate': ARCHIVE_CORPORATE,
  'generative-vfx': GENERATIVE_VFX,
};
