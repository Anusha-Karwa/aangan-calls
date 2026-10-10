import { NextResponse } from "next/server";
import { refreshAgentSlots } from "@/lib/slots";
import { verifyVaaniRequest } from "@/lib/vaani";

export const dynamic = "force-dynamic";

// Called by the customer site just before each website call (and usable as a manual refresh):
// pulls free consultation times from Cal.com and writes them into the voice agent's instructions.
// Returns the slots text so the caller can also include it in a per-call prompt override.
export async function POST(req: Request) {
  const auth = verifyVaaniRequest("", req.headers, new URL(req.url));
  if (!auth.ok) return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  try {
    const r = await refreshAgentSlots(new URL(req.url).searchParams.get("force") === "1");
    return NextResponse.json({ ok: true, pushed: r.pushed, slots: r.text });
  } catch (e) {
    console.error("slots refresh failed", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
