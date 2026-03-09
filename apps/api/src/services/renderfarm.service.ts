/* eslint-disable @typescript-eslint/no-explicit-any */
// Stub render farm service - implementation in Round 5
class RenderFarmService {
  registerWorker(opts: any) { return { id: '', ...opts }; }
  getWorker(id: string) { return id ? {} as any : null; }
  removeWorker(_id: string) {}
  getWorkers() { return [] as any[]; }
  submitJob(opts: any) { return { id: '', createdAt: Date.now(), ...opts }; }
  getJob(id: string) { return id ? { createdAt: Date.now() } as any : null; }
  getJobs() { return [] as any[]; }
  cancelJob(_id: string) {}
  pauseJob(_id: string) {}
  resumeJob(_id: string) {}
  getHistory() { return [] as any[]; }
  getFarmStats() { return {}; }
  generateInstallScript(_host: string, _types: string[]) { return '#!/bin/bash\necho "TODO"'; }
}

export const renderFarmService = new RenderFarmService();
