// =============================================================================
//  THE AVID — Native Codec Bridge (N-API)
//  C header for the native addon exposing FFmpeg, LibRaw, OpenEXR, and
//  OpenImageIO operations to Node.js via N-API.
// =============================================================================

#ifndef AVID_CODECS_H
#define AVID_CODECS_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// ─── Error Codes ─────────────────────────────────────────────────────────────

typedef enum {
    AVID_OK = 0,
    AVID_ERR_INVALID_ARG = -1,
    AVID_ERR_NOT_FOUND = -2,
    AVID_ERR_DECODE_FAILED = -3,
    AVID_ERR_ENCODE_FAILED = -4,
    AVID_ERR_FORMAT_UNSUPPORTED = -5,
    AVID_ERR_HW_ACCEL_UNAVAILABLE = -6,
    AVID_ERR_OUT_OF_MEMORY = -7,
    AVID_ERR_IO = -8,
    AVID_ERR_CODEC_NOT_FOUND = -9,
    AVID_ERR_MUXER_FAILED = -10,
    AVID_ERR_DEMUXER_FAILED = -11,
    AVID_ERR_ABORTED = -12,
} AvidError;

// ─── Pixel Formats ──────────────────────────────────────────────────────────

typedef enum {
    AVID_PIX_FMT_RGBA8 = 0,       // 8-bit RGBA (default for display)
    AVID_PIX_FMT_BGRA8,           // 8-bit BGRA (Windows native)
    AVID_PIX_FMT_RGB8,            // 8-bit RGB (no alpha)
    AVID_PIX_FMT_YUV420P,         // YUV 4:2:0 planar
    AVID_PIX_FMT_YUV422P,         // YUV 4:2:2 planar
    AVID_PIX_FMT_YUV444P,         // YUV 4:4:4 planar
    AVID_PIX_FMT_YUV420P10,       // YUV 4:2:0 10-bit
    AVID_PIX_FMT_YUV422P10,       // YUV 4:2:2 10-bit
    AVID_PIX_FMT_RGBA16,          // 16-bit RGBA (HDR intermediary)
    AVID_PIX_FMT_RGBAF32,         // 32-bit float RGBA (EXR native)
    AVID_PIX_FMT_RGBAF16,         // 16-bit half-float RGBA (EXR half)
    AVID_PIX_FMT_NV12,            // NV12 (HW accel common format)
    AVID_PIX_FMT_P010,            // P010 10-bit (HW accel HDR)
} AvidPixelFormat;

// ─── Hardware Acceleration ──────────────────────────────────────────────────

typedef enum {
    AVID_HW_NONE = 0,
    AVID_HW_VIDEOTOOLBOX,          // macOS
    AVID_HW_NVDEC,                 // NVIDIA decode
    AVID_HW_NVENC,                 // NVIDIA encode
    AVID_HW_VAAPI,                 // Linux VA-API
    AVID_HW_VDPAU,                 // Linux VDPAU
    AVID_HW_D3D11VA,               // Windows Direct3D 11
    AVID_HW_DXVA2,                 // Windows DXVA2
    AVID_HW_QSV,                   // Intel Quick Sync
    AVID_HW_AMF,                   // AMD AMF (encode)
    AVID_HW_CUDA,                  // NVIDIA CUDA (general compute)
    AVID_HW_METAL,                 // Apple Metal compute
    AVID_HW_OPENCL,                // OpenCL (cross-platform compute)
} AvidHWAccelType;

// ─── Probe Result ────────────────────────────────────────────────────────────

typedef struct {
    // Video stream info
    char     video_codec[64];
    int      width;
    int      height;
    double   fps;
    double   duration;
    int      bit_depth;
    int      has_alpha;
    char     pixel_format[32];
    char     color_space[32];
    char     color_transfer[32];
    char     color_primaries[32];
    int64_t  video_bitrate;
    int      video_stream_index;

    // Audio stream info
    char     audio_codec[64];
    int      audio_channels;
    int      audio_sample_rate;
    int      audio_bit_depth;
    int64_t  audio_bitrate;
    int      audio_stream_index;
    char     channel_layout[64];

    // Container info
    char     container_format[32];
    int64_t  file_size;
    int      num_video_streams;
    int      num_audio_streams;
    int      num_subtitle_streams;

    // Timecode
    char     timecode_start[32];
    char     reel_name[64];

    // HW accel availability
    int      hw_decode_available;
    AvidHWAccelType hw_decode_type;

    // Error
    AvidError error;
    char     error_message[256];
} AvidProbeResult;

// ─── Decode Context ─────────────────────────────────────────────────────────

typedef struct AvidDecodeContext AvidDecodeContext;

typedef struct {
    const char*       file_path;
    AvidPixelFormat   output_format;
    AvidHWAccelType   hw_accel;
    int               thread_count;    // 0 = auto
    int               target_width;    // 0 = native
    int               target_height;   // 0 = native
} AvidDecodeConfig;

// ─── Decoded Frame ──────────────────────────────────────────────────────────

typedef struct {
    uint8_t*          data;
    size_t            data_size;
    int               width;
    int               height;
    int               stride;          // bytes per row
    AvidPixelFormat   format;
    double            timestamp;       // presentation time in seconds
    int64_t           frame_number;
    int               key_frame;
} AvidDecodedFrame;

// ─── Encode Context ─────────────────────────────────────────────────────────

typedef struct AvidEncodeContext AvidEncodeContext;

typedef struct {
    const char*       output_path;
    const char*       video_codec;     // e.g. "libx264", "prores_ks", "dnxhd"
    const char*       audio_codec;     // e.g. "aac", "pcm_s24le"
    const char*       container;       // e.g. "mov", "mp4", "mxf"
    int               width;
    int               height;
    double            fps;
    int64_t           video_bitrate;   // 0 for codec default
    int               quality;         // CRF/CQ value, -1 for default
    int               key_interval;    // GOP size, 0 for codec default
    AvidHWAccelType   hw_accel;
    AvidPixelFormat   input_format;
    int               audio_sample_rate;
    int               audio_channels;
    int               thread_count;
    // ProRes profile: 0=proxy, 1=LT, 2=422, 3=HQ, 4=4444, 5=XQ
    int               prores_profile;
    // DNxHR profile: 0=LB, 1=SQ, 2=HQ, 3=HQX, 4=444
    int               dnxhr_profile;
} AvidEncodeConfig;

// ─── Image Sequence ─────────────────────────────────────────────────────────

typedef struct AvidImageSeqContext AvidImageSeqContext;

typedef struct {
    const char*       directory;
    const char*       pattern;         // e.g. "frame_%04d.exr"
    int               start_frame;
    int               end_frame;
    double            fps;
    AvidPixelFormat   output_format;
    int               thread_count;
} AvidImageSeqConfig;

// ─── Camera RAW ─────────────────────────────────────────────────────────────

typedef struct {
    int               use_camera_wb;   // Use camera white balance
    int               use_auto_wb;     // Auto white balance
    float             user_mul[4];     // Custom WB multipliers (RGBG)
    int               half_size;       // Half-size decode (2x faster)
    int               output_bps;      // 8 or 16 bits per sample
    int               use_gpu;         // Use GPU debayering
    AvidHWAccelType   gpu_type;        // Which GPU API to use
    float             brightness;      // 1.0 = default
    float             highlight_mode;  // 0=clip, 1=unclip, 2=blend
    int               denoise_threshold; // 0 = no denoise
} AvidRawConfig;

// ─── Muxer ──────────────────────────────────────────────────────────────────

typedef struct AvidMuxContext AvidMuxContext;

typedef struct {
    const char*       output_path;
    const char*       container;       // "mov", "mp4", "mxf", "mkv", "webm"
    int               video_stream;    // 1 = include video
    int               audio_stream;    // 1 = include audio
    const char*       timecode;        // Starting timecode "HH:MM:SS:FF"
    const char*       reel_name;
    double            fps;
} AvidMuxConfig;

// ─── HW Accel Query ─────────────────────────────────────────────────────────

typedef struct {
    AvidHWAccelType   type;
    char              name[64];
    char              device_name[128];
    int               supported;
    // Supported codec list (null-terminated array of strings)
    char              decode_codecs[32][32];
    int               num_decode_codecs;
    char              encode_codecs[32][32];
    int               num_encode_codecs;
    int64_t           vram_bytes;      // 0 if unknown
} AvidHWAccelInfo;

typedef struct {
    int               num_devices;
    AvidHWAccelInfo    devices[8];     // Up to 8 GPU devices
    AvidHWAccelType    preferred_decode;
    AvidHWAccelType    preferred_encode;
} AvidHWAccelReport;

// ─── Progress Callback ──────────────────────────────────────────────────────

typedef void (*AvidProgressCallback)(
    double progress,       // 0.0 to 1.0
    int64_t frames_done,
    int64_t frames_total,
    double fps,            // current processing speed
    void* user_data
);

// ─── API Functions ──────────────────────────────────────────────────────────

// Initialization & cleanup
AvidError avid_init(void);
void      avid_cleanup(void);

// Probe media file (synchronous — fast)
AvidError avid_probe(const char* file_path, AvidProbeResult* result);

// HW acceleration query
AvidError avid_query_hw_accel(AvidHWAccelReport* report);

// ── Decode ──────────────────────────────────────────────────────────────

// Open a decode context for a media file
AvidError avid_decode_open(const AvidDecodeConfig* config,
                           AvidDecodeContext** ctx);

// Seek to a timestamp (seconds)
AvidError avid_decode_seek(AvidDecodeContext* ctx, double timestamp);

// Decode the next frame (caller must free frame->data via avid_frame_free)
AvidError avid_decode_next_frame(AvidDecodeContext* ctx,
                                 AvidDecodedFrame* frame);

// Decode a frame at a specific timestamp
AvidError avid_decode_frame_at(AvidDecodeContext* ctx,
                                double timestamp,
                                AvidDecodedFrame* frame);

// Free decoded frame data
void      avid_frame_free(AvidDecodedFrame* frame);

// Close decode context
void      avid_decode_close(AvidDecodeContext* ctx);

// ── Encode ──────────────────────────────────────────────────────────────

// Open an encode context
AvidError avid_encode_open(const AvidEncodeConfig* config,
                           AvidEncodeContext** ctx);

// Write a video frame
AvidError avid_encode_write_video(AvidEncodeContext* ctx,
                                  const uint8_t* data,
                                  size_t data_size,
                                  int width, int height,
                                  AvidPixelFormat format,
                                  int64_t pts);

// Write audio samples (interleaved float32)
AvidError avid_encode_write_audio(AvidEncodeContext* ctx,
                                  const float* samples,
                                  int num_samples,
                                  int channels,
                                  int sample_rate);

// Finalize and close encode context
AvidError avid_encode_finalize(AvidEncodeContext* ctx);

// Close encode context (without finalizing — abort)
void      avid_encode_close(AvidEncodeContext* ctx);

// ── Image Sequences ─────────────────────────────────────────────────────

// Open an image sequence for reading
AvidError avid_imgseq_open(const AvidImageSeqConfig* config,
                            AvidImageSeqContext** ctx);

// Read the next frame from the sequence
AvidError avid_imgseq_read_frame(AvidImageSeqContext* ctx,
                                  int frame_number,
                                  AvidDecodedFrame* frame);

// Get frame count
int       avid_imgseq_frame_count(AvidImageSeqContext* ctx);

// Close image sequence context
void      avid_imgseq_close(AvidImageSeqContext* ctx);

// ── Camera RAW ──────────────────────────────────────────────────────────

// Decode a camera RAW file to RGB/RGBA
AvidError avid_raw_decode(const char* file_path,
                           const AvidRawConfig* config,
                           AvidDecodedFrame* frame);

// Check if a file is a supported camera RAW format
int       avid_raw_is_supported(const char* file_path);

// ── Muxer ───────────────────────────────────────────────────────────────

// Remux (change container without re-encoding)
AvidError avid_remux(const char* input_path,
                      const AvidMuxConfig* config,
                      AvidProgressCallback progress,
                      void* user_data);

// ── Transcode ───────────────────────────────────────────────────────────

// Full transcode (decode + encode in one operation)
AvidError avid_transcode(const char* input_path,
                          const AvidEncodeConfig* encode_config,
                          AvidProgressCallback progress,
                          void* user_data);

// ── Utility ─────────────────────────────────────────────────────────────

// Get human-readable error message
const char* avid_error_string(AvidError error);

// Get FFmpeg version string
const char* avid_ffmpeg_version(void);

// Get LibRaw version string
const char* avid_libraw_version(void);

// Get OpenEXR version string
const char* avid_openexr_version(void);

#ifdef __cplusplus
}
#endif

#endif // AVID_CODECS_H
