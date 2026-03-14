#!/usr/bin/env node

const { execFileSync } = require('node:child_process');

function main() {
  if (process.platform === 'linux' || process.env.CI === 'true' || process.env.SKIP_DESKTOP_INSTALL_APP_DEPS === 'true') {
    console.log('[desktop] Skipping electron-builder install-app-deps for this environment.');
    return;
  }

  execFileSync('npx', ['electron-builder', 'install-app-deps'], {
    stdio: 'inherit',
  });
}

main();
