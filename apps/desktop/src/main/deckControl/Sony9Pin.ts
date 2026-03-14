// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Sony 9-Pin (P2/RS-422) Protocol Implementation
// ═══════════════════════════════════════════════════════════════════════════
//
// Implements the Sony 9-pin (also known as RS-422/P2) protocol for remote
// control of professional video tape recorders. This is the broadcast
// industry standard for VTR machine control.
//
// Protocol spec:
//   - 38400 baud, 8 data bits, odd parity, 1 stop bit
//   - Frame format: [CMD1] [CMD2] [DATA...] [CHECKSUM]
//   - Checksum = sum of all bytes (mod 256)
//   - CMD1 high nibble = data byte count, low nibble = command group
//   - Master (controller) sends commands, Slave (deck) sends responses
//
// ═══════════════════════════════════════════════════════════════════════════

import type { DeckTimecode, DeckTransportState, DeckStatus, DeckPort } from './types';

// ── SerialPort types (loaded dynamically) ─────────────────────────────────

interface SerialPortModule {
  SerialPort: new (options: SerialPortOptions) => SerialPortInstance;
}

interface SerialPortOptions {
  path: string;
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: string;
  autoOpen?: boolean;
}

interface SerialPortInstance {
  open(callback?: (err: Error | null) => void): void;
  close(callback?: (err: Error | null) => void): void;
  write(data: Buffer, callback?: (err: Error | null) => void): boolean;
  on(event: string, listener: (...args: unknown[]) => void): this;
  isOpen: boolean;
}

interface SerialPortListResult {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  vendorId?: string;
  productId?: string;
}

// ── Command constants ─────────────────────────────────────────────────────

/** System control (CMD1 high nibble = 0x0) */
const CMD_DEVICE_TYPE_REQUEST = Buffer.from([0x00, 0x11]);

/** Transport control commands (CMD1 group = 0x2x) */
const CMD_STOP = Buffer.from([0x20, 0x00]);
const CMD_PLAY = Buffer.from([0x20, 0x01]);
const CMD_RECORD = Buffer.from([0x20, 0x02]);
const CMD_STANDBY_OFF = Buffer.from([0x20, 0x04]);
const CMD_STANDBY_ON = Buffer.from([0x20, 0x05]);
const CMD_EJECT = Buffer.from([0x20, 0x0f]);
const CMD_FAST_FORWARD = Buffer.from([0x20, 0x10]);
const CMD_REWIND = Buffer.from([0x20, 0x20]);

/** Shuttle/jog commands (CMD1 group = 0x2x with data) */
const CMD_JOG_FORWARD = Buffer.from([0x21, 0x11]); // + 1 speed byte
const CMD_JOG_REVERSE = Buffer.from([0x21, 0x12]); // + 1 speed byte
const CMD_SHUTTLE_FWD = Buffer.from([0x21, 0x13]); // + 1 speed byte
const CMD_SHUTTLE_REV = Buffer.from([0x21, 0x14]); // + 1 speed byte

/** Preset/cue commands */
const CMD_CUE_UP_DATA = Buffer.from([0x24, 0x31]); // + 4 BCD timecode bytes

/** Sense request commands (CMD1 group = 0x6x) */
const CMD_TC_GEN_SENSE = Buffer.from([0x61, 0x0c]); // Request current timecode
const CMD_STATUS_SENSE = Buffer.from([0x61, 0x20]); // Request status + TC

/** Response timeout (ms) */
const RESPONSE_TIMEOUT = 500;

export class Sony9Pin {
  private serialModule: SerialPortModule | null = null;
  private port: SerialPortInstance | null = null;
  private portPath = '';
  private _isConnected = false;
  private rxBuffer = Buffer.alloc(0);
  private pendingResolve: ((data: Buffer) => void) | null = null;
  private pendingTimeout: ReturnType<typeof setTimeout> | null = null;
  private timecodeCallbacks: Array<(tc: DeckTimecode) => void> = [];
  private statusCallbacks: Array<(status: DeckStatus) => void> = [];
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Load the serialport native module.
   */
  async loadModule(): Promise<boolean> {
    try {
      const moduleId = 'serialport';
      this.serialModule = (await import(
        /* @vite-ignore */ moduleId
      )) as unknown as SerialPortModule;
      return true;
    } catch {
      console.warn('[Sony9Pin] serialport module not available — deck control disabled');
      return false;
    }
  }

  get isAvailable(): boolean {
    return this.serialModule !== null;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * List available serial ports.
   */
  async listPorts(): Promise<DeckPort[]> {
    if (!this.serialModule) return [];

    try {
      // SerialPort.list() is a static method
      const moduleId = 'serialport';
      const mod = (await import(/* @vite-ignore */ moduleId)) as unknown as {
        SerialPort: { list(): Promise<SerialPortListResult[]> };
      };
      const ports = await mod.SerialPort.list();
      return ports.map((p) => ({
        path: p.path,
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber,
        pnpId: p.pnpId,
        vendorId: p.vendorId,
        productId: p.productId,
      }));
    } catch (err) {
      console.error('[Sony9Pin] Failed to list ports:', err);
      return [];
    }
  }

  /**
   * Connect to a VTR on the specified serial port.
   * Sony 9-pin: 38400 baud, 8 data bits, odd parity, 1 stop bit.
   */
  async connect(portPath: string): Promise<void> {
    if (!this.serialModule) throw new Error('Serial port module not available');
    if (this._isConnected) await this.disconnect();

    this.portPath = portPath;

    return new Promise<void>((resolve, reject) => {
      this.port = new this.serialModule!.SerialPort({
        path: portPath,
        baudRate: 38400,
        dataBits: 8,
        stopBits: 1,
        parity: 'odd',
        autoOpen: false,
      });

      this.port.on('data', ((chunk: Buffer) => {
        this.onData(chunk);
      }) as any);

      this.port.on('error', ((err: Error) => {
        console.error(`[Sony9Pin] Port error on ${portPath}:`, err.message);
        this._isConnected = false;
      }) as any);

      this.port.on('close', () => {
        this._isConnected = false;
        this.stopPolling();
      });

      this.port.open((err: Error | null) => {
        if (err) {
          reject(new Error(`Failed to open ${portPath}: ${err.message}`));
        } else {
          this._isConnected = true;
          resolve();
        }
      });
    });
  }

  /**
   * Disconnect from the VTR.
   */
  async disconnect(): Promise<void> {
    this.stopPolling();
    this._isConnected = false;

    if (this.port?.isOpen) {
      return new Promise<void>((resolve) => {
        this.port!.close(() => {
          this.port = null;
          resolve();
        });
      });
    }
    this.port = null;
  }

  // ── Transport Commands ──────────────────────────────────────────────────

  async play(): Promise<void> {
    await this.sendCommand(CMD_PLAY);
  }

  async stop(): Promise<void> {
    await this.sendCommand(CMD_STOP);
  }

  async record(): Promise<void> {
    await this.sendCommand(CMD_RECORD);
  }

  async fastForward(): Promise<void> {
    await this.sendCommand(CMD_FAST_FORWARD);
  }

  async rewind(): Promise<void> {
    await this.sendCommand(CMD_REWIND);
  }

  async pause(): Promise<void> {
    await this.sendCommand(CMD_STANDBY_ON);
  }

  async eject(): Promise<void> {
    await this.sendCommand(CMD_EJECT);
  }

  async standbyOff(): Promise<void> {
    await this.sendCommand(CMD_STANDBY_OFF);
  }

  // ── Shuttle / Jog ───────────────────────────────────────────────────────

  /**
   * Jog at the specified speed.
   * @param speed -1.0 to +1.0 (negative = reverse)
   */
  async jog(speed: number): Promise<void> {
    const clamped = Math.max(-1, Math.min(1, speed));
    const speedByte = Math.abs(Math.round(clamped * 127));
    const cmd = clamped >= 0 ? CMD_JOG_FORWARD : CMD_JOG_REVERSE;
    const data = Buffer.concat([cmd, Buffer.from([speedByte])]);
    // Fix CMD1: 0x21 → data count is 1, so CMD1 should reflect total data after CMD1+CMD2
    data[0] = 0x21; // 2 = group, 1 = one data byte
    await this.sendRaw(this.buildFrame(data));
  }

  /**
   * Shuttle at the specified speed.
   * @param speed -1.0 to +1.0 (negative = reverse)
   */
  async shuttle(speed: number): Promise<void> {
    const clamped = Math.max(-1, Math.min(1, speed));
    const speedByte = Math.abs(Math.round(clamped * 127));
    const cmd = clamped >= 0 ? CMD_SHUTTLE_FWD : CMD_SHUTTLE_REV;
    const data = Buffer.concat([cmd, Buffer.from([speedByte])]);
    data[0] = 0x21;
    await this.sendRaw(this.buildFrame(data));
  }

  // ── Timecode / Status ───────────────────────────────────────────────────

  /**
   * Request current timecode from the VTR.
   */
  async requestTimecode(): Promise<DeckTimecode> {
    const response = await this.sendCommand(CMD_TC_GEN_SENSE);
    return this.parseTimecodeResponse(response);
  }

  /**
   * Request full status from the VTR.
   */
  async requestStatus(): Promise<DeckStatus> {
    const response = await this.sendCommand(CMD_STATUS_SENSE);
    return this.parseStatusResponse(response);
  }

  /**
   * Cue (seek) to a specific timecode.
   */
  async goToTimecode(tc: DeckTimecode): Promise<void> {
    const bcd = this.encodeTimecodeBCD(tc);
    const data = Buffer.concat([CMD_CUE_UP_DATA, bcd]);
    data[0] = 0x24; // 4 data bytes following CMD1+CMD2
    await this.sendRaw(this.buildFrame(data));
  }

  /**
   * Request device type.
   */
  async requestDeviceType(): Promise<Buffer> {
    return this.sendCommand(CMD_DEVICE_TYPE_REQUEST);
  }

  // ── Continuous Polling ──────────────────────────────────────────────────

  /**
   * Start continuous timecode polling at the specified rate.
   * @param intervalMs Poll interval (default: 33ms ≈ 30fps)
   */
  startPolling(intervalMs = 33): void {
    this.stopPolling();

    this.pollInterval = setInterval(async () => {
      if (!this._isConnected) return;

      try {
        const status = await this.requestStatus();
        for (const cb of this.statusCallbacks) cb(status);
        for (const cb of this.timecodeCallbacks) cb(status.timecode);
      } catch {
        // Polling is best-effort — skip missed frames
      }
    }, intervalMs);
  }

  /**
   * Stop continuous polling.
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Register a timecode update callback.
   */
  onTimecodeUpdate(cb: (tc: DeckTimecode) => void): () => void {
    this.timecodeCallbacks.push(cb);
    return () => {
      this.timecodeCallbacks = this.timecodeCallbacks.filter((c) => c !== cb);
    };
  }

  /**
   * Register a status change callback.
   */
  onStatusChange(cb: (status: DeckStatus) => void): () => void {
    this.statusCallbacks.push(cb);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter((c) => c !== cb);
    };
  }

  // ── Protocol Internals ──────────────────────────────────────────────────

  /**
   * Build a protocol frame with checksum.
   * Frame: [CMD1] [CMD2] [DATA...] [CHECKSUM]
   * Checksum = (sum of all preceding bytes) & 0xFF
   */
  private buildFrame(data: Buffer): Buffer {
    let sum = 0;
    for (const value of data) {
      sum += value;
    }
    const checksum = sum & 0xff;
    return Buffer.concat([data, Buffer.from([checksum])]);
  }

  /**
   * Send a command and wait for response.
   */
  private async sendCommand(cmd: Buffer): Promise<Buffer> {
    const frame = this.buildFrame(cmd);
    return this.sendRaw(frame);
  }

  /**
   * Send raw bytes and wait for response.
   */
  private sendRaw(frame: Buffer): Promise<Buffer> {
    if (!this.port || !this._isConnected) {
      return Promise.reject(new Error('Not connected'));
    }

    return new Promise<Buffer>((resolve, reject) => {
      // Clear any previous pending
      if (this.pendingTimeout) clearTimeout(this.pendingTimeout);

      this.pendingResolve = resolve;
      this.pendingTimeout = setTimeout(() => {
        this.pendingResolve = null;
        reject(new Error('Response timeout'));
      }, RESPONSE_TIMEOUT);

      this.port!.write(frame, (err: Error | null) => {
        if (err) {
          if (this.pendingTimeout) clearTimeout(this.pendingTimeout);
          this.pendingResolve = null;
          reject(err);
        }
      });
    });
  }

  /**
   * Handle incoming serial data.
   * Buffers bytes and extracts complete protocol frames.
   */
  private onData(chunk: Buffer): void {
    this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);
    this.processRxBuffer();
  }

  /**
   * Process the receive buffer for complete frames.
   * Frame structure: CMD1 tells us the data count in high nibble.
   */
  private processRxBuffer(): void {
    while (this.rxBuffer.length >= 2) {
      const cmd1 = this.rxBuffer[0]!;
      const dataCount = (cmd1 >> 4) & 0x0f;
      const frameLength = 2 + dataCount + 1; // CMD1 + CMD2 + data + checksum

      if (this.rxBuffer.length < frameLength) break;

      const frame = this.rxBuffer.subarray(0, frameLength);
      this.rxBuffer = this.rxBuffer.subarray(frameLength);

      // Verify checksum
      let sum = 0;
      for (let i = 0; i < frame.length - 1; i++) {
        sum += frame[i]!;
      }
      const expectedChecksum = sum & 0xff;
      const actualChecksum = frame[frame.length - 1]!;

      if (expectedChecksum !== actualChecksum) {
        console.warn('[Sony9Pin] Checksum mismatch — discarding frame');
        continue;
      }

      // Deliver response to pending command
      if (this.pendingResolve) {
        if (this.pendingTimeout) clearTimeout(this.pendingTimeout);
        const resolve = this.pendingResolve;
        this.pendingResolve = null;
        this.pendingTimeout = null;
        resolve(frame);
      }
    }
  }

  // ── BCD Timecode Encoding/Decoding ──────────────────────────────────────

  /**
   * Parse a 4-byte BCD timecode from a response frame.
   * Response format: [CMD1] [CMD2] [FF] [SS] [MM] [HH] [CHECKSUM]
   */
  private parseTimecodeResponse(response: Buffer): DeckTimecode {
    if (response.length < 7) {
      return { hours: 0, minutes: 0, seconds: 0, frames: 0, dropFrame: false };
    }

    // Timecode data starts at byte 2
    const frames = this.decodeBCD(response[2]!);
    const seconds = this.decodeBCD(response[3]!);
    const minutes = this.decodeBCD(response[4]!);
    const hours = this.decodeBCD(response[5]!);
    const dropFrame = (response[2]! & 0x40) !== 0; // Bit 6 of frames byte = DF flag

    return { hours, minutes, seconds, frames: frames & 0x3f, dropFrame };
  }

  /**
   * Parse a status response.
   * The response contains status bytes + timecode.
   */
  private parseStatusResponse(response: Buffer): DeckStatus {
    const tc = this.parseTimecodeResponse(response);

    // Status bits from response bytes (simplified — full spec has many more bits)
    const statusByte0 = response.length > 6 ? response[2]! : 0;
    const statusByte1 = response.length > 7 ? response[3]! : 0;

    return {
      transportState: this.decodeTransportState(statusByte0, statusByte1),
      timecode: tc,
      isRemoteEnabled: (statusByte0 & 0x01) !== 0,
      isTapeLoaded: (statusByte0 & 0x20) !== 0,
      isServoLocked: (statusByte1 & 0x02) !== 0,
      isRecordInhibit: (statusByte1 & 0x04) !== 0,
      signalPresent: (statusByte1 & 0x08) !== 0,
      hardwareError: (statusByte1 & 0x10) !== 0,
    };
  }

  /**
   * Decode transport state from status bytes.
   */
  private decodeTransportState(byte0: number, byte1: number): DeckTransportState {
    if (byte0 & 0x80) return 'ejected';
    if (byte1 & 0x20) return 'recording';
    if (byte0 & 0x02) return 'playing';
    if (byte0 & 0x04) return 'fast-forward';
    if (byte0 & 0x08) return 'rewind';
    if (byte0 & 0x10) return 'paused';
    if (byte0 & 0x40) return 'stopped';
    return 'unknown';
  }

  /**
   * Decode a BCD byte to decimal.
   * BCD: high nibble = tens digit, low nibble = ones digit
   */
  private decodeBCD(byte: number): number {
    return ((byte >> 4) & 0x0f) * 10 + (byte & 0x0f);
  }

  /**
   * Encode a decimal value as BCD.
   */
  private encodeBCD(value: number): number {
    const clamped = Math.max(0, Math.min(99, value));
    const tens = Math.floor(clamped / 10);
    const ones = clamped % 10;
    return (tens << 4) | ones;
  }

  /**
   * Encode a timecode as 4 BCD bytes: [FF] [SS] [MM] [HH]
   */
  private encodeTimecodeBCD(tc: DeckTimecode): Buffer {
    const ff = this.encodeBCD(tc.frames) | (tc.dropFrame ? 0x40 : 0);
    const ss = this.encodeBCD(tc.seconds);
    const mm = this.encodeBCD(tc.minutes);
    const hh = this.encodeBCD(tc.hours);
    return Buffer.from([ff, ss, mm, hh]);
  }
}
