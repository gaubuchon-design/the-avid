import { describe, expect, it } from 'vitest';
import {
  parseDesktopUpdateConfig,
  summarizeDesktopUpdateError,
} from '../DesktopUpdateSupport';

describe('DesktopUpdateSupport', () => {
  it('parses updater config request headers from app-update.yml', () => {
    expect(parseDesktopUpdateConfig(`
provider: generic
url: https://the-avid-desktop-updates.vercel.app/desktop-updates/stable
channel: stable
requestHeaders:
  X-Desktop-Update-Key: "super-secret"
updaterCacheDirName: "@mcuadesktop-updater"
`)).toEqual({
      channel: 'stable',
      requestHeaders: {
        'X-Desktop-Update-Key': 'super-secret',
      },
      url: 'https://the-avid-desktop-updates.vercel.app/desktop-updates/stable',
    });
  });

  it('summarizes unauthorized updater errors into a concise message', () => {
    const summary = summarizeDesktopUpdateError(
      new Error('401 "method: GET url: https://the-avid-desktop-updates.vercel.app/desktop-updates/stable/stable-mac.yml Data: {\\"error\\":\\"Unauthorized\\"}"'),
    );

    expect(summary.kind).toBe('unauthorized');
    expect(summary.statusCode).toBe(401);
    expect(summary.userMessage).toContain('Automatic updates are not configured for this build');
  });

  it('summarizes network updater errors into a retryable message', () => {
    const summary = summarizeDesktopUpdateError(new Error('connect ECONNREFUSED 127.0.0.1:443'));

    expect(summary.kind).toBe('network');
    expect(summary.userMessage).toContain('Check your network connection');
  });
});
