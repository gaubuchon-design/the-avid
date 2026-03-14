// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- SRT Streaming Output
// ═══════════════════════════════════════════════════════════════════════════
//
// Implements SRT (Secure Reliable Transport) output using @eyevinn/srt.
// SRT enables reliable, low-latency video transport over IP networks
// with optional AES encryption.
//
// ═══════════════════════════════════════════════════════════════════════════

import type { SRTConfig } from './types';

interface SRTModule {
  AsyncSRT: new () => AsyncSRTInstance;
}

interface AsyncSRTInstance {
  createSocket(sender: boolean): Promise<number>;
  bind(socket: number, host: string, port: number): Promise<number>;
  listen(socket: number, backlog: number): Promise<number>;
  connect(socket: number, host: string, port: number): Promise<number>;
  accept(socket: number): Promise<number>;
  write(socket: number, data: Buffer): Promise<number>;
  read(socket: number, size: number): Promise<Buffer>;
  close(socket: number): Promise<void>;
  setSockOpt(socket: number, option: string, value: string | number): Promise<void>;
  getSockOpt(socket: number, option: string): Promise<string | number>;
  stats(socket: number): Promise<SRTStatsResponse>;
}

interface SRTStatsResponse {
  msTimeStamp: number;
  pktSentTotal: number;
  pktRecvTotal: number;
  pktSndLossTotal: number;
  pktRcvLossTotal: number;
  pktSentUnique: number;
  pktRecvUnique: number;
  byteSentTotal: number;
  byteRecvTotal: number;
  msRTT: number;
  mbpsBandwidth: number;
  pktSndBuf: number;
  byteSndBuf: number;
  pktRcvBuf: number;
  byteRcvBuf: number;
}

export class SRTOutput {
  private srtModule: SRTModule | null = null;
  private srt: AsyncSRTInstance | null = null;
  private socket = -1;
  private _isConnected = false;
  private framesSent = 0;
  private bytesSent = 0;
  private startTime = 0;

  /**
   * Load the SRT native module.
   */
  async loadModule(): Promise<boolean> {
    try {
      const moduleId = '@eyevinn/srt';
      this.srtModule = (await import(/* @vite-ignore */ moduleId)) as unknown as SRTModule;
      return true;
    } catch {
      console.warn('[SRT] @eyevinn/srt module not available — SRT output disabled');
      return false;
    }
  }

  get isAvailable(): boolean {
    return this.srtModule !== null;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Connect to an SRT endpoint.
   */
  async connect(config: SRTConfig): Promise<void> {
    if (!this.srtModule) throw new Error('SRT SDK not available');

    this.srt = new this.srtModule.AsyncSRT();
    const isCaller = config.mode === 'caller';
    this.socket = await this.srt.createSocket(isCaller);

    // Set socket options before connecting
    await this.srt.setSockOpt(this.socket, 'SRTO_LATENCY', config.latency);
    await this.srt.setSockOpt(this.socket, 'SRTO_PAYLOADSIZE', config.payloadSize ?? 1316);

    if (config.passphrase) {
      await this.srt.setSockOpt(this.socket, 'SRTO_PASSPHRASE', config.passphrase);
    }

    if (config.maxBandwidth !== undefined) {
      await this.srt.setSockOpt(this.socket, 'SRTO_MAXBW', config.maxBandwidth);
    }

    if (config.streamId) {
      await this.srt.setSockOpt(this.socket, 'SRTO_STREAMID', config.streamId);
    }

    if (config.mode === 'caller') {
      await this.srt.connect(this.socket, config.host, config.port);
    } else if (config.mode === 'listener') {
      const listenSocket = this.socket;
      await this.srt.bind(listenSocket, config.host, config.port);
      await this.srt.listen(listenSocket, 1);
      this.socket = await this.srt.accept(listenSocket);
      // Close the listener socket; we only need the accepted data socket
      await this.srt.close(listenSocket).catch(() => {
        /* ignore */
      });
    } else {
      // Rendezvous mode
      await this.srt.bind(this.socket, '0.0.0.0', config.port);
      await this.srt.setSockOpt(this.socket, 'SRTO_RENDEZVOUS', 1);
      await this.srt.connect(this.socket, config.host, config.port);
    }

    this._isConnected = true;
    this.framesSent = 0;
    this.bytesSent = 0;
    this.startTime = Date.now();
  }

  /**
   * Write data to the SRT socket.
   * @returns Number of bytes written.
   */
  async write(data: Buffer): Promise<number> {
    if (!this.srt || !this._isConnected) throw new Error('SRT not connected');

    const bytesWritten = await this.srt.write(this.socket, data);
    this.bytesSent += bytesWritten;
    this.framesSent++;
    return bytesWritten;
  }

  /**
   * Get current SRT connection statistics.
   */
  async getStats(): Promise<{
    rtt: number;
    bandwidth: number;
    packetLoss: number;
    bytesSent: number;
    uptime: number;
  }> {
    if (!this.srt || !this._isConnected) {
      return { rtt: 0, bandwidth: 0, packetLoss: 0, bytesSent: 0, uptime: 0 };
    }

    try {
      const stats = await this.srt.stats(this.socket);
      const totalPackets = stats.pktSentTotal || 1;
      return {
        rtt: stats.msRTT,
        bandwidth: stats.mbpsBandwidth,
        packetLoss: (stats.pktSndLossTotal / totalPackets) * 100,
        bytesSent: stats.byteSentTotal,
        uptime: (Date.now() - this.startTime) / 1000,
      };
    } catch {
      return { rtt: 0, bandwidth: 0, packetLoss: 0, bytesSent: this.bytesSent, uptime: 0 };
    }
  }

  /**
   * Disconnect and clean up.
   */
  async disconnect(): Promise<void> {
    this._isConnected = false;
    if (this.srt && this.socket >= 0) {
      try {
        await this.srt.close(this.socket);
      } catch {
        // Ignore close errors
      }
    }
    this.srt = null;
    this.socket = -1;
  }
}
