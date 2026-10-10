// Settings for the customer site. Secrets come from Vercel env vars; the rest has defaults here.

const DEFAULTS: Record<string, string> = {
  // Free Mixkit interior clips (commercial use, no attribution). Comma-separated; swap for studio footage any time.
  TALK_VIDEO_URLS: [
    "https://assets.mixkit.co/videos/4196/4196-720.mp4",
    "https://assets.mixkit.co/videos/4029/4029-720.mp4",
    "https://assets.mixkit.co/videos/4488/4488-720.mp4",
  ].join(","),
};

export function env(name: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : DEFAULTS[name] ?? "";
}

export const VAANI_API = "https://api.vaanivoice.ai";
