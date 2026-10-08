import { login } from "../actions";

export default function Login({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="rounded-xl border border-line bg-white p-6">
        <div className="text-xs uppercase tracking-wider text-muted">Aangan Studio</div>
        <h1 className="mt-1 text-xl font-semibold">Calls dashboard</h1>
        <form action={login} className="mt-5 space-y-3">
          <input type="hidden" name="next" value={searchParams.next ?? "/"} />
          <input
            name="password"
            type="password"
            autoFocus
            required
            placeholder="Password"
            className="w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-brand-500"
          />
          {searchParams.error && <p className="text-sm text-red-700">Wrong password.</p>}
          <button className="w-full rounded-lg bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700">Sign in</button>
        </form>
      </div>
    </main>
  );
}
