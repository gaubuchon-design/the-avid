# The Avid -- API Reference

Base path: `/api/v1`

Local default:

```text
http://localhost:4000/api/v1
```

Notes:

- The web app usually reaches the API through Vite proxying from
  `http://localhost:3001`.
- This file is a maintained repository reference, not a generated OpenAPI
  document.
- Most endpoints return JSON. Authenticated endpoints require a `Bearer` token
  in the `Authorization` header.

---

## Authentication

### POST /auth/register

Create a new user account.

**Body:**

```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "displayName": "Jane Editor"
}
```

**Response (201):**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "Jane Editor"
  },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

New accounts are provisioned with 100 AI tokens, FREE subscription tier, and
default preferences.

---

### POST /auth/login

Authenticate an existing user.

**Body:**

```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200):**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "Jane Editor",
    "avatarUrl": null,
    "subscription": { "tier": "FREE", "status": "ACTIVE" }
  },
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

**Errors:**

| Status | Code           | Description                                    |
| ------ | -------------- | ---------------------------------------------- |
| 401    | `UNAUTHORIZED` | Invalid email or password                      |
| 429    | `RATE_LIMITED` | Too many auth attempts (max 20 per 15 minutes) |

---

### POST /auth/refresh

Exchange a valid refresh token for a new access/refresh token pair. The old
refresh token is revoked (rotation).

**Body:**

```json
{
  "refreshToken": "eyJ..."
}
```

**Response (200):**

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

**Errors:**

| Status | Code           | Description                                |
| ------ | -------------- | ------------------------------------------ |
| 401    | `UNAUTHORIZED` | Invalid, expired, or revoked refresh token |

---

### POST /auth/logout

Revoke the provided refresh token. Requires authentication.

**Body:**

```json
{
  "refreshToken": "eyJ..."
}
```

**Response:** `204 No Content`

---

### GET /auth/me

Get the authenticated user's profile.

**Response (200):**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "emailVerified": false,
    "displayName": "Jane Editor",
    "avatarUrl": null,
    "bio": null,
    "timezone": null,
    "locale": null,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "lastActiveAt": "2025-06-01T12:00:00.000Z",
    "subscription": { "tier": "FREE", "status": "ACTIVE", "currentPeriodEnd": null },
    "tokenBalance": { "balance": 85 },
    "preferences": { ... }
  }
}
```

---

### PATCH /auth/me

Update the authenticated user's profile.

**Body (all fields optional):**

```json
{
  "displayName": "Jane Senior Editor",
  "bio": "10 years of broadcast editing experience",
  "timezone": "America/New_York",
  "locale": "en-US",
  "avatarUrl": "https://..."
}
```

---

### POST /auth/change-password

Change the authenticated user's password. Revokes all existing refresh tokens.

**Body:**

```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newSecurePassword456"
}
```

---

## AI Endpoints

All AI endpoints require authentication. AI operations consume tokens from the
user's balance.

### Token Costs

| Job Type        | Cost |
| --------------- | ---- |
| TRANSCRIPTION   | 10   |
| ASSEMBLY        | 50   |
| PHRASE_SEARCH   | 2    |
| SMART_REFRAME   | 20   |
| VOICE_ISOLATION | 25   |
| OBJECT_MASK     | 30   |
| AUTO_CAPTIONS   | 15   |
| HIGHLIGHTS      | 40   |
| COMPLIANCE_SCAN | 10   |
| SCENE_DETECTION | 15   |
| MUSIC_BEATS     | 5    |
| SCRIPT_SYNC     | 30   |

### POST /ai/jobs

Create and queue an AI job.

**Body:**

```json
{
  "type": "TRANSCRIPTION",
  "mediaAssetId": "uuid",
  "projectId": "uuid",
  "inputParams": { "language": "en", "diarize": true },
  "priority": 7
}
```

**Response (202):**

```json
{
  "job": {
    "id": "uuid",
    "type": "TRANSCRIPTION",
    "status": "QUEUED",
    "tokensUsed": 10,
    "queuedAt": "2025-06-01T12:00:00.000Z"
  },
  "tokensDeducted": 10
}
```

### GET /ai/jobs

List the authenticated user's AI jobs. Supports pagination and filtering.

**Query Parameters:**

| Param     | Type   | Description                                                      |
| --------- | ------ | ---------------------------------------------------------------- |
| page      | number | Page number (default 1)                                          |
| limit     | number | Items per page (default 20)                                      |
| type      | string | Filter by job type                                               |
| status    | string | Filter by status (QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED) |
| projectId | string | Filter by project                                                |

### GET /ai/jobs/:id

Get a specific AI job by ID.

### DELETE /ai/jobs/:id

Cancel a queued or running AI job. Tokens are refunded if the job was still in
QUEUED status.

### POST /ai/transcribe

Quick transcription shortcut.

**Body:**

```json
{
  "mediaAssetId": "uuid",
  "language": "en",
  "diarize": false
}
```

### POST /ai/phrase-search

Semantic search across all transcripts in a project.

**Body:**

```json
{
  "projectId": "uuid",
  "query": "dramatic reveal",
  "searchType": "semantic"
}
```

**searchType options:** `phonetic`, `semantic`, `visual`

### POST /ai/script-sync

Sync a script to footage using AI analysis.

**Body:**

```json
{
  "projectId": "uuid",
  "scriptText": "INT. OFFICE - DAY\nThe detective enters...",
  "mediaAssetIds": ["uuid1", "uuid2"]
}
```

### POST /ai/assembly

Generate an AI-powered first-pass timeline assembly.

**Body:**

```json
{
  "projectId": "uuid",
  "timelineId": "uuid",
  "prompt": "Create a narrative cut focusing on dialogue scenes",
  "role": "editor",
  "mediaAssetIds": ["uuid1", "uuid2"]
}
```

### POST /ai/highlights

Extract highlight moments from footage.

**Body:**

```json
{
  "mediaAssetId": "uuid",
  "projectId": "uuid",
  "criteria": "action,emotion,key-moments",
  "maxDuration": 90
}
```

### GET /ai/tokens

Get the user's current token balance and recent transactions.

---

## Frontend AI Integration

The browser editor currently has two client-side AI extension paths:

- a direct Gemini REST client in `apps/web/src/ai/GeminiClient.ts`
- an MCP client in `apps/web/src/ai/MCPClient.ts`

Server-side AI routes in `apps/api` are separately configured through
OpenAI-compatible environment variables.

### Configuration

Set `VITE_GEMINI_API_KEY` in your web environment if you want browser-side
Gemini calls:

```
VITE_GEMINI_API_KEY=your_api_key_here
```

When no Gemini API key is configured, the web AI client falls back to a local
stub response path for common editing intents.

### Models

| Model ID                       | Alias   | Current Use                                      |
| ------------------------------ | ------- | ------------------------------------------------ |
| `gemini-2.5-pro-preview-05-06` | `pro`   | Heavier reasoning/planning in the browser client |
| `gemini-2.0-flash`             | `flash` | Faster browser-side responses                    |

### Client API

```typescript
import { geminiClient } from './ai/GeminiClient';

// Check if API key is configured
geminiClient.isConfigured();

// Set API key at runtime
geminiClient.setApiKey('your_key');

// Chat (non-streaming)
const response = await geminiClient.chat(
  messages,
  tools,
  systemPrompt,
  'flash'
);

// Chat (streaming)
await geminiClient.streamChat(messages, tools, systemPrompt, 'pro', (chunk) => {
  console.log(chunk);
});

// Transcribe audio
const result = await geminiClient.transcribe(audioBlob);

// Generate captions
const captions = await geminiClient.generateCaptions(transcriptText, 'en');
```

---

## MCP Server Configuration

The current browser MCP client uses a WebSocket JSON-RPC transport.

To configure an MCP server, add it in the client, connect over WebSocket, then
discover tools dynamically. Those discovered tools can be surfaced into the
editor’s agent tooling path.

---

## Health Checks

### GET /health

Returns server status, version, uptime, and environment.

### GET /health/db

Returns database connectivity status.

---

## Environment Variables

### API Server (`apps/api`)

| Variable                     | Required | Default                           | Description                                                                       |
| ---------------------------- | -------- | --------------------------------- | --------------------------------------------------------------------------------- |
| `DATABASE_URL`               | Yes      | --                                | PostgreSQL connection string                                                      |
| `JWT_SECRET`                 | No       | `dev-secret-change-in-production` | JWT signing secret                                                                |
| `JWT_EXPIRES_IN`             | No       | `7d`                              | Access token TTL                                                                  |
| `JWT_REFRESH_EXPIRES_IN`     | No       | `30d`                             | Refresh token TTL                                                                 |
| `PORT`                       | No       | `4000`                            | API server port                                                                   |
| `API_BASE_URL`               | No       | `http://localhost:4000`           | Public API URL                                                                    |
| `REDIS_URL`                  | No       | `redis://localhost:6379`          | Redis connection URL                                                              |
| `OPENAI_API_KEY`             | No       | --                                | OpenAI API key for server-side AI (Whisper, GPT-4o)                               |
| `OPENAI_TRANSCRIPTION_MODEL` | No       | `whisper-1`                       | Whisper model for transcription                                                   |
| `OPENAI_ASSEMBLY_MODEL`      | No       | `gpt-4o`                          | Model for agentic assembly                                                        |
| `AWS_REGION`                 | No       | `us-east-1`                       | AWS region                                                                        |
| `S3_BUCKET_MEDIA`            | No       | `avid-media-assets`               | S3 bucket for media assets                                                        |
| `S3_BUCKET_PROXIES`          | No       | `avid-media-proxies`              | S3 bucket for proxy files                                                         |
| `S3_BUCKET_EXPORTS`          | No       | `avid-exports`                    | S3 bucket for exports                                                             |
| `STRIPE_SECRET_KEY`          | No       | --                                | Stripe secret key for billing                                                     |
| `FFMPEG_PATH`                | No       | `ffmpeg`                          | Path to FFmpeg binary                                                             |
| `ALLOWED_ORIGINS`            | No       | `http://localhost:3000`           | Comma-separated CORS origins; include `http://localhost:3001` for the Vite editor |
| `RATE_LIMIT_MAX`             | No       | `1000`                            | Max requests per window                                                           |

### Web App (`apps/web`)

| Variable              | Required | Default                 | Description                               |
| --------------------- | -------- | ----------------------- | ----------------------------------------- |
| `VITE_GEMINI_API_KEY` | No       | --                      | Google Gemini API key for browser-side AI |
| `VITE_API_BASE_URL`   | No       | `/api`                  | Base path used by runtime API helpers     |
| `VITE_API_URL`        | No       | `http://localhost:4000` | Dev proxy target used by `vite.config.ts` |
