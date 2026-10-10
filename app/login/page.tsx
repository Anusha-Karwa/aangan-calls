import { env } from "@/lib/env";
import { VideoBackdrop } from "@/components/ui";
import { AanganLogo } from "@/components/logo";
import { login } from "../actions";

export const dynamic = "force-dynamic";

export default function Login({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <VideoBackdrop src={env("LOGIN_VIDEO_URL")} tone="light" />

      <div className="relative z-10 grid w-full max-w-5xl items-center gap-10 md:grid-cols-2">
        <div className="animate-rise text-center md:text-left">
          <div className="inline-flex rounded-2xl bg-white/70 px-3 py-2 shadow-sm ring-1 ring-violet-100 backdrop-blur"><AanganLogo size={52} /></div>
          <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] text-ink sm:text-6xl">
            Every call,
            <br />
            <span className="text-ombre">ready to design.</span>
          </h1>
          <p className="mt-4 max-w-sm text-base text-ink/75 md:max-w-md">
            Answered, qualified and booked by the studio’s voice assistant, so you walk into every consultation already knowing the brief.
          </p>
          <div className="mt-6 hidden flex-wrap gap-2 md:flex">
            {["24×7 answering", "Booked on the call", "Prep card in your inbox"].map((t, i) => (
              <span key={t} className="animate-pop rounded-full bg-white/85 px-3 py-1.5 text-xs font-semibold text-violet-800 shadow-sm ring-1 ring-violet-100 backdrop-blur" style={{ animationDelay: `${300 + i * 150}ms` }}>
                {t}
              </span>
            ))}
          </div>
        </div>

        <form action={login} className="card ombre-border animate-rise mx-auto w-full max-w-sm space-y-4 bg-white/85 p-7" style={{ animationDelay: "150ms" }}>
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">Welcome back</h2>
            <p className="mt-1 text-sm text-muted">Sign in to the studio dashboard.</p>
          </div>
          <input type="hidden" name="next" value={searchParams.next ?? "/"} />
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Studio password</span>
            <input name="password" type="password" autoFocus required placeholder="••••••••" className="field mt-1.5 w-full py-2.5" />
          </label>
          {searchParams.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">That password didn’t match. Try again.</p>}
          <button className="btn-ombre w-full py-3 text-base">Enter the studio →</button>
          <p className="text-center text-xs text-muted">Aangan Studio · Pune</p>
        </form>
      </div>
    </main>
  );
}
