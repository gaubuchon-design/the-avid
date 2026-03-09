// =============================================================================
//  THE AVID — Desktop File Logger (Electron main process)
// =============================================================================

import { app } from 'electron';
import { mkdir, appendFile, readdir, stat, unlink } from 'fs/promises';
import path from 'path';

/** Maximum size of a single log file before rotation (10 MB). */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum number of log files to retain. */
const MAX_FILES = 5;

/**
 * Buffered, rotating JSONL file logger for the Electron main process.
 *
 * Log entries are buffered in memory and flushed to disk every second
 * (or when the buffer exceeds a threshold). Files rotate automatically
 * once they exceed `MAX_FILE_SIZE`, and the oldest files are pruned
 * so at most `MAX_FILES` are retained.
 */
export class FileLogger {
  private logDir: string;
  private currentFile: string;
  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.logDir = path.join(app.getPath('logs'), 'the-avid');
    this.currentFile = path.join(this.logDir, `app-${Date.now()}.jsonl`);
  }

  /**
   * Initialise the logger — ensures the log directory exists and runs
   * an initial rotation pass.
   */
  async init(): Promise<void> {
    await mkdir(this.logDir, { recursive: true });
    await this.rotate();
  }

  /**
   * Enqueue a structured log entry. It will be serialised to JSON and
   * flushed asynchronously.
   */
  write(entry: Record<string, unknown>): void {
    this.buffer.push(JSON.stringify(entry));
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 1000);
    }
  }

  // ---------------------------------------------------------------------------
  //  Internal
  // ---------------------------------------------------------------------------

  private async flush(): Promise<void> {
    this.flushTimer = null;
    if (this.buffer.length === 0) return;

    const lines = this.buffer.join('\n') + '\n';
    this.buffer = [];

    try {
      await appendFile(this.currentFile, lines, 'utf-8');

      // Check whether the current file has grown beyond the size limit
      const fileStat = await stat(this.currentFile);
      if (fileStat.size > MAX_FILE_SIZE) {
        this.currentFile = path.join(this.logDir, `app-${Date.now()}.jsonl`);
        await this.rotate();
      }
    } catch {
      // Logging must never crash the application
    }
  }

  /**
   * Remove old log files so at most `MAX_FILES` are kept.
   */
  private async rotate(): Promise<void> {
    try {
      const files = (await readdir(this.logDir))
        .filter((f) => f.endsWith('.jsonl'))
        .sort()
        .reverse();

      for (const file of files.slice(MAX_FILES)) {
        await unlink(path.join(this.logDir, file));
      }
    } catch {
      // Ignore rotation errors
    }
  }

  /**
   * Flush any remaining buffered entries and clean up the timer.
   * Call this before the app quits.
   */
  async dispose(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}
