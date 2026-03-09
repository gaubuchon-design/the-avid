# FFmpeg Binaries

This directory contains platform-specific FFmpeg and FFprobe static builds
bundled with The Avid desktop application.

## Structure

```
bin/
├── mac/          # macOS (universal or arm64/x64)
│   ├── ffmpeg
│   └── ffprobe
├── win/          # Windows x64
│   ├── ffmpeg.exe
│   └── ffprobe.exe
└── linux/        # Linux x64
    ├── ffmpeg
    └── ffprobe
```

## Downloading Binaries

Run from the desktop app root:

```bash
node scripts/download-ffmpeg.js              # Current platform
node scripts/download-ffmpeg.js darwin-arm64  # macOS Apple Silicon
node scripts/download-ffmpeg.js darwin-x64    # macOS Intel
node scripts/download-ffmpeg.js win32-x64     # Windows 64-bit
node scripts/download-ffmpeg.js linux-x64     # Linux 64-bit
```

## Included Codecs

The bundled FFmpeg builds include support for:

### Video Codecs
- H.264/AVC (libx264) - encoding and decoding
- H.265/HEVC (libx265) - encoding and decoding
- Apple ProRes (prores_ks encoder, prores decoder)
- DNxHD/DNxHR (dnxhd encoder/decoder)
- VP9 (libvpx-vp9)
- AV1 (libsvtav1 encoder, dav1d/libaom decoder)
- MPEG-2 (mpeg2video)
- MJPEG

### Audio Codecs
- AAC (libfdk_aac / native aac)
- MP3 (libmp3lame / mpg123)
- PCM (various formats: s16le, s24le, s32le, f32le)
- FLAC
- Opus (libopus)
- Vorbis (libvorbis)

### Container Formats
- MOV/QuickTime
- MP4/M4V
- MXF (Material Exchange Format - broadcast standard)
- MKV/WebM
- AVI
- WAV/AIFF/FLAC

### Hardware Acceleration
- macOS: VideoToolbox (H.264/HEVC encode/decode)
- Windows: NVENC/NVDEC (NVIDIA), QSV (Intel), AMF (AMD)
- Linux: VAAPI, NVENC/NVDEC, QSV

## Licensing

FFmpeg is licensed under LGPL 2.1+ / GPL 2.0+ depending on build configuration.
The bundled static builds use GPL 2.0+ to include all codecs.
See https://ffmpeg.org/legal.html for details.
