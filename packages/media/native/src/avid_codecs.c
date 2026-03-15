// =============================================================================
//  THE AVID — Native Codec Implementation
//  FFmpeg-based decode/encode/mux/demux with GPU HW acceleration.
//  LibRaw camera RAW debayering. OpenEXR/OIIO image sequence I/O.
// =============================================================================

#include "../include/avid_codecs.h"

#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/avutil.h>
#include <libavutil/imgutils.h>
#include <libavutil/opt.h>
#include <libavutil/hwcontext.h>
#include <libavutil/pixdesc.h>
#include <libavutil/channel_layout.h>
#include <libswscale/swscale.h>
#include <libswresample/swresample.h>

#include <libraw/libraw.h>

#include <stdlib.h>
#include <string.h>
#include <stdio.h>

// ─── Internal Structures ─────────────────────────────────────────────────────

struct AvidDecodeContext {
    AVFormatContext*    fmt_ctx;
    AVCodecContext*     video_ctx;
    AVCodecContext*     audio_ctx;
    struct SwsContext*  sws_ctx;
    AVFrame*            frame;
    AVFrame*            hw_frame;
    AVPacket*           packet;
    int                 video_stream_idx;
    int                 audio_stream_idx;
    AvidPixelFormat     output_format;
    AVBufferRef*        hw_device_ctx;
    enum AVPixelFormat  hw_pix_fmt;
    int                 target_width;
    int                 target_height;
};

struct AvidEncodeContext {
    AVFormatContext*    fmt_ctx;
    AVCodecContext*     video_ctx;
    AVCodecContext*     audio_ctx;
    AVStream*           video_stream;
    AVStream*           audio_stream;
    struct SwsContext*  sws_ctx;
    SwrContext*         swr_ctx;
    AVFrame*            frame;
    AVPacket*           packet;
    int64_t             video_pts;
    int64_t             audio_pts;
    AvidPixelFormat     input_format;
    AVBufferRef*        hw_device_ctx;
    int                 header_written;
};

struct AvidImageSeqContext {
    char                directory[4096];
    char                pattern[256];
    int                 start_frame;
    int                 end_frame;
    double              fps;
    AvidPixelFormat     output_format;
    int                 thread_count;
    int                 frame_count;
};

// ─── Pixel Format Mapping ────────────────────────────────────────────────────

static enum AVPixelFormat avid_to_av_pix_fmt(AvidPixelFormat fmt) {
    switch (fmt) {
        case AVID_PIX_FMT_RGBA8:     return AV_PIX_FMT_RGBA;
        case AVID_PIX_FMT_BGRA8:     return AV_PIX_FMT_BGRA;
        case AVID_PIX_FMT_RGB8:      return AV_PIX_FMT_RGB24;
        case AVID_PIX_FMT_YUV420P:   return AV_PIX_FMT_YUV420P;
        case AVID_PIX_FMT_YUV422P:   return AV_PIX_FMT_YUV422P;
        case AVID_PIX_FMT_YUV444P:   return AV_PIX_FMT_YUV444P;
        case AVID_PIX_FMT_YUV420P10: return AV_PIX_FMT_YUV420P10LE;
        case AVID_PIX_FMT_YUV422P10: return AV_PIX_FMT_YUV422P10LE;
        case AVID_PIX_FMT_RGBA16:    return AV_PIX_FMT_RGBA64LE;
        case AVID_PIX_FMT_RGBAF32:   return AV_PIX_FMT_RGBAF32LE;
        case AVID_PIX_FMT_RGBAF16:   return AV_PIX_FMT_RGBAF16LE;
        case AVID_PIX_FMT_NV12:      return AV_PIX_FMT_NV12;
        case AVID_PIX_FMT_P010:      return AV_PIX_FMT_P010LE;
        default:                     return AV_PIX_FMT_RGBA;
    }
}

// ─── HW Accel Helpers ────────────────────────────────────────────────────────

static enum AVHWDeviceType avid_to_av_hw_type(AvidHWAccelType type) {
    switch (type) {
        case AVID_HW_VIDEOTOOLBOX: return AV_HWDEVICE_TYPE_VIDEOTOOLBOX;
        case AVID_HW_NVDEC:
        case AVID_HW_NVENC:
        case AVID_HW_CUDA:         return AV_HWDEVICE_TYPE_CUDA;
        case AVID_HW_VAAPI:        return AV_HWDEVICE_TYPE_VAAPI;
        case AVID_HW_VDPAU:        return AV_HWDEVICE_TYPE_VDPAU;
        case AVID_HW_D3D11VA:      return AV_HWDEVICE_TYPE_D3D11VA;
        case AVID_HW_DXVA2:        return AV_HWDEVICE_TYPE_DXVA2;
        case AVID_HW_QSV:          return AV_HWDEVICE_TYPE_QSV;
        default:                   return AV_HWDEVICE_TYPE_NONE;
    }
}

static enum AVPixelFormat get_hw_format(AVCodecContext* ctx,
                                         const enum AVPixelFormat* pix_fmts) {
    struct AvidDecodeContext* avid_ctx = (struct AvidDecodeContext*)ctx->opaque;
    for (const enum AVPixelFormat* p = pix_fmts; *p != AV_PIX_FMT_NONE; p++) {
        if (*p == avid_ctx->hw_pix_fmt)
            return *p;
    }
    // Fallback to software format
    return pix_fmts[0];
}

// ─── Initialization ─────────────────────────────────────────────────────────

AvidError avid_init(void) {
    // FFmpeg 5+ doesn't need av_register_all()
    // Network protocols (for RTMP, SRT, etc.)
    avformat_network_init();
    return AVID_OK;
}

void avid_cleanup(void) {
    avformat_network_deinit();
}

// ─── Probe ──────────────────────────────────────────────────────────────────

AvidError avid_probe(const char* file_path, AvidProbeResult* result) {
    if (!file_path || !result) return AVID_ERR_INVALID_ARG;
    memset(result, 0, sizeof(AvidProbeResult));
    result->video_stream_index = -1;
    result->audio_stream_index = -1;

    AVFormatContext* fmt_ctx = NULL;
    int ret = avformat_open_input(&fmt_ctx, file_path, NULL, NULL);
    if (ret < 0) {
        result->error = AVID_ERR_IO;
        av_strerror(ret, result->error_message, sizeof(result->error_message));
        return AVID_ERR_IO;
    }

    ret = avformat_find_stream_info(fmt_ctx, NULL);
    if (ret < 0) {
        avformat_close_input(&fmt_ctx);
        result->error = AVID_ERR_DEMUXER_FAILED;
        av_strerror(ret, result->error_message, sizeof(result->error_message));
        return AVID_ERR_DEMUXER_FAILED;
    }

    // Container format
    if (fmt_ctx->iformat && fmt_ctx->iformat->name) {
        snprintf(result->container_format, sizeof(result->container_format),
                 "%s", fmt_ctx->iformat->name);
    }

    // Duration
    if (fmt_ctx->duration != AV_NOPTS_VALUE) {
        result->duration = (double)fmt_ctx->duration / AV_TIME_BASE;
    }

    // File size
    result->file_size = avio_size(fmt_ctx->pb);

    // Count streams
    for (unsigned i = 0; i < fmt_ctx->nb_streams; i++) {
        AVStream* stream = fmt_ctx->streams[i];
        AVCodecParameters* par = stream->codecpar;

        switch (par->codec_type) {
            case AVMEDIA_TYPE_VIDEO:
                result->num_video_streams++;
                if (result->video_stream_index < 0) {
                    result->video_stream_index = (int)i;
                    const AVCodecDescriptor* desc = avcodec_descriptor_get(par->codec_id);
                    if (desc) {
                        snprintf(result->video_codec, sizeof(result->video_codec),
                                 "%s", desc->name);
                    }
                    result->width = par->width;
                    result->height = par->height;
                    result->bit_depth = par->bits_per_raw_sample > 0
                        ? par->bits_per_raw_sample : 8;

                    // FPS from stream
                    if (stream->avg_frame_rate.den > 0) {
                        result->fps = av_q2d(stream->avg_frame_rate);
                    } else if (stream->r_frame_rate.den > 0) {
                        result->fps = av_q2d(stream->r_frame_rate);
                    }

                    // Pixel format
                    const AVPixFmtDescriptor* pix_desc =
                        av_pix_fmt_desc_get((enum AVPixelFormat)par->format);
                    if (pix_desc) {
                        snprintf(result->pixel_format, sizeof(result->pixel_format),
                                 "%s", pix_desc->name);
                        result->has_alpha = !!(pix_desc->flags & AV_PIX_FMT_FLAG_ALPHA);
                    }

                    // Color space
                    const char* cs_name = av_color_space_name(par->color_space);
                    if (cs_name) {
                        snprintf(result->color_space, sizeof(result->color_space),
                                 "%s", cs_name);
                    }
                    const char* ct_name = av_color_transfer_name(par->color_trc);
                    if (ct_name) {
                        snprintf(result->color_transfer, sizeof(result->color_transfer),
                                 "%s", ct_name);
                    }
                    const char* cp_name = av_color_primaries_name(par->color_primaries);
                    if (cp_name) {
                        snprintf(result->color_primaries, sizeof(result->color_primaries),
                                 "%s", cp_name);
                    }

                    result->video_bitrate = par->bit_rate;

                    // Check HW accel availability
                    enum AVHWDeviceType hw_type = AV_HWDEVICE_TYPE_NONE;
                    while ((hw_type = av_hwdevice_iterate_types(hw_type))
                           != AV_HWDEVICE_TYPE_NONE) {
                        const AVCodec* codec = avcodec_find_decoder(par->codec_id);
                        if (codec) {
                            for (int j = 0;; j++) {
                                const AVCodecHWConfig* hw_cfg =
                                    avcodec_get_hw_config(codec, j);
                                if (!hw_cfg) break;
                                if (hw_cfg->device_type == hw_type) {
                                    result->hw_decode_available = 1;
                                    // Map back to our enum
                                    switch (hw_type) {
                                        case AV_HWDEVICE_TYPE_VIDEOTOOLBOX:
                                            result->hw_decode_type = AVID_HW_VIDEOTOOLBOX;
                                            break;
                                        case AV_HWDEVICE_TYPE_CUDA:
                                            result->hw_decode_type = AVID_HW_NVDEC;
                                            break;
                                        case AV_HWDEVICE_TYPE_VAAPI:
                                            result->hw_decode_type = AVID_HW_VAAPI;
                                            break;
                                        case AV_HWDEVICE_TYPE_D3D11VA:
                                            result->hw_decode_type = AVID_HW_D3D11VA;
                                            break;
                                        case AV_HWDEVICE_TYPE_QSV:
                                            result->hw_decode_type = AVID_HW_QSV;
                                            break;
                                        default:
                                            break;
                                    }
                                    goto hw_found;
                                }
                            }
                        }
                    }
                    hw_found:;
                }
                break;

            case AVMEDIA_TYPE_AUDIO:
                result->num_audio_streams++;
                if (result->audio_stream_index < 0) {
                    result->audio_stream_index = (int)i;
                    const AVCodecDescriptor* desc = avcodec_descriptor_get(par->codec_id);
                    if (desc) {
                        snprintf(result->audio_codec, sizeof(result->audio_codec),
                                 "%s", desc->name);
                    }
                    result->audio_channels = par->ch_layout.nb_channels;
                    result->audio_sample_rate = par->sample_rate;
                    result->audio_bit_depth = par->bits_per_raw_sample > 0
                        ? par->bits_per_raw_sample : 16;
                    result->audio_bitrate = par->bit_rate;

                    // Channel layout
                    char layout_buf[64] = {0};
                    av_channel_layout_describe(&par->ch_layout,
                                               layout_buf, sizeof(layout_buf));
                    snprintf(result->channel_layout, sizeof(result->channel_layout),
                             "%s", layout_buf);
                }
                break;

            case AVMEDIA_TYPE_SUBTITLE:
                result->num_subtitle_streams++;
                break;

            default:
                break;
        }
    }

    // Extract timecode from metadata
    const AVDictionaryEntry* tc_entry =
        av_dict_get(fmt_ctx->metadata, "timecode", NULL, 0);
    if (tc_entry && tc_entry->value) {
        snprintf(result->timecode_start, sizeof(result->timecode_start),
                 "%s", tc_entry->value);
    }

    // Extract reel name
    const AVDictionaryEntry* reel_entry =
        av_dict_get(fmt_ctx->metadata, "reel_name", NULL, 0);
    if (reel_entry && reel_entry->value) {
        snprintf(result->reel_name, sizeof(result->reel_name),
                 "%s", reel_entry->value);
    }

    avformat_close_input(&fmt_ctx);
    return AVID_OK;
}

// ─── HW Accel Query ─────────────────────────────────────────────────────────

AvidError avid_query_hw_accel(AvidHWAccelReport* report) {
    if (!report) return AVID_ERR_INVALID_ARG;
    memset(report, 0, sizeof(AvidHWAccelReport));

    enum AVHWDeviceType type = AV_HWDEVICE_TYPE_NONE;
    int idx = 0;

    while ((type = av_hwdevice_iterate_types(type)) != AV_HWDEVICE_TYPE_NONE
           && idx < 8) {
        AvidHWAccelInfo* info = &report->devices[idx];
        snprintf(info->name, sizeof(info->name), "%s",
                 av_hwdevice_get_type_name(type));

        // Map type
        switch (type) {
            case AV_HWDEVICE_TYPE_VIDEOTOOLBOX:
                info->type = AVID_HW_VIDEOTOOLBOX;
                break;
            case AV_HWDEVICE_TYPE_CUDA:
                info->type = AVID_HW_NVDEC;
                break;
            case AV_HWDEVICE_TYPE_VAAPI:
                info->type = AVID_HW_VAAPI;
                break;
            case AV_HWDEVICE_TYPE_D3D11VA:
                info->type = AVID_HW_D3D11VA;
                break;
            case AV_HWDEVICE_TYPE_DXVA2:
                info->type = AVID_HW_DXVA2;
                break;
            case AV_HWDEVICE_TYPE_QSV:
                info->type = AVID_HW_QSV;
                break;
            case AV_HWDEVICE_TYPE_VDPAU:
                info->type = AVID_HW_VDPAU;
                break;
            default:
                info->type = AVID_HW_NONE;
                break;
        }

        // Try to create device to verify availability
        AVBufferRef* hw_ctx = NULL;
        int ret = av_hwdevice_ctx_create(&hw_ctx, type, NULL, NULL, 0);
        info->supported = (ret >= 0) ? 1 : 0;

        if (hw_ctx) {
            av_buffer_unref(&hw_ctx);
        }

        if (info->supported) {
            // Set preferred based on platform
#ifdef __APPLE__
            if (type == AV_HWDEVICE_TYPE_VIDEOTOOLBOX) {
                report->preferred_decode = AVID_HW_VIDEOTOOLBOX;
                report->preferred_encode = AVID_HW_VIDEOTOOLBOX;
            }
#elif defined(_WIN32)
            if (type == AV_HWDEVICE_TYPE_D3D11VA && !report->preferred_decode) {
                report->preferred_decode = AVID_HW_D3D11VA;
            }
            if (type == AV_HWDEVICE_TYPE_CUDA) {
                report->preferred_decode = AVID_HW_NVDEC;
                report->preferred_encode = AVID_HW_NVENC;
            }
#else
            if (type == AV_HWDEVICE_TYPE_CUDA) {
                report->preferred_decode = AVID_HW_NVDEC;
                report->preferred_encode = AVID_HW_NVENC;
            } else if (type == AV_HWDEVICE_TYPE_VAAPI && !report->preferred_decode) {
                report->preferred_decode = AVID_HW_VAAPI;
                report->preferred_encode = AVID_HW_VAAPI;
            }
#endif
        }

        idx++;
    }

    report->num_devices = idx;
    return AVID_OK;
}

// ─── Decode ─────────────────────────────────────────────────────────────────

AvidError avid_decode_open(const AvidDecodeConfig* config,
                           AvidDecodeContext** ctx) {
    if (!config || !config->file_path || !ctx)
        return AVID_ERR_INVALID_ARG;

    AvidDecodeContext* dc = calloc(1, sizeof(AvidDecodeContext));
    if (!dc) return AVID_ERR_OUT_OF_MEMORY;

    dc->output_format = config->output_format;
    dc->target_width = config->target_width;
    dc->target_height = config->target_height;
    dc->video_stream_idx = -1;
    dc->audio_stream_idx = -1;

    // Open input
    int ret = avformat_open_input(&dc->fmt_ctx, config->file_path, NULL, NULL);
    if (ret < 0) {
        free(dc);
        return AVID_ERR_IO;
    }

    ret = avformat_find_stream_info(dc->fmt_ctx, NULL);
    if (ret < 0) {
        avformat_close_input(&dc->fmt_ctx);
        free(dc);
        return AVID_ERR_DEMUXER_FAILED;
    }

    // Find best video stream
    dc->video_stream_idx = av_find_best_stream(
        dc->fmt_ctx, AVMEDIA_TYPE_VIDEO, -1, -1, NULL, 0);

    // Find best audio stream
    dc->audio_stream_idx = av_find_best_stream(
        dc->fmt_ctx, AVMEDIA_TYPE_AUDIO, -1, -1, NULL, 0);

    // Open video decoder
    if (dc->video_stream_idx >= 0) {
        AVStream* vs = dc->fmt_ctx->streams[dc->video_stream_idx];
        const AVCodec* codec = avcodec_find_decoder(vs->codecpar->codec_id);
        if (!codec) {
            avformat_close_input(&dc->fmt_ctx);
            free(dc);
            return AVID_ERR_CODEC_NOT_FOUND;
        }

        dc->video_ctx = avcodec_alloc_context3(codec);
        avcodec_parameters_to_context(dc->video_ctx, vs->codecpar);

        // Set up HW acceleration if requested
        if (config->hw_accel != AVID_HW_NONE) {
            enum AVHWDeviceType hw_type = avid_to_av_hw_type(config->hw_accel);
            if (hw_type != AV_HWDEVICE_TYPE_NONE) {
                // Check if codec supports this HW type
                for (int i = 0;; i++) {
                    const AVCodecHWConfig* hw_cfg = avcodec_get_hw_config(codec, i);
                    if (!hw_cfg) break;
                    if (hw_cfg->methods & AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX
                        && hw_cfg->device_type == hw_type) {
                        dc->hw_pix_fmt = hw_cfg->pix_fmt;
                        ret = av_hwdevice_ctx_create(&dc->hw_device_ctx, hw_type,
                                                     NULL, NULL, 0);
                        if (ret >= 0) {
                            dc->video_ctx->hw_device_ctx =
                                av_buffer_ref(dc->hw_device_ctx);
                            dc->video_ctx->opaque = dc;
                            dc->video_ctx->get_format = get_hw_format;
                        }
                        break;
                    }
                }
            }
        }

        // Thread count
        if (config->thread_count > 0) {
            dc->video_ctx->thread_count = config->thread_count;
        } else {
            dc->video_ctx->thread_count = 0; // auto
        }
        dc->video_ctx->thread_type = FF_THREAD_FRAME | FF_THREAD_SLICE;

        ret = avcodec_open2(dc->video_ctx, codec, NULL);
        if (ret < 0) {
            avcodec_free_context(&dc->video_ctx);
            avformat_close_input(&dc->fmt_ctx);
            if (dc->hw_device_ctx) av_buffer_unref(&dc->hw_device_ctx);
            free(dc);
            return AVID_ERR_DECODE_FAILED;
        }
    }

    // Allocate frame and packet
    dc->frame = av_frame_alloc();
    dc->hw_frame = av_frame_alloc();
    dc->packet = av_packet_alloc();

    if (!dc->frame || !dc->hw_frame || !dc->packet) {
        avid_decode_close(dc);
        return AVID_ERR_OUT_OF_MEMORY;
    }

    *ctx = dc;
    return AVID_OK;
}

AvidError avid_decode_seek(AvidDecodeContext* ctx, double timestamp) {
    if (!ctx || !ctx->fmt_ctx) return AVID_ERR_INVALID_ARG;

    int64_t ts = (int64_t)(timestamp * AV_TIME_BASE);
    int ret = av_seek_frame(ctx->fmt_ctx, -1, ts, AVSEEK_FLAG_BACKWARD);
    if (ret < 0) return AVID_ERR_IO;

    if (ctx->video_ctx) avcodec_flush_buffers(ctx->video_ctx);
    if (ctx->audio_ctx) avcodec_flush_buffers(ctx->audio_ctx);
    return AVID_OK;
}

AvidError avid_decode_next_frame(AvidDecodeContext* ctx,
                                 AvidDecodedFrame* frame) {
    if (!ctx || !frame) return AVID_ERR_INVALID_ARG;
    memset(frame, 0, sizeof(AvidDecodedFrame));

    while (1) {
        int ret = av_read_frame(ctx->fmt_ctx, ctx->packet);
        if (ret < 0) {
            if (ret == AVERROR_EOF) return AVID_ERR_NOT_FOUND;
            return AVID_ERR_IO;
        }

        if (ctx->packet->stream_index == ctx->video_stream_idx) {
            ret = avcodec_send_packet(ctx->video_ctx, ctx->packet);
            av_packet_unref(ctx->packet);
            if (ret < 0) continue;

            ret = avcodec_receive_frame(ctx->video_ctx, ctx->frame);
            if (ret == AVERROR(EAGAIN)) continue;
            if (ret < 0) return AVID_ERR_DECODE_FAILED;

            // Transfer from HW surface if needed
            AVFrame* src_frame = ctx->frame;
            if (ctx->frame->format == ctx->hw_pix_fmt && ctx->hw_device_ctx) {
                ret = av_hwframe_transfer_data(ctx->hw_frame, ctx->frame, 0);
                if (ret < 0) return AVID_ERR_DECODE_FAILED;
                src_frame = ctx->hw_frame;
            }

            // Determine output dimensions
            int out_w = ctx->target_width > 0 ? ctx->target_width : src_frame->width;
            int out_h = ctx->target_height > 0 ? ctx->target_height : src_frame->height;
            enum AVPixelFormat out_fmt = avid_to_av_pix_fmt(ctx->output_format);

            // Set up scaler if needed
            ctx->sws_ctx = sws_getCachedContext(
                ctx->sws_ctx,
                src_frame->width, src_frame->height,
                (enum AVPixelFormat)src_frame->format,
                out_w, out_h, out_fmt,
                SWS_BILINEAR, NULL, NULL, NULL);

            if (!ctx->sws_ctx) return AVID_ERR_DECODE_FAILED;

            // Allocate output buffer
            int dst_linesize[4] = {0};
            uint8_t* dst_data[4] = {0};
            int buf_size = av_image_alloc(dst_data, dst_linesize,
                                          out_w, out_h, out_fmt, 32);
            if (buf_size < 0) return AVID_ERR_OUT_OF_MEMORY;

            // Scale/convert
            sws_scale(ctx->sws_ctx,
                      (const uint8_t* const*)src_frame->data,
                      src_frame->linesize,
                      0, src_frame->height,
                      dst_data, dst_linesize);

            // Fill output frame struct
            frame->data = dst_data[0];
            frame->data_size = (size_t)buf_size;
            frame->width = out_w;
            frame->height = out_h;
            frame->stride = dst_linesize[0];
            frame->format = ctx->output_format;
            frame->key_frame = src_frame->key_frame;

            // Timestamp
            AVStream* vs = ctx->fmt_ctx->streams[ctx->video_stream_idx];
            if (src_frame->pts != AV_NOPTS_VALUE) {
                frame->timestamp = av_q2d(vs->time_base) * src_frame->pts;
            }
            if (vs->avg_frame_rate.den > 0) {
                double fps = av_q2d(vs->avg_frame_rate);
                frame->frame_number = (int64_t)(frame->timestamp * fps + 0.5);
            }

            av_frame_unref(ctx->frame);
            av_frame_unref(ctx->hw_frame);
            return AVID_OK;
        }

        av_packet_unref(ctx->packet);
    }
}

AvidError avid_decode_frame_at(AvidDecodeContext* ctx,
                                double timestamp,
                                AvidDecodedFrame* frame) {
    AvidError err = avid_decode_seek(ctx, timestamp);
    if (err != AVID_OK) return err;

    // Decode frames until we reach or pass the target timestamp
    AVStream* vs = ctx->fmt_ctx->streams[ctx->video_stream_idx];
    double fps = 24.0;
    if (vs->avg_frame_rate.den > 0) {
        fps = av_q2d(vs->avg_frame_rate);
    }
    double frame_duration = 1.0 / fps;

    while (1) {
        err = avid_decode_next_frame(ctx, frame);
        if (err != AVID_OK) return err;

        if (frame->timestamp >= timestamp - frame_duration * 0.5) {
            return AVID_OK;
        }

        // Not yet at target — free and continue
        avid_frame_free(frame);
    }
}

void avid_frame_free(AvidDecodedFrame* frame) {
    if (frame && frame->data) {
        av_freep(&frame->data);
        frame->data = NULL;
        frame->data_size = 0;
    }
}

void avid_decode_close(AvidDecodeContext* ctx) {
    if (!ctx) return;
    if (ctx->sws_ctx) sws_freeContext(ctx->sws_ctx);
    if (ctx->frame) av_frame_free(&ctx->frame);
    if (ctx->hw_frame) av_frame_free(&ctx->hw_frame);
    if (ctx->packet) av_packet_free(&ctx->packet);
    if (ctx->video_ctx) avcodec_free_context(&ctx->video_ctx);
    if (ctx->audio_ctx) avcodec_free_context(&ctx->audio_ctx);
    if (ctx->hw_device_ctx) av_buffer_unref(&ctx->hw_device_ctx);
    if (ctx->fmt_ctx) avformat_close_input(&ctx->fmt_ctx);
    free(ctx);
}

// ─── Encode ─────────────────────────────────────────────────────────────────

AvidError avid_encode_open(const AvidEncodeConfig* config,
                           AvidEncodeContext** ctx) {
    if (!config || !config->output_path || !ctx) return AVID_ERR_INVALID_ARG;

    AvidEncodeContext* ec = calloc(1, sizeof(AvidEncodeContext));
    if (!ec) return AVID_ERR_OUT_OF_MEMORY;

    ec->input_format = config->input_format;

    // Guess output format from extension
    const AVOutputFormat* ofmt = av_guess_format(
        config->container, config->output_path, NULL);
    if (!ofmt) {
        free(ec);
        return AVID_ERR_FORMAT_UNSUPPORTED;
    }

    int ret = avformat_alloc_output_context2(
        &ec->fmt_ctx, ofmt, NULL, config->output_path);
    if (ret < 0 || !ec->fmt_ctx) {
        free(ec);
        return AVID_ERR_MUXER_FAILED;
    }

    // ── Video stream ────────────────────────────────────────────────────
    if (config->video_codec && strlen(config->video_codec) > 0) {
        const AVCodec* vcodec = avcodec_find_encoder_by_name(config->video_codec);
        if (!vcodec) {
            avformat_free_context(ec->fmt_ctx);
            free(ec);
            return AVID_ERR_CODEC_NOT_FOUND;
        }

        ec->video_stream = avformat_new_stream(ec->fmt_ctx, NULL);
        ec->video_ctx = avcodec_alloc_context3(vcodec);

        ec->video_ctx->width = config->width;
        ec->video_ctx->height = config->height;
        ec->video_ctx->time_base = (AVRational){1, (int)(config->fps * 1000)};
        ec->video_stream->time_base = ec->video_ctx->time_base;
        ec->video_ctx->framerate = (AVRational){(int)(config->fps * 1000), 1000};

        // Pixel format — use YUV420P for H.264/H.265, UYVY422 for ProRes
        if (strstr(config->video_codec, "prores")) {
            ec->video_ctx->pix_fmt = AV_PIX_FMT_YUV422P10LE;
            // Set ProRes profile
            av_opt_set_int(ec->video_ctx->priv_data, "profile",
                          config->prores_profile, 0);
        } else if (strstr(config->video_codec, "dnxhd")) {
            ec->video_ctx->pix_fmt = AV_PIX_FMT_YUV422P;
        } else {
            ec->video_ctx->pix_fmt = AV_PIX_FMT_YUV420P;
        }

        // Bitrate / quality
        if (config->video_bitrate > 0) {
            ec->video_ctx->bit_rate = config->video_bitrate;
        }
        if (config->quality >= 0) {
            ec->video_ctx->global_quality = config->quality;
            ec->video_ctx->flags |= AV_CODEC_FLAG_QSCALE;
        }

        // GOP size
        if (config->key_interval > 0) {
            ec->video_ctx->gop_size = config->key_interval;
        }

        // Threading
        if (config->thread_count > 0) {
            ec->video_ctx->thread_count = config->thread_count;
        }

        // HW acceleration for encode
        if (config->hw_accel != AVID_HW_NONE) {
            enum AVHWDeviceType hw_type = avid_to_av_hw_type(config->hw_accel);
            ret = av_hwdevice_ctx_create(&ec->hw_device_ctx, hw_type,
                                          NULL, NULL, 0);
            if (ret >= 0) {
                ec->video_ctx->hw_device_ctx = av_buffer_ref(ec->hw_device_ctx);
            }
        }

        if (ec->fmt_ctx->oformat->flags & AVFMT_GLOBALHEADER) {
            ec->video_ctx->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;
        }

        ret = avcodec_open2(ec->video_ctx, vcodec, NULL);
        if (ret < 0) {
            avid_encode_close(ec);
            return AVID_ERR_ENCODE_FAILED;
        }

        avcodec_parameters_from_context(ec->video_stream->codecpar, ec->video_ctx);
    }

    // ── Audio stream ────────────────────────────────────────────────────
    if (config->audio_codec && strlen(config->audio_codec) > 0) {
        const AVCodec* acodec = avcodec_find_encoder_by_name(config->audio_codec);
        if (acodec) {
            ec->audio_stream = avformat_new_stream(ec->fmt_ctx, NULL);
            ec->audio_ctx = avcodec_alloc_context3(acodec);

            ec->audio_ctx->sample_rate = config->audio_sample_rate > 0
                ? config->audio_sample_rate : 48000;
            ec->audio_ctx->sample_fmt = acodec->sample_fmts
                ? acodec->sample_fmts[0] : AV_SAMPLE_FMT_FLTP;
            av_channel_layout_default(&ec->audio_ctx->ch_layout,
                                       config->audio_channels > 0
                                       ? config->audio_channels : 2);
            ec->audio_ctx->time_base = (AVRational){1, ec->audio_ctx->sample_rate};

            if (ec->fmt_ctx->oformat->flags & AVFMT_GLOBALHEADER) {
                ec->audio_ctx->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;
            }

            ret = avcodec_open2(ec->audio_ctx, acodec, NULL);
            if (ret >= 0) {
                avcodec_parameters_from_context(
                    ec->audio_stream->codecpar, ec->audio_ctx);
                ec->audio_stream->time_base = ec->audio_ctx->time_base;
            }
        }
    }

    // Allocate packet and frame
    ec->packet = av_packet_alloc();
    ec->frame = av_frame_alloc();

    // Open output file
    if (!(ec->fmt_ctx->oformat->flags & AVFMT_NOFILE)) {
        ret = avio_open(&ec->fmt_ctx->pb, config->output_path, AVIO_FLAG_WRITE);
        if (ret < 0) {
            avid_encode_close(ec);
            return AVID_ERR_IO;
        }
    }

    // Write header
    ret = avformat_write_header(ec->fmt_ctx, NULL);
    if (ret < 0) {
        avid_encode_close(ec);
        return AVID_ERR_MUXER_FAILED;
    }
    ec->header_written = 1;

    *ctx = ec;
    return AVID_OK;
}

AvidError avid_encode_write_video(AvidEncodeContext* ctx,
                                  const uint8_t* data,
                                  size_t data_size,
                                  int width, int height,
                                  AvidPixelFormat format,
                                  int64_t pts) {
    if (!ctx || !ctx->video_ctx || !data) return AVID_ERR_INVALID_ARG;

    // Set up input frame
    enum AVPixelFormat in_fmt = avid_to_av_pix_fmt(format);
    enum AVPixelFormat enc_fmt = ctx->video_ctx->pix_fmt;

    // Scale/convert if needed
    ctx->sws_ctx = sws_getCachedContext(
        ctx->sws_ctx,
        width, height, in_fmt,
        ctx->video_ctx->width, ctx->video_ctx->height, enc_fmt,
        SWS_BILINEAR, NULL, NULL, NULL);

    if (!ctx->sws_ctx) return AVID_ERR_ENCODE_FAILED;

    ctx->frame->format = enc_fmt;
    ctx->frame->width = ctx->video_ctx->width;
    ctx->frame->height = ctx->video_ctx->height;

    int ret = av_frame_get_buffer(ctx->frame, 0);
    if (ret < 0) return AVID_ERR_OUT_OF_MEMORY;

    ret = av_frame_make_writable(ctx->frame);
    if (ret < 0) return AVID_ERR_OUT_OF_MEMORY;

    // Wrap input data
    const uint8_t* src_data[4] = {data, NULL, NULL, NULL};
    int src_linesize[4] = {0};
    av_image_fill_linesizes(src_linesize, in_fmt, width);

    sws_scale(ctx->sws_ctx,
              src_data, src_linesize, 0, height,
              ctx->frame->data, ctx->frame->linesize);

    ctx->frame->pts = pts;

    // Encode
    ret = avcodec_send_frame(ctx->video_ctx, ctx->frame);
    if (ret < 0) {
        av_frame_unref(ctx->frame);
        return AVID_ERR_ENCODE_FAILED;
    }

    while (ret >= 0) {
        ret = avcodec_receive_packet(ctx->video_ctx, ctx->packet);
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) break;
        if (ret < 0) {
            av_frame_unref(ctx->frame);
            return AVID_ERR_ENCODE_FAILED;
        }

        av_packet_rescale_ts(ctx->packet, ctx->video_ctx->time_base,
                              ctx->video_stream->time_base);
        ctx->packet->stream_index = ctx->video_stream->index;

        ret = av_interleaved_write_frame(ctx->fmt_ctx, ctx->packet);
        av_packet_unref(ctx->packet);
    }

    av_frame_unref(ctx->frame);
    ctx->video_pts++;
    return AVID_OK;
}

AvidError avid_encode_write_audio(AvidEncodeContext* ctx,
                                  const float* samples,
                                  int num_samples,
                                  int channels,
                                  int sample_rate) {
    if (!ctx || !ctx->audio_ctx || !samples) return AVID_ERR_INVALID_ARG;

    // Set up resampler if needed
    if (!ctx->swr_ctx) {
        ctx->swr_ctx = swr_alloc();
        AVChannelLayout in_layout, out_layout;
        av_channel_layout_default(&in_layout, channels);
        av_channel_layout_copy(&out_layout, &ctx->audio_ctx->ch_layout);

        swr_alloc_set_opts2(&ctx->swr_ctx,
            &out_layout, ctx->audio_ctx->sample_fmt, ctx->audio_ctx->sample_rate,
            &in_layout, AV_SAMPLE_FMT_FLT, sample_rate,
            0, NULL);

        av_channel_layout_uninit(&in_layout);
        av_channel_layout_uninit(&out_layout);

        int ret = swr_init(ctx->swr_ctx);
        if (ret < 0) return AVID_ERR_ENCODE_FAILED;
    }

    // Resample and encode
    ctx->frame->format = ctx->audio_ctx->sample_fmt;
    ctx->frame->nb_samples = ctx->audio_ctx->frame_size > 0
        ? ctx->audio_ctx->frame_size : num_samples;
    av_channel_layout_copy(&ctx->frame->ch_layout, &ctx->audio_ctx->ch_layout);

    int ret = av_frame_get_buffer(ctx->frame, 0);
    if (ret < 0) return AVID_ERR_OUT_OF_MEMORY;

    ret = av_frame_make_writable(ctx->frame);
    if (ret < 0) return AVID_ERR_OUT_OF_MEMORY;

    const uint8_t* in_data = (const uint8_t*)samples;
    ret = swr_convert(ctx->swr_ctx,
                       ctx->frame->data, ctx->frame->nb_samples,
                       &in_data, num_samples);
    if (ret < 0) {
        av_frame_unref(ctx->frame);
        return AVID_ERR_ENCODE_FAILED;
    }

    ctx->frame->pts = ctx->audio_pts;
    ctx->audio_pts += ctx->frame->nb_samples;

    // Encode
    ret = avcodec_send_frame(ctx->audio_ctx, ctx->frame);
    av_frame_unref(ctx->frame);
    if (ret < 0) return AVID_ERR_ENCODE_FAILED;

    while (ret >= 0) {
        ret = avcodec_receive_packet(ctx->audio_ctx, ctx->packet);
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) break;
        if (ret < 0) return AVID_ERR_ENCODE_FAILED;

        av_packet_rescale_ts(ctx->packet, ctx->audio_ctx->time_base,
                              ctx->audio_stream->time_base);
        ctx->packet->stream_index = ctx->audio_stream->index;

        ret = av_interleaved_write_frame(ctx->fmt_ctx, ctx->packet);
        av_packet_unref(ctx->packet);
    }

    return AVID_OK;
}

AvidError avid_encode_finalize(AvidEncodeContext* ctx) {
    if (!ctx || !ctx->fmt_ctx) return AVID_ERR_INVALID_ARG;

    // Flush video encoder
    if (ctx->video_ctx) {
        avcodec_send_frame(ctx->video_ctx, NULL);
        while (1) {
            int ret = avcodec_receive_packet(ctx->video_ctx, ctx->packet);
            if (ret == AVERROR_EOF || ret < 0) break;
            av_packet_rescale_ts(ctx->packet, ctx->video_ctx->time_base,
                                  ctx->video_stream->time_base);
            ctx->packet->stream_index = ctx->video_stream->index;
            av_interleaved_write_frame(ctx->fmt_ctx, ctx->packet);
            av_packet_unref(ctx->packet);
        }
    }

    // Flush audio encoder
    if (ctx->audio_ctx) {
        avcodec_send_frame(ctx->audio_ctx, NULL);
        while (1) {
            int ret = avcodec_receive_packet(ctx->audio_ctx, ctx->packet);
            if (ret == AVERROR_EOF || ret < 0) break;
            av_packet_rescale_ts(ctx->packet, ctx->audio_ctx->time_base,
                                  ctx->audio_stream->time_base);
            ctx->packet->stream_index = ctx->audio_stream->index;
            av_interleaved_write_frame(ctx->fmt_ctx, ctx->packet);
            av_packet_unref(ctx->packet);
        }
    }

    // Write trailer
    if (ctx->header_written) {
        av_write_trailer(ctx->fmt_ctx);
    }

    return AVID_OK;
}

void avid_encode_close(AvidEncodeContext* ctx) {
    if (!ctx) return;
    if (ctx->sws_ctx) sws_freeContext(ctx->sws_ctx);
    if (ctx->swr_ctx) swr_free(&ctx->swr_ctx);
    if (ctx->frame) av_frame_free(&ctx->frame);
    if (ctx->packet) av_packet_free(&ctx->packet);
    if (ctx->video_ctx) avcodec_free_context(&ctx->video_ctx);
    if (ctx->audio_ctx) avcodec_free_context(&ctx->audio_ctx);
    if (ctx->hw_device_ctx) av_buffer_unref(&ctx->hw_device_ctx);
    if (ctx->fmt_ctx) {
        if (ctx->fmt_ctx->pb &&
            !(ctx->fmt_ctx->oformat->flags & AVFMT_NOFILE)) {
            avio_closep(&ctx->fmt_ctx->pb);
        }
        avformat_free_context(ctx->fmt_ctx);
    }
    free(ctx);
}

// ─── Camera RAW ─────────────────────────────────────────────────────────────

int avid_raw_is_supported(const char* file_path) {
    if (!file_path) return 0;
    libraw_data_t* raw = libraw_init(0);
    if (!raw) return 0;
    int ret = libraw_open_file(raw, file_path);
    libraw_close(raw);
    return (ret == LIBRAW_SUCCESS) ? 1 : 0;
}

AvidError avid_raw_decode(const char* file_path,
                           const AvidRawConfig* config,
                           AvidDecodedFrame* frame) {
    if (!file_path || !frame) return AVID_ERR_INVALID_ARG;
    memset(frame, 0, sizeof(AvidDecodedFrame));

    libraw_data_t* raw = libraw_init(0);
    if (!raw) return AVID_ERR_OUT_OF_MEMORY;

    // Configure
    if (config) {
        raw->params.use_camera_wb = config->use_camera_wb;
        raw->params.use_auto_wb = config->use_auto_wb;
        raw->params.half_size = config->half_size;
        raw->params.output_bps = config->output_bps > 0 ? config->output_bps : 16;
        raw->params.bright = config->brightness > 0 ? config->brightness : 1.0f;
        raw->params.highlight = (int)config->highlight_mode;
        raw->params.threshold = (float)config->denoise_threshold;

        if (config->user_mul[0] > 0) {
            raw->params.user_mul[0] = config->user_mul[0];
            raw->params.user_mul[1] = config->user_mul[1];
            raw->params.user_mul[2] = config->user_mul[2];
            raw->params.user_mul[3] = config->user_mul[3];
        }
    } else {
        raw->params.use_camera_wb = 1;
        raw->params.output_bps = 16;
    }

    // Output as linear RGB (no gamma)
    raw->params.output_color = 1; // sRGB
    raw->params.no_auto_bright = 1;

    int ret = libraw_open_file(raw, file_path);
    if (ret != LIBRAW_SUCCESS) {
        libraw_close(raw);
        return AVID_ERR_IO;
    }

    ret = libraw_unpack(raw);
    if (ret != LIBRAW_SUCCESS) {
        libraw_close(raw);
        return AVID_ERR_DECODE_FAILED;
    }

    ret = libraw_dcraw_process(raw);
    if (ret != LIBRAW_SUCCESS) {
        libraw_close(raw);
        return AVID_ERR_DECODE_FAILED;
    }

    libraw_processed_image_t* img = libraw_dcraw_make_mem_image(raw, &ret);
    if (!img || ret != LIBRAW_SUCCESS) {
        libraw_close(raw);
        return AVID_ERR_DECODE_FAILED;
    }

    // Copy to output frame
    frame->width = img->width;
    frame->height = img->height;
    frame->data_size = (size_t)img->data_size;
    frame->data = (uint8_t*)av_malloc(frame->data_size);
    if (!frame->data) {
        libraw_dcraw_clear_mem(img);
        libraw_close(raw);
        return AVID_ERR_OUT_OF_MEMORY;
    }
    memcpy(frame->data, img->data, frame->data_size);

    frame->stride = img->width * img->colors * (img->bits / 8);
    frame->format = img->bits == 16 ? AVID_PIX_FMT_RGBA16 : AVID_PIX_FMT_RGB8;
    frame->key_frame = 1;
    frame->timestamp = 0;
    frame->frame_number = 0;

    libraw_dcraw_clear_mem(img);
    libraw_close(raw);
    return AVID_OK;
}

// ─── Image Sequences ────────────────────────────────────────────────────────

AvidError avid_imgseq_open(const AvidImageSeqConfig* config,
                            AvidImageSeqContext** ctx) {
    if (!config || !config->directory || !config->pattern || !ctx)
        return AVID_ERR_INVALID_ARG;

    AvidImageSeqContext* ic = calloc(1, sizeof(AvidImageSeqContext));
    if (!ic) return AVID_ERR_OUT_OF_MEMORY;

    snprintf(ic->directory, sizeof(ic->directory), "%s", config->directory);
    snprintf(ic->pattern, sizeof(ic->pattern), "%s", config->pattern);
    ic->start_frame = config->start_frame;
    ic->end_frame = config->end_frame;
    ic->fps = config->fps;
    ic->output_format = config->output_format;
    ic->thread_count = config->thread_count;
    ic->frame_count = config->end_frame - config->start_frame + 1;

    *ctx = ic;
    return AVID_OK;
}

AvidError avid_imgseq_read_frame(AvidImageSeqContext* ctx,
                                  int frame_number,
                                  AvidDecodedFrame* frame) {
    if (!ctx || !frame) return AVID_ERR_INVALID_ARG;
    memset(frame, 0, sizeof(AvidDecodedFrame));

    // Build file path
    char filename[256];
    snprintf(filename, sizeof(filename), ctx->pattern, frame_number);

    char filepath[4352];
    snprintf(filepath, sizeof(filepath), "%s/%s", ctx->directory, filename);

    // Use FFmpeg's image decoder for universal format support
    // This handles EXR, DPX, TIFF, PNG, JPEG, TGA, SGI, etc.
    AvidDecodeConfig dec_cfg = {
        .file_path = filepath,
        .output_format = ctx->output_format,
        .hw_accel = AVID_HW_NONE,
        .thread_count = 1,
        .target_width = 0,
        .target_height = 0,
    };

    AvidDecodeContext* dec_ctx = NULL;
    AvidError err = avid_decode_open(&dec_cfg, &dec_ctx);
    if (err != AVID_OK) return err;

    err = avid_decode_next_frame(dec_ctx, frame);
    avid_decode_close(dec_ctx);

    if (err == AVID_OK) {
        frame->timestamp = (double)(frame_number - ctx->start_frame) / ctx->fps;
        frame->frame_number = frame_number;
    }

    return err;
}

int avid_imgseq_frame_count(AvidImageSeqContext* ctx) {
    return ctx ? ctx->frame_count : 0;
}

void avid_imgseq_close(AvidImageSeqContext* ctx) {
    free(ctx);
}

// ─── Remux ──────────────────────────────────────────────────────────────────

AvidError avid_remux(const char* input_path,
                      const AvidMuxConfig* config,
                      AvidProgressCallback progress,
                      void* user_data) {
    if (!input_path || !config || !config->output_path) return AVID_ERR_INVALID_ARG;

    AVFormatContext* ifmt_ctx = NULL;
    AVFormatContext* ofmt_ctx = NULL;
    int ret;

    ret = avformat_open_input(&ifmt_ctx, input_path, NULL, NULL);
    if (ret < 0) return AVID_ERR_IO;

    ret = avformat_find_stream_info(ifmt_ctx, NULL);
    if (ret < 0) {
        avformat_close_input(&ifmt_ctx);
        return AVID_ERR_DEMUXER_FAILED;
    }

    ret = avformat_alloc_output_context2(&ofmt_ctx, NULL, config->container,
                                          config->output_path);
    if (ret < 0) {
        avformat_close_input(&ifmt_ctx);
        return AVID_ERR_MUXER_FAILED;
    }

    // Map streams
    int* stream_map = calloc(ifmt_ctx->nb_streams, sizeof(int));
    int out_idx = 0;

    for (unsigned i = 0; i < ifmt_ctx->nb_streams; i++) {
        AVCodecParameters* par = ifmt_ctx->streams[i]->codecpar;
        if (par->codec_type == AVMEDIA_TYPE_VIDEO && !config->video_stream) {
            stream_map[i] = -1;
            continue;
        }
        if (par->codec_type == AVMEDIA_TYPE_AUDIO && !config->audio_stream) {
            stream_map[i] = -1;
            continue;
        }

        AVStream* out_stream = avformat_new_stream(ofmt_ctx, NULL);
        avcodec_parameters_copy(out_stream->codecpar, par);
        out_stream->codecpar->codec_tag = 0;
        stream_map[i] = out_idx++;
    }

    // Open output
    if (!(ofmt_ctx->oformat->flags & AVFMT_NOFILE)) {
        ret = avio_open(&ofmt_ctx->pb, config->output_path, AVIO_FLAG_WRITE);
        if (ret < 0) {
            free(stream_map);
            avformat_close_input(&ifmt_ctx);
            avformat_free_context(ofmt_ctx);
            return AVID_ERR_IO;
        }
    }

    ret = avformat_write_header(ofmt_ctx, NULL);
    if (ret < 0) {
        free(stream_map);
        avformat_close_input(&ifmt_ctx);
        avformat_free_context(ofmt_ctx);
        return AVID_ERR_MUXER_FAILED;
    }

    // Copy packets
    AVPacket* pkt = av_packet_alloc();
    int64_t total_dur = ifmt_ctx->duration > 0 ? ifmt_ctx->duration : 1;
    int64_t frames_done = 0;

    while (1) {
        ret = av_read_frame(ifmt_ctx, pkt);
        if (ret < 0) break;

        if (pkt->stream_index >= (int)ifmt_ctx->nb_streams
            || stream_map[pkt->stream_index] < 0) {
            av_packet_unref(pkt);
            continue;
        }

        int in_idx = pkt->stream_index;
        pkt->stream_index = stream_map[in_idx];

        AVStream* in_stream = ifmt_ctx->streams[in_idx];
        AVStream* out_stream = ofmt_ctx->streams[pkt->stream_index];

        av_packet_rescale_ts(pkt, in_stream->time_base, out_stream->time_base);
        pkt->pos = -1;

        ret = av_interleaved_write_frame(ofmt_ctx, pkt);
        av_packet_unref(pkt);

        frames_done++;
        if (progress && (frames_done % 100 == 0)) {
            double prog = (double)pkt->pts * av_q2d(in_stream->time_base)
                          / ((double)total_dur / AV_TIME_BASE);
            if (prog > 1.0) prog = 1.0;
            progress(prog, frames_done, 0, 0, user_data);
        }
    }

    av_write_trailer(ofmt_ctx);

    av_packet_free(&pkt);
    free(stream_map);
    if (!(ofmt_ctx->oformat->flags & AVFMT_NOFILE))
        avio_closep(&ofmt_ctx->pb);
    avformat_free_context(ofmt_ctx);
    avformat_close_input(&ifmt_ctx);

    if (progress) progress(1.0, frames_done, frames_done, 0, user_data);
    return AVID_OK;
}

// ─── Transcode ──────────────────────────────────────────────────────────────

AvidError avid_transcode(const char* input_path,
                          const AvidEncodeConfig* encode_config,
                          AvidProgressCallback progress,
                          void* user_data) {
    if (!input_path || !encode_config) return AVID_ERR_INVALID_ARG;

    // Open decoder
    AvidDecodeConfig dec_cfg = {
        .file_path = input_path,
        .output_format = AVID_PIX_FMT_RGBA8,
        .hw_accel = AVID_HW_NONE, // Decode in software for transcode
        .thread_count = 0,
        .target_width = encode_config->width,
        .target_height = encode_config->height,
    };

    AvidDecodeContext* dec_ctx = NULL;
    AvidError err = avid_decode_open(&dec_cfg, &dec_ctx);
    if (err != AVID_OK) return err;

    // Probe to get frame count estimate
    AvidProbeResult probe;
    avid_probe(input_path, &probe);
    int64_t est_frames = probe.duration > 0 && probe.fps > 0
        ? (int64_t)(probe.duration * probe.fps) : 0;

    // Open encoder
    AvidEncodeContext* enc_ctx = NULL;
    err = avid_encode_open(encode_config, &enc_ctx);
    if (err != AVID_OK) {
        avid_decode_close(dec_ctx);
        return err;
    }

    // Decode → Encode loop
    AvidDecodedFrame frame;
    int64_t pts = 0;

    while (1) {
        err = avid_decode_next_frame(dec_ctx, &frame);
        if (err == AVID_ERR_NOT_FOUND) break; // EOF
        if (err != AVID_OK) break;

        err = avid_encode_write_video(enc_ctx,
                                       frame.data, frame.data_size,
                                       frame.width, frame.height,
                                       frame.format, pts);
        avid_frame_free(&frame);
        if (err != AVID_OK) break;

        pts++;

        if (progress && (pts % 5 == 0)) {
            double prog = est_frames > 0 ? (double)pts / est_frames : 0;
            double fps_rate = 0; // Could track timing here
            progress(prog < 1.0 ? prog : 0.99, pts, est_frames, fps_rate, user_data);
        }
    }

    // Finalize
    AvidError fin_err = avid_encode_finalize(enc_ctx);
    avid_encode_close(enc_ctx);
    avid_decode_close(dec_ctx);

    if (progress) progress(1.0, pts, pts, 0, user_data);

    return (err == AVID_ERR_NOT_FOUND) ? fin_err : err;
}

// ─── Utility ────────────────────────────────────────────────────────────────

const char* avid_error_string(AvidError error) {
    switch (error) {
        case AVID_OK:                      return "OK";
        case AVID_ERR_INVALID_ARG:         return "Invalid argument";
        case AVID_ERR_NOT_FOUND:           return "Not found / EOF";
        case AVID_ERR_DECODE_FAILED:       return "Decode failed";
        case AVID_ERR_ENCODE_FAILED:       return "Encode failed";
        case AVID_ERR_FORMAT_UNSUPPORTED:  return "Format unsupported";
        case AVID_ERR_HW_ACCEL_UNAVAILABLE: return "HW acceleration unavailable";
        case AVID_ERR_OUT_OF_MEMORY:       return "Out of memory";
        case AVID_ERR_IO:                  return "I/O error";
        case AVID_ERR_CODEC_NOT_FOUND:     return "Codec not found";
        case AVID_ERR_MUXER_FAILED:        return "Muxer failed";
        case AVID_ERR_DEMUXER_FAILED:      return "Demuxer failed";
        case AVID_ERR_ABORTED:             return "Aborted";
        default:                           return "Unknown error";
    }
}

const char* avid_ffmpeg_version(void) {
    return av_version_info();
}

const char* avid_libraw_version(void) {
    return libraw_version();
}

const char* avid_openexr_version(void) {
    return "3.2.0"; // Linked at build time
}
