/**
 * Distributed Render Agent
 *
 * Runs on render farm nodes to process video encoding/transcoding jobs.
 * Connects to the coordinator server via WebSocket.
 *
 * Usage: npx ts-node packages/render-agent/src/index.ts --coordinator ws://server:4000/render
 */

export interface RenderJob {
  id: string;
  type: 'encode' | 'transcode' | 'effects';
  inputUrl: string;
  outputFormat: string;
  codec: string;
  startFrame: number;
  endFrame: number;
  priority: number;
  params: Record<string, any>;
}

export interface RenderNodeInfo {
  hostname: string;
  gpuVendor: string;
  gpuName: string;
  vramMB: number;
  cpuCores: number;
  memoryGB: number;
  status: 'idle' | 'busy' | 'offline' | 'error';
  currentJobId: string | null;
  progress: number;
}

export class RenderAgent {
  private ws: WebSocket | null = null;
  private nodeInfo: RenderNodeInfo;
  private currentJob: RenderJob | null = null;

  constructor(nodeInfo: Partial<RenderNodeInfo> = {}) {
    this.nodeInfo = {
      hostname: nodeInfo.hostname || 'render-node-1',
      gpuVendor: nodeInfo.gpuVendor || 'unknown',
      gpuName: nodeInfo.gpuName || 'Unknown GPU',
      vramMB: nodeInfo.vramMB || 0,
      cpuCores: nodeInfo.cpuCores || 4,
      memoryGB: nodeInfo.memoryGB || 8,
      status: 'idle',
      currentJobId: null,
      progress: 0,
    };
  }

  async connect(coordinatorUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(coordinatorUrl);
      this.ws.onopen = () => {
        this.register();
        resolve();
      };
      this.ws.onmessage = (event) =>
        this.handleMessage(JSON.parse(String(event.data)));
      this.ws.onerror = () => reject(new Error('Connection failed'));
      this.ws.onclose = () => {
        this.nodeInfo.status = 'offline';
      };
    });
  }

  private register(): void {
    this.send({ type: 'register', node: this.nodeInfo });
  }

  private handleMessage(msg: any): void {
    switch (msg.type) {
      case 'job:assign':
        this.startJob(msg.job);
        break;
      case 'job:cancel':
        this.cancelJob();
        break;
      case 'ping':
        this.send({
          type: 'pong',
          status: this.nodeInfo.status,
          progress: this.nodeInfo.progress,
        });
        break;
    }
  }

  private async startJob(job: RenderJob): Promise<void> {
    this.currentJob = job;
    this.nodeInfo.status = 'busy';
    this.nodeInfo.currentJobId = job.id;
    this.nodeInfo.progress = 0;

    // Simulate rendering progress
    const totalFrames = job.endFrame - job.startFrame;
    for (let i = 0; i <= totalFrames; i++) {
      this.nodeInfo.progress = (i / totalFrames) * 100;
      this.send({
        type: 'job:progress',
        jobId: job.id,
        progress: this.nodeInfo.progress,
        frame: job.startFrame + i,
      });
      await new Promise((r) => setTimeout(r, 50));
    }

    this.send({ type: 'job:complete', jobId: job.id });
    this.nodeInfo.status = 'idle';
    this.nodeInfo.currentJobId = null;
    this.currentJob = null;
  }

  private cancelJob(): void {
    this.currentJob = null;
    this.nodeInfo.status = 'idle';
    this.nodeInfo.currentJobId = null;
    this.nodeInfo.progress = 0;
  }

  private send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
