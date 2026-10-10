import { useId } from "react";

// Aangan Studio logo: a lotus (calm, beauty, new beginnings) inside a fine ombré ring,
// beside the italic serif "Aangan" and "Interiors · Pune".
export function AanganMark({ size = 38, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} role="img" aria-label="Aangan Studio">
      <defs>
        <linearGradient id={`d${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="0.55" stopColor="#d946ef" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
        <linearGradient id={`v${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill="none" stroke={`url(#d${id})`} strokeWidth="0.9" />
      {/* centre petal */}
      <path d="M20 27C17.3 24.5 17.3 17.5 20 12.5C22.7 17.5 22.7 24.5 20 27Z" fill={`url(#v${id})`} />
      {/* side petals */}
      <path
        d="M19.2 27.2C14.5 27.6 11.2 24.6 10.5 20.5C15 20.2 18 23 19.2 27.2ZM20.8 27.2C25.5 27.6 28.8 24.6 29.5 20.5C25 20.2 22 23 20.8 27.2Z"
        fill={`url(#d${id})`}
        fillOpacity="0.6"
      />
      {/* water line */}
      <path d="M12 29.5H28" stroke="#24182f" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function AanganLogo({ size = 38, tagline = "Interiors · Pune", tone = "dark" }: { size?: number; tagline?: string | null; tone?: "dark" | "light" }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <AanganMark size={size} className="shrink-0" />
      <span className="leading-none">
        <span className={`block font-display text-[24px] font-normal italic tracking-tight ${tone === "light" ? "text-white" : "text-ink"}`}>Aangan</span>
        {tagline && <span className={`mt-1 block text-[8.5px] font-semibold uppercase tracking-[0.32em] ${tone === "light" ? "text-white/75" : "text-muted"}`}>{tagline}</span>}
      </span>
    </span>
  );
}
