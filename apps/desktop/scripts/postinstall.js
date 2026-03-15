#!/usr/bin/env node

const { execFileSync } = require('node:child_process');

function main() {
  if (process.platform === 'linux' || process.env.CI === 'true' || process.env.SKIP_DESKTOP_INSTALL_APP_DEPS === 'true') {
    console.log('[desktop] Skipping electron-builder install-app-deps for this environment.');
    return;
  }

  const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeVersion >= 23) {
    console.warn(
      `[desktop] WARNING: Node ${process.versions.node} detected. ` +
      `Native modules (macadam, grandiose, @eyevinn/srt) require Node 20 or 22 LTS to build. ` +
      `Please switch to Node 20 LTS (see .nvmrc). Skipping install-app-deps.`
    );
    return;
  }

  try {
    execFileSync('npx', ['electron-builder', 'install-app-deps'], {
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('[desktop] install-app-deps failed. Native modules may not be bundled.');
    console.error('[desktop] Ensure you are using Node 20 LTS and have required SDKs installed.');
    console.error('[desktop] Error:', err.message);
    // Don't fail the install — optional deps will degrade gracefully
  }
}

main();
