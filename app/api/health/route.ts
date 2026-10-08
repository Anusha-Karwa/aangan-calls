import { NextResponse } from "next/server";
import { integrationStatus } from "@/lib/env";

export const dynamic = "force-dynamic";

// Reports which integrations are live vs mock (never the values).
export function GET() {
  return NextResponse.json({ ok: true, integrations: integrationStatus() });
}
