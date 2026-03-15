// =============================================================================
//  THE AVID — N-API Binding Layer
//  Exposes the native codec C API to Node.js as async-capable N-API functions.
//  All heavy operations (decode, encode, transcode) run on the libuv thread
//  pool to avoid blocking the Node.js event loop.
// =============================================================================

#include <node_api.h>
#include <stdlib.h>
#include <string.h>

#include "../include/avid_codecs.h"

// ─── Helper Macros ──────────────────────────────────────────────────────────

#define NAPI_CALL(call)                                         \
    do {                                                        \
        napi_status _s = (call);                                \
        if (_s != napi_ok) return NULL;                         \
    } while (0)

#define NAPI_ASSERT_OK(env, call, msg)                          \
    do {                                                        \
        napi_status _s = (call);                                \
        if (_s != napi_ok) {                                    \
            napi_throw_error(env, NULL, msg);                   \
            return NULL;                                        \
        }                                                       \
    } while (0)

// ─── Helpers ────────────────────────────────────────────────────────────────

static napi_value make_string(napi_env env, const char* str) {
    napi_value result;
    napi_create_string_utf8(env, str ? str : "", NAPI_AUTO_LENGTH, &result);
    return result;
}

static napi_value make_int32(napi_env env, int32_t val) {
    napi_value result;
    napi_create_int32(env, val, &result);
    return result;
}

static napi_value make_int64(napi_env env, int64_t val) {
    napi_value result;
    napi_create_int64(env, val, &result);
    return result;
}

static napi_value make_double(napi_env env, double val) {
    napi_value result;
    napi_create_double(env, val, &result);
    return result;
}

static napi_value make_bool(napi_env env, int val) {
    napi_value result;
    napi_get_boolean(env, val ? true : false, &result);
    return result;
}

static void set_prop(napi_env env, napi_value obj,
                     const char* name, napi_value val) {
    napi_set_named_property(env, obj, name, val);
}

static char* get_string_arg(napi_env env, napi_value val) {
    size_t len;
    napi_get_value_string_utf8(env, val, NULL, 0, &len);
    char* buf = malloc(len + 1);
    napi_get_value_string_utf8(env, val, buf, len + 1, &len);
    return buf;
}

// ─── napi_init — Module initialization ──────────────────────────────────────

static napi_value napi_avid_init(napi_env env, napi_callback_info info) {
    AvidError err = avid_init();
    return make_int32(env, (int32_t)err);
}

// ─── napi_probe — Synchronous media probe ───────────────────────────────────

static napi_value napi_avid_probe(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    if (argc < 1) {
        napi_throw_error(env, NULL, "probe requires file_path argument");
        return NULL;
    }

    char* file_path = get_string_arg(env, args[0]);
    AvidProbeResult result;
    AvidError err = avid_probe(file_path, &result);
    free(file_path);

    // Build result object
    napi_value obj;
    napi_create_object(env, &obj);

    set_prop(env, obj, "error", make_int32(env, (int32_t)err));
    set_prop(env, obj, "errorMessage", make_string(env, result.error_message));

    // Video
    set_prop(env, obj, "videoCodec", make_string(env, result.video_codec));
    set_prop(env, obj, "width", make_int32(env, result.width));
    set_prop(env, obj, "height", make_int32(env, result.height));
    set_prop(env, obj, "fps", make_double(env, result.fps));
    set_prop(env, obj, "duration", make_double(env, result.duration));
    set_prop(env, obj, "bitDepth", make_int32(env, result.bit_depth));
    set_prop(env, obj, "hasAlpha", make_bool(env, result.has_alpha));
    set_prop(env, obj, "pixelFormat", make_string(env, result.pixel_format));
    set_prop(env, obj, "colorSpace", make_string(env, result.color_space));
    set_prop(env, obj, "colorTransfer", make_string(env, result.color_transfer));
    set_prop(env, obj, "colorPrimaries", make_string(env, result.color_primaries));
    set_prop(env, obj, "videoBitrate", make_int64(env, result.video_bitrate));

    // Audio
    set_prop(env, obj, "audioCodec", make_string(env, result.audio_codec));
    set_prop(env, obj, "audioChannels", make_int32(env, result.audio_channels));
    set_prop(env, obj, "audioSampleRate", make_int32(env, result.audio_sample_rate));
    set_prop(env, obj, "audioBitDepth", make_int32(env, result.audio_bit_depth));
    set_prop(env, obj, "audioBitrate", make_int64(env, result.audio_bitrate));
    set_prop(env, obj, "channelLayout", make_string(env, result.channel_layout));

    // Container
    set_prop(env, obj, "containerFormat", make_string(env, result.container_format));
    set_prop(env, obj, "fileSize", make_int64(env, result.file_size));
    set_prop(env, obj, "numVideoStreams", make_int32(env, result.num_video_streams));
    set_prop(env, obj, "numAudioStreams", make_int32(env, result.num_audio_streams));
    set_prop(env, obj, "numSubtitleStreams", make_int32(env, result.num_subtitle_streams));

    // Timecode
    set_prop(env, obj, "timecodeStart", make_string(env, result.timecode_start));
    set_prop(env, obj, "reelName", make_string(env, result.reel_name));

    // HW accel
    set_prop(env, obj, "hwDecodeAvailable", make_bool(env, result.hw_decode_available));
    set_prop(env, obj, "hwDecodeType", make_int32(env, (int32_t)result.hw_decode_type));

    return obj;
}

// ─── napi_query_hw_accel ────────────────────────────────────────────────────

static napi_value napi_avid_query_hw_accel(napi_env env,
                                            napi_callback_info info) {
    AvidHWAccelReport report;
    avid_query_hw_accel(&report);

    napi_value obj;
    napi_create_object(env, &obj);

    set_prop(env, obj, "numDevices", make_int32(env, report.num_devices));
    set_prop(env, obj, "preferredDecode", make_int32(env, (int32_t)report.preferred_decode));
    set_prop(env, obj, "preferredEncode", make_int32(env, (int32_t)report.preferred_encode));

    napi_value devices;
    napi_create_array_with_length(env, report.num_devices, &devices);

    for (int i = 0; i < report.num_devices; i++) {
        AvidHWAccelInfo* dev = &report.devices[i];
        napi_value dev_obj;
        napi_create_object(env, &dev_obj);

        set_prop(env, dev_obj, "type", make_int32(env, (int32_t)dev->type));
        set_prop(env, dev_obj, "name", make_string(env, dev->name));
        set_prop(env, dev_obj, "deviceName", make_string(env, dev->device_name));
        set_prop(env, dev_obj, "supported", make_bool(env, dev->supported));
        set_prop(env, dev_obj, "vramBytes", make_int64(env, dev->vram_bytes));

        napi_set_element(env, devices, i, dev_obj);
    }

    set_prop(env, obj, "devices", devices);
    return obj;
}

// ─── Async Decode Work ──────────────────────────────────────────────────────

typedef struct {
    napi_async_work work;
    napi_deferred deferred;
    char* file_path;
    double timestamp;
    int output_format;
    int hw_accel;
    int target_width;
    int target_height;
    AvidDecodedFrame frame;
    AvidError error;
} DecodeWorkData;

static void decode_execute(napi_env env, void* data) {
    DecodeWorkData* d = (DecodeWorkData*)data;

    AvidDecodeConfig cfg = {
        .file_path = d->file_path,
        .output_format = (AvidPixelFormat)d->output_format,
        .hw_accel = (AvidHWAccelType)d->hw_accel,
        .thread_count = 0,
        .target_width = d->target_width,
        .target_height = d->target_height,
    };

    AvidDecodeContext* ctx = NULL;
    d->error = avid_decode_open(&cfg, &ctx);
    if (d->error != AVID_OK) return;

    d->error = avid_decode_frame_at(ctx, d->timestamp, &d->frame);
    avid_decode_close(ctx);
}

static void decode_complete(napi_env env, napi_status status, void* data) {
    DecodeWorkData* d = (DecodeWorkData*)data;

    if (status != napi_ok || d->error != AVID_OK) {
        napi_value err_msg;
        napi_create_string_utf8(env, avid_error_string(d->error),
                                 NAPI_AUTO_LENGTH, &err_msg);
        napi_value error;
        napi_create_error(env, NULL, err_msg, &error);
        napi_reject_deferred(env, d->deferred, error);
    } else {
        napi_value obj;
        napi_create_object(env, &obj);

        // Create ArrayBuffer from frame data (zero-copy transfer)
        if (d->frame.data && d->frame.data_size > 0) {
            napi_value array_buf;
            void* buf_data;
            napi_create_arraybuffer(env, d->frame.data_size, &buf_data, &array_buf);
            memcpy(buf_data, d->frame.data, d->frame.data_size);
            set_prop(env, obj, "data", array_buf);
        }

        set_prop(env, obj, "width", make_int32(env, d->frame.width));
        set_prop(env, obj, "height", make_int32(env, d->frame.height));
        set_prop(env, obj, "stride", make_int32(env, d->frame.stride));
        set_prop(env, obj, "format", make_int32(env, (int32_t)d->frame.format));
        set_prop(env, obj, "timestamp", make_double(env, d->frame.timestamp));
        set_prop(env, obj, "frameNumber", make_int64(env, d->frame.frame_number));
        set_prop(env, obj, "keyFrame", make_bool(env, d->frame.key_frame));

        napi_resolve_deferred(env, d->deferred, obj);
    }

    // Cleanup
    avid_frame_free(&d->frame);
    free(d->file_path);
    napi_delete_async_work(env, d->work);
    free(d);
}

static napi_value napi_avid_decode_frame(napi_env env,
                                          napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    if (argc < 2) {
        napi_throw_error(env, NULL,
            "decodeFrame requires (filePath, options) arguments");
        return NULL;
    }

    DecodeWorkData* d = calloc(1, sizeof(DecodeWorkData));
    d->file_path = get_string_arg(env, args[0]);

    // Parse options object
    napi_value opt = args[1];
    napi_value val;

    if (napi_get_named_property(env, opt, "timestamp", &val) == napi_ok)
        napi_get_value_double(env, val, &d->timestamp);
    if (napi_get_named_property(env, opt, "outputFormat", &val) == napi_ok)
        napi_get_value_int32(env, val, &d->output_format);
    if (napi_get_named_property(env, opt, "hwAccel", &val) == napi_ok)
        napi_get_value_int32(env, val, &d->hw_accel);
    if (napi_get_named_property(env, opt, "targetWidth", &val) == napi_ok)
        napi_get_value_int32(env, val, &d->target_width);
    if (napi_get_named_property(env, opt, "targetHeight", &val) == napi_ok)
        napi_get_value_int32(env, val, &d->target_height);

    // Create promise
    napi_value promise;
    napi_create_promise(env, &d->deferred, &promise);

    // Create async work
    napi_value work_name;
    napi_create_string_utf8(env, "avid_decode_frame", NAPI_AUTO_LENGTH, &work_name);
    napi_create_async_work(env, NULL, work_name,
                           decode_execute, decode_complete, d, &d->work);
    napi_queue_async_work(env, d->work);

    return promise;
}

// ─── Async RAW Decode Work ──────────────────────────────────────────────────

typedef struct {
    napi_async_work work;
    napi_deferred deferred;
    char* file_path;
    AvidRawConfig config;
    AvidDecodedFrame frame;
    AvidError error;
} RawDecodeWorkData;

static void raw_decode_execute(napi_env env, void* data) {
    RawDecodeWorkData* d = (RawDecodeWorkData*)data;
    d->error = avid_raw_decode(d->file_path, &d->config, &d->frame);
}

static void raw_decode_complete(napi_env env, napi_status status, void* data) {
    RawDecodeWorkData* d = (RawDecodeWorkData*)data;

    if (status != napi_ok || d->error != AVID_OK) {
        napi_value err_msg;
        napi_create_string_utf8(env, avid_error_string(d->error),
                                 NAPI_AUTO_LENGTH, &err_msg);
        napi_value error;
        napi_create_error(env, NULL, err_msg, &error);
        napi_reject_deferred(env, d->deferred, error);
    } else {
        napi_value obj;
        napi_create_object(env, &obj);

        if (d->frame.data && d->frame.data_size > 0) {
            napi_value array_buf;
            void* buf_data;
            napi_create_arraybuffer(env, d->frame.data_size, &buf_data, &array_buf);
            memcpy(buf_data, d->frame.data, d->frame.data_size);
            set_prop(env, obj, "data", array_buf);
        }

        set_prop(env, obj, "width", make_int32(env, d->frame.width));
        set_prop(env, obj, "height", make_int32(env, d->frame.height));
        set_prop(env, obj, "stride", make_int32(env, d->frame.stride));
        set_prop(env, obj, "format", make_int32(env, (int32_t)d->frame.format));

        napi_resolve_deferred(env, d->deferred, obj);
    }

    avid_frame_free(&d->frame);
    free(d->file_path);
    napi_delete_async_work(env, d->work);
    free(d);
}

static napi_value napi_avid_decode_raw(napi_env env,
                                        napi_callback_info info) {
    size_t argc = 2;
    napi_value args[2];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    if (argc < 1) {
        napi_throw_error(env, NULL, "decodeRaw requires file_path argument");
        return NULL;
    }

    RawDecodeWorkData* d = calloc(1, sizeof(RawDecodeWorkData));
    d->file_path = get_string_arg(env, args[0]);

    // Defaults
    d->config.use_camera_wb = 1;
    d->config.output_bps = 16;
    d->config.brightness = 1.0f;

    // Parse options if provided
    if (argc >= 2) {
        napi_value opt = args[1];
        napi_value val;

        if (napi_get_named_property(env, opt, "useCameraWb", &val) == napi_ok) {
            bool b; napi_get_value_bool(env, val, &b);
            d->config.use_camera_wb = b ? 1 : 0;
        }
        if (napi_get_named_property(env, opt, "halfSize", &val) == napi_ok) {
            bool b; napi_get_value_bool(env, val, &b);
            d->config.half_size = b ? 1 : 0;
        }
        if (napi_get_named_property(env, opt, "useGpu", &val) == napi_ok) {
            bool b; napi_get_value_bool(env, val, &b);
            d->config.use_gpu = b ? 1 : 0;
        }
        if (napi_get_named_property(env, opt, "outputBps", &val) == napi_ok)
            napi_get_value_int32(env, val, &d->config.output_bps);
    }

    napi_value promise;
    napi_create_promise(env, &d->deferred, &promise);

    napi_value work_name;
    napi_create_string_utf8(env, "avid_decode_raw", NAPI_AUTO_LENGTH, &work_name);
    napi_create_async_work(env, NULL, work_name,
                           raw_decode_execute, raw_decode_complete, d, &d->work);
    napi_queue_async_work(env, d->work);

    return promise;
}

// ─── napi_is_raw_supported ──────────────────────────────────────────────────

static napi_value napi_avid_is_raw_supported(napi_env env,
                                              napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, NULL, NULL);

    if (argc < 1) return make_bool(env, 0);

    char* path = get_string_arg(env, args[0]);
    int result = avid_raw_is_supported(path);
    free(path);

    return make_bool(env, result);
}

// ─── Version Info ───────────────────────────────────────────────────────────

static napi_value napi_avid_versions(napi_env env, napi_callback_info info) {
    napi_value obj;
    napi_create_object(env, &obj);

    set_prop(env, obj, "ffmpeg", make_string(env, avid_ffmpeg_version()));
    set_prop(env, obj, "libraw", make_string(env, avid_libraw_version()));
    set_prop(env, obj, "openexr", make_string(env, avid_openexr_version()));

    return obj;
}

// ─── Module Init ────────────────────────────────────────────────────────────

static napi_value init(napi_env env, napi_value exports) {
    napi_property_descriptor props[] = {
        {"init", NULL, napi_avid_init, NULL, NULL, NULL, napi_default, NULL},
        {"probe", NULL, napi_avid_probe, NULL, NULL, NULL, napi_default, NULL},
        {"queryHwAccel", NULL, napi_avid_query_hw_accel, NULL, NULL, NULL, napi_default, NULL},
        {"decodeFrame", NULL, napi_avid_decode_frame, NULL, NULL, NULL, napi_default, NULL},
        {"decodeRaw", NULL, napi_avid_decode_raw, NULL, NULL, NULL, napi_default, NULL},
        {"isRawSupported", NULL, napi_avid_is_raw_supported, NULL, NULL, NULL, napi_default, NULL},
        {"versions", NULL, napi_avid_versions, NULL, NULL, NULL, napi_default, NULL},
    };

    napi_define_properties(env, exports,
                           sizeof(props) / sizeof(props[0]), props);

    // Auto-initialize FFmpeg on module load
    avid_init();

    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
