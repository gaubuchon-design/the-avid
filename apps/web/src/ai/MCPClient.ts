/**
 * Model Context Protocol (MCP) client for connecting to external AI services.
 * Allows users to hook into Gemini or other LLMs via MCP servers.
 */

export interface MCPServerConfig {
  url: string;
  name: string;
  apiKey?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface MCPMessage {
  jsonrpc: '2.0';
  id: number;
  method: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP JSON-RPC params are untyped
  params?: Record<string, any>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP JSON-RPC result is untyped
  result?: any;
  error?: { code: number; message: string };
}

class MCPClient {
  private servers: Map<string, MCPServerConfig> = new Map();
  private ws: WebSocket | null = null;
  private requestId = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON-RPC promise resolution is untyped
  private pendingRequests: Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }> = new Map();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- event data is untyped
  private listeners: Set<(event: string, data: any) => void> = new Set();

  addServer(config: MCPServerConfig): void {
    this.servers.set(config.name, config);
  }

  removeServer(name: string): void {
    this.servers.delete(name);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getServers(): MCPServerConfig[] {
    return Array.from(this.servers.values());
  }

  async connect(serverName: string): Promise<void> {
    const config = this.servers.get(serverName);
    if (!config) throw new Error(`Server "${serverName}" not configured`);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(config.url);

        this.ws.onopen = () => {
          this.notify('connected', { server: serverName });
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const msg: MCPResponse = JSON.parse(event.data);
            if (msg.id !== undefined) {
              const pending = this.pendingRequests.get(msg.id);
              if (pending) {
                this.pendingRequests.delete(msg.id);
                if (msg.error) pending.reject(new Error(msg.error.message));
                else pending.resolve(msg.result);
              }
            }
          } catch {
            // ignore malformed messages
          }
        };

        this.ws.onerror = () => reject(new Error('WebSocket connection failed'));
        this.ws.onclose = () => this.notify('disconnected', { server: serverName });
      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async listTools(): Promise<MCPTool[]> {
    return this.sendRequest('tools/list', {});
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MCP tool args and return are untyped
  async callTool(name: string, args: Record<string, any>): Promise<any> {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  async sendPrompt(prompt: string, model?: string): Promise<string> {
    const result = await this.sendRequest('completion/complete', {
      messages: [{ role: 'user', content: prompt }],
      model,
    });
    return result?.content || result?.text || JSON.stringify(result);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON-RPC params and result are untyped
  private sendRequest(method: string, params: Record<string, any>): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Not connected to MCP server'));
    }

    const id = ++this.requestId;
    const msg: MCPMessage = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(msg));

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('MCP request timed out'));
        }
      }, 30000);
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- event data is untyped
  subscribe(listener: (event: string, data: any) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- event data is untyped
  private notify(event: string, data: any): void {
    this.listeners.forEach((fn) => fn(event, data));
  }
}

export const mcpClient = new MCPClient();
