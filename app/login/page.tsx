import { env } from "@/lib/env";
import { Logo, VideoBackdrop } from "@/components/ui";
import { login } from "../actions";

export const dynamic = "force-dynamic";

export default function Login({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <VideoBackdrop src={env("LOGIN_VIDEO_URL")} />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex"><Logo /></div>
          <h1 className="mt-6 font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Every call,
            <br />
            <span className="text-ombre">ready to design.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm text-white/70">
            Qualified, booked and summarised before you pick up the phone.
          </p>
        </div>

        <form action={login} className="glass ombre-border space-y-4 bg-plum-950/40 p-6">
          <input type="hidden" name="next" value={searchParams.next ?? "/"} />
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Studio password</span>
            <input name="password" type="password" autoFocus required placeholder="••••••••" className="field mt-2 w-full py-2.5" />
          </label>
          {searchParams.error && <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200 ring-1 ring-rose-400/30">That password didn’t match. Try again.</p>}
          <button className="btn-ombre w-full py-2.5 text-base">Enter the studio →</button>
        </form>

        <p className="mt-6 text-center text-xs text-white/40">Aangan Studio · Pune</p>
      </div>
    </main>
  );
}
