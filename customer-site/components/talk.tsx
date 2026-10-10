"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";

// Customer flow: ask → type details → voice chat (live conversation on screen) → thank you.
// The conversation reaches the studio dashboard through Vaani's webhook; nothing is stored here.

type Phase = "ask" | "details" | "connecting" | "live" | "ended" | "error";
type Line = { id: string; who: "agent" | "you"; text: string; final: boolean };

export function VoiceCall() {
  const [phase, setPhase] = useState<Phase>("ask");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [level, setLevel] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const roomRef = useRef<Room | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

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
      let l = 0;
      roomRef.current?.remoteParticipants.forEach((p) => (l = Math.max(l, p.audioLevel)));
      setLevel((prev) => prev * 0.7 + Math.min(1, l * 2.2) * 0.3);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // keep the live conversation scrolled to the latest line
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  useEffect(() => () => hangUp(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCaptions(url: string) {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data as string) as {
          type: string;
          segments?: { id?: string; speaker: string; text: string; is_final?: boolean }[];
          segment?: { id?: string; speaker: string; text: string; is_final?: boolean; segment_index?: number };
        };
        const add = (s: { id?: string; speaker: string; text: string; is_final?: boolean; segment_index?: number }) => {
          if (!s.text?.trim()) return;
          const who = s.speaker === "agent" ? "agent" : "you";
          const id = s.id ?? `${who}-${s.segment_index ?? Date.now()}`;
          setLines((ls) => {
            const i = ls.findIndex((l) => l.id === id);
            // replace the in-progress line from the same speaker, or the same segment
            const j = i >= 0 ? i : ls.length && !ls[ls.length - 1].final && ls[ls.length - 1].who === who ? ls.length - 1 : -1;
            const line: Line = { id, who, text: s.text, final: s.is_final !== false };
            if (j >= 0) { const copy = ls.slice(); copy[j] = line; return copy; }
            return [...ls, line];
          });
        };
        if (m.type === "history") m.segments?.forEach(add);
        if (m.type === "transcript" && m.segment) add(m.segment);
        if (m.type === "call_ended") hangUp(true);
      };
    } catch { /* captions are optional */ }
  }

  async function start() {
    setError(""); setLines([]); setSeconds(0); setMuted(false);
    setPhase("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.getTracks().forEach((t) => t.stop());

      const res = await fetch("/api/talk/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang, ...form }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not start the call.");

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) audioRef.current?.appendChild(track.attach());
      });
      room.on(RoomEvent.Disconnected, () => hangUp(true));
      await room.connect(j.url, j.token);
      // Echo cancellation + noise suppression stop the assistant hearing itself through laptop speakers.
      await room.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
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

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(form.email.trim());
  const validPhone = form.phone.replace(/\D/g, "").length >= 10;
  const validName = form.name.trim().length >= 2;
  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const scale = 1 + level * 0.3;

  return (
    <div className="flex w-full flex-col items-center">
      <div ref={audioRef} className="hidden" aria-hidden />

      {/* 1 · Ask */}
      {phase === "ask" && (
        <div className="animate-rise flex flex-col items-center gap-5">
          <Orb label="Enquire" sub="about your space" onClick={() => setPhase("details")} idle />
          <p className="text-sm text-ink/70">Would you like to tell us about your project? It takes about 3 minutes.</p>
          <button onClick={() => setPhase("details")} className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5">
            Yes, I&apos;d like to enquire
          </button>
        </div>
      )}

      {/* 2 · Type details */}
      {(phase === "details" || phase === "error") && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (validName && validEmail && validPhone) start(); }}
          className="animate-rise w-full max-w-sm space-y-3 rounded-3xl bg-white/85 p-6 text-left shadow-[0_24px_60px_-30px_rgba(159,122,234,0.6)] ring-1 ring-violet-100 backdrop-blur"
        >
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">First, a little about you</h2>
            <p className="mt-1 text-sm text-ink/60">So our designer can reach you and send your invite.</p>
          </div>
          <Field label="Your name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} autoComplete="name" placeholder="Meera Joshi" />
          <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} autoComplete="email" placeholder="you@example.com" invalid={form.email !== "" && !validEmail} />
          <Field label="Phone" type="tel" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} autoComplete="tel" placeholder="98220 14567" invalid={form.phone !== "" && !validPhone} />
          <div className="flex items-center justify-between pt-1">
            <div className="inline-flex rounded-full bg-violet-50 p-0.5 text-xs font-semibold">
              {(["en", "hi"] as const).map((l) => (
                <button type="button" key={l} onClick={() => setLang(l)} className={`rounded-full px-3 py-1 transition ${lang === l ? "bg-ink text-white" : "text-muted"}`}>{l === "en" ? "English" : "हिंदी"}</button>
              ))}
            </div>
            <span className="text-[11px] text-muted">Uses your microphone</span>
          </div>
          {phase === "error" && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <button disabled={!(validName && validEmail && validPhone)} className="bg-ombre w-full rounded-2xl py-3 text-sm font-semibold text-white shadow-md transition enabled:hover:brightness-105 disabled:opacity-40">
            Start the voice chat →
          </button>
          <p className="text-center text-[11px] text-ink/50">Calls are recorded so our designer has your details.</p>
        </form>
      )}

      {/* 3 · Connecting */}
      {phase === "connecting" && (
        <div className="animate-fade-in flex flex-col items-center gap-4">
          <Orb label="" sub="" spinning />
          <p className="text-sm text-ink/70">Connecting you to the studio…</p>
        </div>
      )}

      {/* 4 · Live: orb + the conversation as it happens */}
      {phase === "live" && (
        <div className="grid w-full max-w-4xl items-center gap-6 md:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-3">
            <div className="relative grid h-48 w-48 place-items-center">
              <span className="bg-ombre absolute inset-0 rounded-full opacity-30 blur-2xl transition-transform duration-100" style={{ transform: `scale(${scale + 0.1})` }} />
              <span className="pin-ring absolute inset-6 rounded-full bg-violet-200/50" />
              <div className="bg-ombre animate-drift relative grid h-36 w-36 place-items-center rounded-full text-white shadow-[0_28px_60px_-24px_rgba(159,122,234,0.7)] transition-transform duration-100" style={{ transform: `scale(${scale})` }}>
                <span className="text-center">
                  <span className="block font-display text-3xl font-semibold tabular-nums">{mmss}</span>
                  <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-white/85">{level > 0.08 ? "Speaking" : "Listening"}</span>
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={toggleMute} className="btn-soft px-4 py-1.5 text-xs">{muted ? "Unmute" : "Mute"}</button>
              <button onClick={() => hangUp(true)} className="rounded-xl bg-ink px-4 py-1.5 text-xs font-semibold text-white">End call</button>
            </div>
          </div>

          <div className="rounded-3xl bg-white/80 p-4 shadow-[0_24px_60px_-30px_rgba(159,122,234,0.5)] ring-1 ring-violet-100 backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" /> Live conversation
            </div>
            <div ref={logRef} className="h-[300px] space-y-2 overflow-y-auto pr-1 text-left" aria-live="polite">
              {lines.length === 0 && <p className="pt-24 text-center text-sm text-muted">The assistant is saying hello…</p>}
              {lines.map((l) => (
                <div key={l.id} className={`flex ${l.who === "you" ? "justify-end" : "justify-start"}`}>
                  <p className={`animate-fade-in max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${l.who === "you" ? "bg-ombre rounded-br-md text-white" : "rounded-bl-md bg-violet-50 text-ink"} ${l.final ? "" : "opacity-70"}`}>
                    {l.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5 · Thank you */}
      {phase === "ended" && (
        <div className="animate-rise max-w-md space-y-3 text-center">
          <div className="bg-ombre mx-auto grid h-16 w-16 place-items-center rounded-full text-2xl text-white shadow-lg">✓</div>
          <p className="font-display text-2xl font-semibold text-ink">Thank you, {form.name.split(" ")[0] || "for calling"}.</p>
          <p className="text-sm text-ink/70">
            We&apos;ll email a summary to <strong className="text-ink">{form.email}</strong>. If you booked a consultation, your calendar invite is on its way, and our designer already has everything you shared.
          </p>
          <button onClick={() => setPhase("ask")} className="btn-soft text-xs">Start a new enquiry</button>
        </div>
      )}
    </div>
  );
}

function Orb({ label, sub, onClick, idle, spinning }: { label: string; sub: string; onClick?: () => void; idle?: boolean; spinning?: boolean }) {
  return (
    <div className="relative grid h-52 w-52 place-items-center">
      <span className={`bg-ombre absolute inset-0 rounded-full opacity-25 blur-2xl ${idle ? "animate-breathe" : ""}`} />
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="bg-ombre animate-drift relative grid h-40 w-40 place-items-center rounded-full text-white shadow-[0_28px_60px_-24px_rgba(159,122,234,0.7)] transition hover:brightness-105"
      >
        {spinning ? (
          <span className="block h-8 w-8 animate-spin rounded-full border-[3px] border-white/40 border-t-white" />
        ) : (
          <span className="text-center">
            <svg viewBox="0 0 24 24" className="mx-auto h-9 w-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            <span className="mt-1.5 block text-sm font-semibold">{label}</span>
            <span className="block text-[11px] text-white/85">{sub}</span>
          </span>
        )}
      </button>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, autoComplete, invalid }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; autoComplete?: string; invalid?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className={`mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-slate-300 focus:ring-4 ${invalid ? "border-red-300 focus:ring-red-100" : "border-violet-100 focus:border-violet-300 focus:ring-violet-100"}`}
      />
    </label>
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
