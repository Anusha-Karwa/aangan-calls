import type { Metadata } from "next";
import { env } from "@/lib/env";
import { AanganLogo } from "@/components/logo";
import { VideoCycle, VoiceCall } from "@/components/talk";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Talk to Aangan · Interior design studio, Pune",
  description: "Tell us about your space and book a free 60-minute design consultation, in a 3-minute voice chat.",
};

// Public customer page: one idea, one button. Talk to the studio's voice assistant in the browser.
export default function Home() {
  const videos = env("TALK_VIDEO_URLS").split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      {/* background: soft cross-fading interiors under a light ombré wash */}
      <VideoCycle sources={videos} />
      <div className="video-wash" />
      <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/55 to-white/85" />

      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <AanganLogo size={36} />
        <span className="hidden rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold text-ink/70 ring-1 ring-violet-100 backdrop-blur sm:inline">Pune · PCMC</span>
      </header>

      <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pb-10 text-center">
        <h1 className="animate-rise font-display text-4xl font-semibold leading-tight text-ink sm:text-6xl">
          Tell us about <span className="text-ombre">your space.</span>
        </h1>
        <p className="animate-rise mt-3 max-w-md text-[15px] text-ink/70" style={{ animationDelay: "120ms" }}>
          Chat with our design assistant and book a free 60-minute consultation, right here, in your voice.
        </p>
        <div className="animate-rise mt-8" style={{ animationDelay: "220ms" }}>
          <VoiceCall />
        </div>
      </section>

      <footer className="relative z-10 px-5 pb-5 text-center text-[11px] text-ink/50">
        Calls are recorded so our designer has your details · Aangan Studio, Pune
      </footer>
    </main>
  );
}
