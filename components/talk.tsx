"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";

// In-browser voice call with the Aangan assistant (Vaani WebRTC via LiveKit).
// idle → connecting → live → ended. The conversation reaches the studio dashboard through
// Vaani's webhook once the call ends; nothing is stored in the browser.

type Phase = "idle" | "connecting" | "live" | "ended" | "error";
type Line = { who: "agent" | "you"; text: string };

export function VoiceCall() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [interim, setInterim] = useState<Line | null>(null);
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [level, setLevel] = useState(0);
  const roomRef = useRef<Room | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLDivElement>(null);

  // timer
  useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // orb follows the assistant's voice level
  useEffect(() => {
    if (phase !== "live") return;
    let raf = 0;
    const tick = () => {
      const room = roomRef.current;
      let l = 0;
      room?.remoteParticipants.forEach((p) => (l = Math.max(l, p.audioLevel)));
      setLevel((prev) => prev * 0.7 + Math.min(1, l * 2.2) * 0.3);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => () => hangUp(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCaptions(url: string) {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data as string) as { type: string; segment?: { speaker: string; text: string; is_final?: boolean } };
        if (m.type === "transcript" && m.segment?.text) {
          const line: Line = { who: m.segment.speaker === "agent" ? "agent" : "you", text: m.segment.text };
          if (m.segment.is_final === false) setInterim(line);
          else { setInterim(null); setLines((ls) => [...ls, line].slice(-3)); }
        }
        if (m.type === "call_ended") hangUp(true);
      };
    } catch { /* captions are optional */ }
  }

  async function start() {
    setError(""); setLines([]); setInterim(null); setSeconds(0); setMuted(false);
    setPhase("connecting");
    try {
      // Ask for the mic first so the browser prompt appears right after the click.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());

      const res = await fetch("/api/talk/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: lang }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not start the call.");

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          audioRef.current?.appendChild(el);
        }
      });
      room.on(RoomEvent.Disconnected, () => hangUp(true));
      await room.connect(j.url, j.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      if (j.captions) openCaptions(j.captions);
      setPhase("live");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/Permission|NotAllowed|denied/i.test(msg) ? "Please allow microphone access so the assistant can hear you." : msg);
      setPhase("error");
      hangUp(false);
    }
  }

  function hangUp(showThanks: boolean) {
    wsRef.current?.close();
    wsRef.current = null;
    const room = roomRef.current;
    roomRef.current = null;
    if (room) room.disconnect();
    if (audioRef.current) audioRef.current.innerHTML = "";
    if (showThanks) setPhase((p) => (p === "live" || p === "connecting" ? "ended" : p));
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(muted);
    setMuted(!muted);
  }

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const scale = 1 + level * 0.35;

  return (
    <div className="flex flex-col items-center">
      <div ref={audioRef} className="hidden" aria-hidden />

      {/* The orb */}
      <div className="relative grid h-56 w-56 place-items-center sm:h-64 sm:w-64">
        <span className={`absolute inset-0 rounded-full bg-ombre opacity-25 blur-2xl transition-transform duration-100 ${phase === "idle" ? "animate-breathe" : ""}`} style={{ transform: `scale(${phase === "live" ? scale + 0.1 : 1})` }} />
        {phase === "live" && <span className="pin-ring absolute inset-6 rounded-full bg-fuchsia-300/40" />}
        <button
          onClick={phase === "live" ? () => hangUp(true) : phase === "connecting" ? undefined : start}
          disabled={phase === "connecting"}
          aria-label={phase === "live" ? "End call" : "Start talking to Aangan"}
          className="bg-ombre animate-drift relative grid h-40 w-40 place-items-center rounded-full text-white shadow-[0_30px_70px_-20px_rgba(192,38,211,0.8)] transition-transform duration-100 hover:brightness-105 sm:h-44 sm:w-44"
          style={{ transform: `scale(${phase === "live" ? scale : 1})` }}
        >
          <span className="text-center">
            {phase === "connecting" ? (
              <span className="block h-8 w-8 animate-spin rounded-full border-[3px] border-white/40 border-t-white" />
            ) : phase === "live" ? (
              <>
                <span className="block font-display text-3xl font-semibold tabular-nums">{mmss}</span>
                <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/85">Tap to end</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="mx-auto h-10 w-10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                <span className="mt-2 block text-sm font-semibold">{phase === "ended" ? "Talk again" : "Talk to us"}</span>
              </>
            )}
          </span>
        </button>
      </div>

      {/* Below the orb: one line of state, nothing more */}
      <div className="mt-2 min-h-[96px] w-full max-w-md text-center">
        {phase === "idle" && (
          <div className="animate-rise space-y-3">
            <div className="inline-flex rounded-full bg-white/80 p-0.5 text-xs font-semibold shadow-sm ring-1 ring-violet-100 backdrop-blur">
              {(["en", "hi"] as const).map((l) => (
                <button key={l} onClick={() => setLang(l)} className={`rounded-full px-3 py-1 transition ${lang === l ? "bg-ink text-white" : "text-muted"}`}>{l === "en" ? "English" : "हिंदी"}</button>
              ))}
            </div>
            <p className="text-sm text-ink/70">Takes about 3 minutes · uses your microphone</p>
          </div>
        )}
        {phase === "connecting" && <p className="animate-fade-in text-sm text-ink/70">Connecting you to the studio…</p>}
        {phase === "live" && (
          <div className="space-y-2">
            <div className="min-h-[52px] space-y-1">
              {[...lines, ...(interim ? [interim] : [])].slice(-2).map((l, i) => (
                <p key={i} className={`animate-fade-in text-sm ${l.who === "agent" ? "font-medium text-ink" : "text-fuchsia-700"}`}>{l.text}</p>
              ))}
              {lines.length === 0 && !interim && <p className="text-sm text-muted">Say hello. The assistant is listening.</p>}
            </div>
            <div className="flex justify-center gap-2">
              <button onClick={toggleMute} className="btn-soft px-4 py-1.5 text-xs">{muted ? "Unmute" : "Mute"}</button>
              <button onClick={() => hangUp(true)} className="rounded-xl bg-ink px-4 py-1.5 text-xs font-semibold text-white">End call</button>
            </div>
          </div>
        )}
        {phase === "ended" && (
          <div className="animate-rise space-y-1">
            <p className="font-display text-xl font-semibold text-ink">Thank you for calling Aangan.</p>
            <p className="text-sm text-ink/70">If you booked a consultation, your calendar invite is on its way. Our designer already has everything you shared.</p>
          </div>
        )}
        {phase === "error" && <p className="animate-fade-in text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}

// Soft cross-fade between a few interior clips (muted, looping, never interactive).
export function VideoCycle({ sources }: { sources: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (sources.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % sources.length), 8000);
    return () => clearInterval(t);
  }, [sources.length]);
  return (
    <div className="absolute inset-0" aria-hidden>
      {sources.map((s, k) => (
        <video key={s} src={s} autoPlay muted loop playsInline preload={k === 0 ? "auto" : "metadata"}
          className={`video-bg transition-opacity duration-[2000ms] ${k === i ? "opacity-100" : "opacity-0"}`} />
      ))}
    </div>
  );
}
