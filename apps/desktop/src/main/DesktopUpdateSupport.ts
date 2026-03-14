import path from 'node:path';
import { readFileSync } from 'node:fs';

const SHARED_KEY_HEADER = 'X-Desktop-Update-Key';

export interface DesktopUpdateFeedConfig {
  channel: string;
  requestHeaders: Record<string, string>;
  url: string;
}

export interface ResolveDesktopUpdateFeedConfigOptions {
  appPath: string;
  channel: string;
  env?: NodeJS.ProcessEnv;
  forceDevUpdateConfig?: boolean;
  resourcesPath: string;
}

export interface DesktopUpdateErrorSummary {
  detail: string;
  kind: 'http' | 'network' | 'unauthorized' | 'unknown';
  statusCode: number | null;
  userMessage: string;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseDesktopUpdateConfig(rawConfig: string): Partial<DesktopUpdateFeedConfig> {
  const headers: Record<string, string> = {};
  let inHeadersBlock = false;
  let url: string | undefined;
  let channel: string | undefined;

  for (const line of rawConfig.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const indent = line.match(/^\s*/)?.[0].length ?? 0;

    if (inHeadersBlock) {
      if (indent === 0) {
        inHeadersBlock = false;
      } else {
        const separatorIndex = trimmed.indexOf(':');
        if (separatorIndex > 0) {
          const key = trimmed.slice(0, separatorIndex).trim();
          const value = stripQuotes(trimmed.slice(separatorIndex + 1));
          if (key && value) {
            headers[key] = value;
          }
        }
        continue;
      }
    }

    if (indent !== 0) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = stripQuotes(trimmed.slice(separatorIndex + 1));

    if (key === 'requestHeaders') {
      inHeadersBlock = true;
      continue;
    }

    if (key === 'url') {
      url = value;
    }

    if (key === 'channel') {
      channel = value;
    }
  }

  return {
    channel,
    requestHeaders: headers,
    url,
  };
}

export function resolveDesktopUpdateConfigPath(options: ResolveDesktopUpdateFeedConfigOptions): string {
  if (options.forceDevUpdateConfig) {
    return path.join(options.appPath, 'dev-app-update.yml');
  }

  return path.join(options.resourcesPath, 'app-update.yml');
}

export function resolveDesktopUpdateFeedConfig(
  options: ResolveDesktopUpdateFeedConfigOptions,
): DesktopUpdateFeedConfig | null {
  const configPath = resolveDesktopUpdateConfigPath(options);
  let parsedConfig: Partial<DesktopUpdateFeedConfig> = {};

  try {
    parsedConfig = parseDesktopUpdateConfig(readFileSync(configPath, 'utf8'));
  } catch {
    parsedConfig = {};
  }

  const runtimeHeaders: Record<string, string> = {
    ...(parsedConfig.requestHeaders ?? {}),
  };

  const runtimeSharedKey = options.env?.['DESKTOP_UPDATE_SHARED_KEY']?.trim();
  if (runtimeSharedKey) {
    runtimeHeaders[SHARED_KEY_HEADER] = runtimeSharedKey;
  }

  if (!parsedConfig.url) {
    return null;
  }

  return {
    channel: parsedConfig.channel || options.channel,
    requestHeaders: runtimeHeaders,
    url: parsedConfig.url,
  };
}

function extractHttpStatus(detail: string): number | null {
  const statusMatch = detail.match(/\b([45]\d{2})\b/);
  if (!statusMatch) {
    return null;
  }

  const parsed = Number(statusMatch[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function summarizeDesktopUpdateError(error: unknown): DesktopUpdateErrorSummary {
  const detail = error instanceof Error ? error.message : String(error);
  const compactDetail = detail.replace(/\s+/g, ' ').trim();
  const statusCode = extractHttpStatus(compactDetail);

  if (statusCode === 401 || /unauthorized/i.test(compactDetail)) {
    return {
      detail: compactDetail,
      kind: 'unauthorized',
      statusCode,
      userMessage: 'Automatic updates are not configured for this build. Reinstall from a release build or rebuild with desktop update credentials.',
    };
  }

  if (
    /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_INTERNET_DISCONNECTED|ERR_NETWORK/i.test(compactDetail)
  ) {
    return {
      detail: compactDetail,
      kind: 'network',
      statusCode,
      userMessage: 'Automatic updates are unavailable right now. Check your network connection and try again.',
    };
  }

  if (statusCode !== null) {
    return {
      detail: compactDetail,
      kind: 'http',
      statusCode,
      userMessage: `Automatic update check failed with HTTP ${statusCode}. Please try again in a moment.`,
    };
  }

  return {
    detail: compactDetail,
    kind: 'unknown',
    statusCode,
    userMessage: 'Automatic update check failed. Please try again.',
  };
}
