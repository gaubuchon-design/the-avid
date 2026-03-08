Place packaged media-tool binaries in this directory for desktop distribution.

Supported filenames:

- `ffmpeg`
- `ffprobe`
- `ffmpeg.exe`
- `ffprobe.exe`

Resolution order in the desktop media pipeline:

1. `THE_AVID_FFMPEG_PATH` / `THE_AVID_FFPROBE_PATH`
2. `apps/desktop/resources/bin`
3. `resources/bin` in packaged app resources
4. System `PATH`

This lets local development use Homebrew or system installs while packaged desktop builds can ship pinned media-tool binaries for predictable probing, proxy generation, waveform extraction, and screener rendering.
