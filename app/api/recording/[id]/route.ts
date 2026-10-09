import { db } from "@/lib/db";
import { fetchRecording } from "@/lib/vaani";

export const dynamic = "force-dynamic";

// Plays a call's recording in the dashboard. Vaani's stream URL needs the API key, which must
// never reach the browser, so the server fetches it and streams it back. Behind the dashboard login.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const c = await db().getCall(params.id);
  if (!c?.recording_url) return new Response("No recording", { status: 404 });
  const upstream = await fetchRecording(c.recording_url);
  if (!upstream.ok || !upstream.body) return new Response(`Recording unavailable (${upstream.status})`, { status: 502 });
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
    "Cache-Control": "private, max-age=3600",
  });
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  return new Response(upstream.body, { status: 200, headers });
}
