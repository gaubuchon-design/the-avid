#!/usr/bin/env node

/**
 * CLI entry point for the distributed render agent.
 *
 * Usage:
 *   avid-render-agent --coordinator ws://host:4000/render --worker-types ingest,render --name my-node
 *
 * Options:
 *   --coordinator <url>    WebSocket URL of the coordinator server (required)
 *   --worker-types <list>  Comma-separated worker types to enable (default: all)
 *   --name <hostname>      Node name / hostname override
 *   --help                 Show this help message
 */

import { RenderAgent } from './index.js';
import { detectCapabilities } from './capabilities.js';
import type { WorkerJobType } from './index.js';

interface CLIArgs {
  coordinator: string;
  workerTypes: WorkerJobType[];
  name: string | undefined;
}

function parseArgs(argv: string[]): CLIArgs {
  const args = argv.slice(2);
  let coordinator = '';
  let workerTypesStr = '';
  let name: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--coordinator':
        coordinator = args[++i] ?? '';
        break;
      case '--worker-types':
        workerTypesStr = args[++i] ?? '';
        break;
      case '--name':
        name = args[++i];
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        if (args[i]!.startsWith('--')) {
          console.error(`Unknown option: ${args[i]}`);
          printUsage();
          process.exit(1);
        }
    }
  }

  if (!coordinator) {
    console.error('Error: --coordinator is required');
    printUsage();
    process.exit(1);
  }

  const allTypes: WorkerJobType[] = ['ingest', 'transcode', 'transcribe', 'metadata', 'render', 'encode', 'effects'];
  const workerTypes: WorkerJobType[] = workerTypesStr
    ? (workerTypesStr.split(',').map((s) => s.trim()) as WorkerJobType[])
    : allTypes;

  return { coordinator, workerTypes, name };
}

function printUsage(): void {
  console.log(`
avid-render-agent — Distributed render farm worker node

Usage:
  avid-render-agent --coordinator <url> [--worker-types <list>] [--name <hostname>]

Options:
  --coordinator <url>    WebSocket URL of the coordinator (required)
  --worker-types <list>  Comma-separated: ingest,render,transcode,transcribe,metadata,encode,effects
  --name <hostname>      Override auto-detected hostname
  --help, -h             Show this help message
`.trim());
}

async function main(): Promise<void> {
  const { coordinator, workerTypes, name } = parseArgs(process.argv);

  console.log('[render-agent] Detecting system capabilities...');
  const capabilities = await detectCapabilities();
  console.log(`[render-agent] CPU: ${capabilities.cpuCores} cores, ${capabilities.memoryGB} GB RAM`);
  console.log(`[render-agent] GPU: ${capabilities.gpuName} (${capabilities.gpuVendor})`);
  console.log(`[render-agent] FFmpeg: ${capabilities.ffmpegVersion}`);
  console.log(`[render-agent] HW accel: ${capabilities.hwAccel.length > 0 ? capabilities.hwAccel.join(', ') : 'none'}`);
  console.log(`[render-agent] Worker types: ${workerTypes.join(', ')}`);

  const agent = new RenderAgent({
    hostname: name,
    gpuVendor: capabilities.gpuVendor,
    gpuName: capabilities.gpuName,
    vramMB: capabilities.vramMB,
    cpuCores: capabilities.cpuCores,
    memoryGB: capabilities.memoryGB,
  }, workerTypes);

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[render-agent] Shutting down...');
    agent.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`[render-agent] Connecting to coordinator: ${coordinator}`);
  try {
    await agent.connect(coordinator);
    console.log('[render-agent] Connected and registered. Waiting for jobs...');
  } catch (err) {
    console.error(`[render-agent] Failed to connect: ${(err as Error).message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[render-agent] Fatal error: ${(err as Error).message}`);
  process.exit(1);
});
