#!/usr/bin/env node

const { execFileSync } = require('node:child_process');

function main() {
  if (process.platform === 'linux') {
    console.log('[desktop] Skipping electron-builder install-app-deps on Linux.');
    return;
  }

  execFileSync('npx', ['electron-builder', 'install-app-deps'], {
    stdio: 'inherit',
  });
}

main();
