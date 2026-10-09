import { NextResponse } from "next/server";
import { integrationStatus } from "@/lib/env";
import { connectionStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

// GET /api/health          -> which keys are configured (never the values)
// GET /api/health?deep=1   -> real read-only calls to Neon, Cal.com, HubSpot, Resend, Gemini (cached 60 s)
export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const body: Record<string, unknown> = { ok: true, integrations: integrationStatus() };
  if (deep) body.connections = (await connectionStatus()).map(({ key, state, detail }) => ({ key, state, detail: state === "error" ? detail : undefined }));
  return NextResponse.json(body);
}
