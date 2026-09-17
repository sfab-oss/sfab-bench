import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

export const VOICE_MAX_MS = 30_000;

function pickMime(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find(
    (type) =>
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(type)
  );
}

export type VoiceState = "idle" | "recording" | "transcribing" | "error";

export function formatVoiceTime(ms: number) {
  const s = Math.min(99, Math.floor(ms / 1000));
  return `0:${s.toString().padStart(2, "0")}`;
}

export function useVoiceInput(onText: (text: string) => void) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const skipRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const genRef = useRef(0);
  const startingRef = useRef(false);
  const startedAt = useRef(0);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stopMeter = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    void ctxRef.current?.close();
    ctxRef.current = null;
    setLevel(0);
  }, []);

  const release = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => {
      t.stop();
    });
    streamRef.current = null;
    recRef.current = null;
  }, [stopMeter]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      release();
    },
    [release]
  );

  const startMeter = useCallback((stream: MediaStream) => {
    startedAt.current = Date.now();
    setElapsedMs(0);
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) {
      const tick = () => {
        setElapsedMs(Date.now() - startedAt.current);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const ctx = new AC();
    ctxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const loop = () => {
      setElapsedMs(Date.now() - startedAt.current);
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) {
        const n = (v - 128) / 128;
        sum += n * n;
      }
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const complete = useCallback(() => {
    skipRef.current = false;
    const rec = recRef.current;
    if (rec && rec.state === "recording") rec.stop();
  }, []);

  const cancel = useCallback(() => {
    genRef.current += 1;
    startingRef.current = false;
    skipRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
    const rec = recRef.current;
    if (rec && rec.state === "recording") rec.stop();
    else {
      release();
      setElapsedMs(0);
      setState("idle");
    }
  }, [release]);

  const start = useCallback(async () => {
    if (startingRef.current || recRef.current) return;
    setError(null);
    skipRef.current = false;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError("Microphone is not available in this browser");
      setState("error");
      return;
    }
    const gen = ++genRef.current;
    startingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (gen !== genRef.current) {
        startingRef.current = false;
        stream.getTracks().forEach((t) => {
          t.stop();
        });
        return;
      }
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined
      );
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onerror = () => {
        release();
        setError("Recording failed");
        setState("error");
      };
      rec.onstop = () => {
        const skipped = skipRef.current;
        const type = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        release();
        if (skipped || blob.size < 64) {
          setElapsedMs(0);
          setState("idle");
          return;
        }
        setState("transcribing");
        const ac = new AbortController();
        abortRef.current = ac;
        void apiFetch("/api/transcribe", {
          method: "POST",
          headers: { "content-type": type },
          body: blob,
          signal: ac.signal,
        })
          .then(async (res) => {
            const body = (await res.json()) as {
              text?: string;
              error?: string;
            };
            if (!res.ok) throw new Error(body.error || res.statusText);
            const text = body.text?.trim() ?? "";
            if (text) onTextRef.current(text);
            setElapsedMs(0);
            setState("idle");
          })
          .catch((err: unknown) => {
            if (err instanceof DOMException && err.name === "AbortError") {
              setElapsedMs(0);
              setState("idle");
              return;
            }
            setError(err instanceof Error ? err.message : String(err));
            setState("error");
          })
          .finally(() => {
            abortRef.current = null;
          });
      };
      recRef.current = rec;
      rec.start();
      startMeter(stream);
      startingRef.current = false;
      setState("recording");
      timerRef.current = setTimeout(complete, VOICE_MAX_MS);
    } catch (err) {
      startingRef.current = false;
      if (gen !== genRef.current) return;
      release();
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "Microphone permission denied. Allow it for this site, then tap again."
          : "Could not open the microphone"
      );
      setState("error");
    }
  }, [complete, release, startMeter]);

  const active = state === "recording" || state === "transcribing";
  return {
    state,
    error,
    elapsedMs,
    level,
    start,
    complete,
    cancel,
    recording: state === "recording",
    busy: state === "transcribing",
    active,
  };
}
