#!/usr/bin/env python3
import json
import math
import sys
import time
from typing import Any, Dict, List


def load_request() -> Dict[str, Any]:
    raw = sys.stdin.read()
    if not raw:
        raise RuntimeError("Missing request payload")
    return json.loads(raw)


def infer_confidence(avg_log_prob: float, words: List[Dict[str, Any]]) -> float:
    if words:
        total = sum(word.get("confidence", 0.0) for word in words)
        return max(0.0, min(1.0, total / max(1, len(words))))
    return max(0.0, min(1.0, math.exp(avg_log_prob)))


def attach_speakers(audio_path: str, segments: List[Dict[str, Any]], hf_token: str) -> List[Dict[str, Any]]:
    try:
        from pyannote.audio import Pipeline  # type: ignore
    except Exception:
        return [{
            "id": "warning",
            "warning": "pyannote.audio is not installed; diarization was skipped.",
        }]

    if not hf_token:
        return [{
            "id": "warning",
            "warning": "PYANNOTE_AUTH_TOKEN is not configured; diarization was skipped.",
        }]

    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=hf_token,
    )
    diarization = pipeline(audio_path)

    speakers: Dict[str, Dict[str, Any]] = {}
    speech_turns: List[Dict[str, Any]] = []
    for turn, _, speaker_label in diarization.itertracks(yield_label=True):
        speech_turns.append({
            "start": float(turn.start),
            "end": float(turn.end),
            "speaker": speaker_label,
        })
        if speaker_label not in speakers:
            speakers[speaker_label] = {
                "id": speaker_label,
                "name": speaker_label.replace("_", " ").title(),
                "confidence": None,
                "identified": False,
            }

    for segment in segments:
        best_speaker = None
        best_overlap = 0.0
        seg_start = segment["startTime"]
        seg_end = segment["endTime"]
        for turn in speech_turns:
            overlap = max(0.0, min(seg_end, turn["end"]) - max(seg_start, turn["start"]))
            if overlap > best_overlap:
                best_overlap = overlap
                best_speaker = turn["speaker"]
        if best_speaker:
            segment["speakerId"] = best_speaker
            segment["speakerName"] = speakers[best_speaker]["name"]
            for word in segment.get("words", []):
                word["speakerId"] = best_speaker

    return list(speakers.values())


def main() -> None:
    request = load_request()

    from faster_whisper import WhisperModel  # type: ignore

    started_at = time.time()
    model_load_started_at = time.time()

    model = WhisperModel(
        request["model"],
        device=request.get("device", "cpu"),
        compute_type=request.get("computeType", "int8"),
        download_root=request.get("cacheDir") or None,
    )

    model_load_time_ms = int((time.time() - model_load_started_at) * 1000)

    segments_iter, info = model.transcribe(
        request["audioPath"],
        language=request.get("language") or None,
        beam_size=int(request.get("beamSize", 5)),
        vad_filter=bool(request.get("vadFilter", True)),
        word_timestamps=True,
        task=request.get("task", "transcribe"),
    )

    segments: List[Dict[str, Any]] = []
    for segment in segments_iter:
        words = []
        for word in getattr(segment, "words", []) or []:
            word_start = word.start if word.start is not None else segment.start
            word_end = word.end if word.end is not None else segment.end
            words.append({
                "text": word.word.strip(),
                "startTime": float(word_start),
                "endTime": float(word_end),
                "confidence": float(getattr(word, "probability", 0.0)),
            })

        confidence = infer_confidence(float(getattr(segment, "avg_logprob", -1.0)), words)
        segments.append({
            "startTime": float(segment.start),
            "endTime": float(segment.end),
            "text": segment.text.strip(),
            "confidence": confidence,
            "translatedText": segment.text.strip() if request.get("task") == "translate" else None,
            "words": words,
        })

    warnings: List[str] = []
    speakers: List[Dict[str, Any]] = []
    if request.get("diarize"):
        diarization_result = attach_speakers(
            request["audioPath"],
            segments,
            request.get("hfToken") or "",
        )
        for item in diarization_result:
            if "warning" in item:
                warnings.append(item["warning"])
            else:
                speakers.append(item)

    response = {
        "segments": segments,
        "languageCode": getattr(info, "language", None),
        "languageConfidence": float(getattr(info, "language_probability", 0.0) or 0.0),
        "speakers": speakers,
        "warnings": warnings,
        "hardware": request.get("device", "cpu"),
        "durationMs": int((time.time() - started_at) * 1000),
        "modelLoadTimeMs": model_load_time_ms,
    }

    sys.stdout.write(json.dumps(response))


if __name__ == "__main__":
    main()
