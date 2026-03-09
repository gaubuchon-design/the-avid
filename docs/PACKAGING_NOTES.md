# Packaging Notes

Platform-specific packaging details for the Media Composer Agentic Editing system.

## Windows / NVIDIA

### Desktop Application

- **Installer:** Electron Builder produces an NSIS installer (`.exe`)
- **Architecture:** x64 only (arm64 Windows not yet supported)
- **Code signing:** Authenticode signing required for distribution; configure via `electron-builder.yml`

### Native Dependencies

- **FFmpeg:** Bundled via `@ffmpeg-installer/ffmpeg` at build time; included in the NSIS payload
- **better-sqlite3:** Requires native rebuild for the Electron Node ABI. Run `npx electron-rebuild -f -w better-sqlite3` before packaging
- **WebSocket (ws):** Pure JS, no native rebuild needed

### GPU Acceleration

- **NVIDIA CUDA:** TensorRT backend requires the CUDA Toolkit (12.x recommended) installed on the target machine
- **TensorRT-LLM:** Requires the TensorRT-LLM runtime libraries; the backend probes for `libnvinfer.so` at startup
- **ONNX Runtime:** The CUDA execution provider is auto-selected when `onnxruntime-gpu` is installed; falls back to CPU otherwise
- **Model weights:** Not bundled with the installer. Downloaded on first use to `%APPDATA%/mcua/models/`

### Service Deployment

- Services can run as standalone Node.js processes behind IIS reverse proxy
- PM2 recommended for process management: `pm2 start ecosystem.config.js`
- Windows Firewall rules required for mesh WebSocket ports (default: 4200)

## macOS / Apple Silicon

### Desktop Application

- **Installer:** Electron Builder produces a DMG with background image and Applications symlink
- **Architecture:** Universal binary (x64 + arm64) recommended; arm64-only for minimum size
- **Code signing:** Apple Developer certificate required. Notarization is mandatory for distribution outside the Mac App Store
- **Entitlements:** See `resources/entitlements.mac.plist` for hardened runtime permissions (network, file access, GPU)

### Native Dependencies

- **FFmpeg:** Bundled for the target architecture (arm64 recommended for Apple Silicon)
- **better-sqlite3:** Rebuild for the Electron ABI and target arch: `npx electron-rebuild -f -w better-sqlite3 --arch arm64`
- **Metal framework:** Available natively on macOS 14+ (Sonoma); no additional installation needed

### GPU Acceleration

- **Apple MLX:** The MLX backend requires macOS 14+ and an Apple Silicon chip (M1 or later). Uses the Metal Performance Shaders framework for GPU acceleration
- **ONNX Runtime:** The CoreML execution provider is available on macOS; auto-selected when `onnxruntime` is built with CoreML support
- **llama.cpp:** Metal acceleration is auto-detected on Apple Silicon. The backend loads GGUF model files from `~/Library/Application Support/mcua/models/`

### DMG Customization

- Background: `resources/dmg-background.svg` (rendered to PNG at build time)
- Icon: `resources/icon.svg` (converted to `.icns` by electron-builder)
- License: `resources/license.txt` displayed in the DMG license agreement

## Linux

### Desktop Application

- **Installer:** AppImage output from Electron Builder (portable, no installation required)
- **Alternative formats:** `.deb` and `.rpm` available via electron-builder config
- **Architecture:** x64 and arm64

### Native Dependencies

- **FFmpeg:** Bundled for the target architecture. AppImage includes all shared libraries
- **better-sqlite3:** Rebuild for the host glibc version; may need `--build-from-source` on older distros
- **System libraries:** `libsecret-1-dev` (for credential storage), `libxtst6`, `libx11-6`

### GPU Acceleration

- **NVIDIA CUDA:** Same requirements as Windows (CUDA Toolkit 12.x, TensorRT runtime)
- **AMD ROCm:** Not yet supported; planned via ONNX Runtime ROCm EP
- **Vulkan:** Not yet supported; planned via llama.cpp Vulkan backend

### Headless Deployment

For server or workstation deployments without a display:

```bash
# Run with virtual framebuffer (if Electron shell is needed)
xvfb-run -a npx electron .

# Or run services directly (no Electron required)
node services/agent-orchestrator/dist/server.js
node services/knowledge-node/dist/server.js
node services/local-ai-runtime/dist/server.js
```

## Service Packaging

### Standalone Node.js Processes

All three services (`agent-orchestrator`, `knowledge-node`, `local-ai-runtime`) can run independently of the Electron desktop shell:

```bash
# Build TypeScript to JavaScript
npx turbo build

# Start services
node services/agent-orchestrator/dist/server.js
node services/knowledge-node/dist/server.js
node services/local-ai-runtime/dist/server.js
```

### Docker

Add a `Dockerfile` to each service directory:

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
EXPOSE 4100
CMD ["node", "dist/server.js"]
```

For the knowledge-node service, the image must include the `better-sqlite3` native module. Use a multi-stage build with build tools in the first stage:

```dockerfile
FROM node:20 AS builder
WORKDIR /app
COPY . .
RUN npm ci && npx turbo build --filter=@mcua/knowledge-node

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/services/knowledge-node/dist ./dist
COPY --from=builder /app/services/knowledge-node/node_modules ./node_modules
EXPOSE 4200
CMD ["node", "dist/server.js"]
```

### Process Management

For production deployments, use PM2 or systemd:

**PM2:**
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

**systemd (Linux):**
```ini
[Unit]
Description=MCUA Knowledge Node
After=network.target

[Service]
Type=simple
User=mcua
WorkingDirectory=/opt/mcua/services/knowledge-node
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=10
Environment=PORT=4200
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## Model Weight Distribution

AI model weights are not included in application packages due to size (multi-GB). They are downloaded on demand:

- **Default location:** Platform-specific application data directory
  - Windows: `%APPDATA%/mcua/models/`
  - macOS: `~/Library/Application Support/mcua/models/`
  - Linux: `~/.local/share/mcua/models/`

- **Offline installation:** Pre-download models and place them in the models directory before first launch

- **Model manifest:** The registry seed (`registry-seed.ts`) defines expected model files, sizes, and checksums for integrity verification

## Build Matrix

| Platform | Arch | Electron | Services | GPU Backends |
|----------|------|----------|----------|-------------|
| Windows 10+ | x64 | NSIS | Node.js | CUDA, TensorRT |
| macOS 14+ | arm64 | DMG | Node.js | MLX, Metal |
| macOS 14+ | x64 | DMG | Node.js | ONNX CPU |
| Ubuntu 22.04+ | x64 | AppImage | Node.js, Docker | CUDA, TensorRT |
| Ubuntu 22.04+ | arm64 | AppImage | Node.js, Docker | ONNX CPU |
