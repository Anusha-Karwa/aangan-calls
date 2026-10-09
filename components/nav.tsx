import Link from "next/link";
import { logout } from "@/app/actions";
import { Connections, Logo } from "./ui";
import type { Connection } from "@/lib/status";

export function TopNav({ connections }: { connections: Connection[] }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-plum-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/"><Logo /></Link>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden md:block"><Connections items={connections} /></div>
          {process.env.DASHBOARD_PASSWORD && (
            <form action={logout}>
              <button className="btn-ghost px-3 py-1.5 text-xs">Sign out</button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
