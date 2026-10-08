import { appBaseUrl, env, mockLog } from "./env";
import { formatDate, formatIst } from "./time";
import { effectiveStatus, type CallRow } from "./types";

// Resend: POST https://api.resend.com/emails  { from, to, subject, html, text, reply_to }
// Free tier: 100/day. onboarding@resend.dev only delivers to the Resend account owner's email.

export interface SendResult {
  id: string | null;
  mock: boolean;
  to: string;
  subject: string;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const label = (v: string | null | undefined, map: Record<string, string>) => (v ? map[v] ?? v : "");
const SITE_STATE: Record<string, string> = { bare: "Bare shell", builder: "Builder finish", lived_in: "Lived-in", rented: "Rented", unknown: "Unknown" };
const DECISION: Record<string, string> = {
  self: "Caller decides",
  authorised: "Authorised by owner",
  represents: "Calling for the owners (they will attend)",
  research: "Research only",
  unknown: "Not confirmed",
};
const BOOKING_TYPE: Record<string, string> = { site_visit: "Site visit", studio: "Studio visit" };

export function subjectFor(c: CallRow): string {
  const st = effectiveStatus(c);
  const who = c.caller_name ?? c.phone ?? "Unknown caller";
  if (st === "escalated") return `🔴 URGENT: existing client: ${who}${c.phone ? `, call back ${c.phone}` : ""}`;
  const where = [c.property, c.location_area ? `in ${c.location_area}` : null].filter(Boolean).join(" ");
  if (!c.booking_start) return `⚠️ Qualified, no slot booked: call back today: ${who}${where ? `, ${where}` : ""}`;
  const icon = st === "borderline" ? "🟡 Borderline" : "🟢 Consultation booked";
  return `${icon}: ${who}${where ? `, ${where}` : ""}, ${formatIst(c.booking_start)}`;
}

function rows(c: CallRow): [string, string][] {
  const budget = c.budget_volunteered ?? (c.budget_inr ? `₹${c.budget_inr.toLocaleString("en-IN")}` : "Not discussed");
  return [
    ["Name", c.caller_name ?? ""],
    ["Phone", c.phone ?? ""],
    ["Email", c.email ?? ""],
    ["Score", c.score !== null ? `${c.score}/100 · ${effectiveStatus(c)}` : String(effectiveStatus(c) ?? "")],
    ["Flags", c.flags.join(", ") || "None"],
    ["Area", [c.location_area, c.in_service_area === false ? "(outside area)" : c.in_service_area === null ? "(area unclear)" : ""].filter(Boolean).join(" ")],
    ["Property", [c.property, c.carpet_sqft ? `${c.carpet_sqft} sq ft carpet` : null, label(c.site_state, SITE_STATE)].filter(Boolean).join(" · ")],
    ["Scope", c.scope ?? ""],
    ["Wants it done by", [c.timeline_text, c.target_date ? `(${formatDate(c.target_date)})` : null].filter(Boolean).join(" ")],
    ["Decision-maker", label(c.decision_maker, DECISION) || "Not confirmed"],
    ["Budget", `${budget}${c.asked_price ? " · asked about price" : ""}`],
    ["Booking", c.booking_start ? `${formatIst(c.booking_start)} · ${label(c.booking_type, BOOKING_TYPE) || "type not set"}` : "Not booked"],
    ["Source", c.source ?? ""],
  ];
}

export function renderDesignerEmail(c: CallRow): { subject: string; html: string; text: string } {
  const link = `${appBaseUrl()}/calls/${c.id}`;
  const st = effectiveStatus(c);
  const accent = st === "escalated" ? "#b42318" : st === "borderline" ? "#b54708" : !c.booking_start ? "#b54708" : "#a95a2f";
  const subject = subjectFor(c);
  const summaryLines = (c.summary ?? "").split("\n").filter(Boolean);

  const urgent =
    st === "escalated"
      ? `<div style="background:#fef3f2;border:1px solid #fecdca;border-radius:8px;padding:12px 14px;margin-bottom:16px;color:#7a271a">
          <strong>Existing client complaint.</strong> Promised a senior callback within 15 minutes.<br/>
          Call back: <a href="tel:${esc(c.phone)}" style="color:#b42318;font-weight:600">${esc(c.phone ?? "number not captured")}</a></div>`
      : !c.booking_start
        ? `<div style="background:#fffaeb;border:1px solid #fedf89;border-radius:8px;padding:12px 14px;margin-bottom:16px;color:#7a2e0e">
            <strong>No slot was booked on the call.</strong> Call them back today${c.phone ? `: <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ""}.</div>`
        : "";

  const table = rows(c)
    .filter(([, v]) => v)
    .map(([k, v]) => {
      const val = k === "Phone" && c.phone ? `<a href="tel:${esc(c.phone)}" style="color:${accent}">${esc(v)}</a>` : k === "Email" && c.email ? `<a href="mailto:${esc(c.email)}" style="color:${accent}">${esc(v)}</a>` : esc(v);
      return `<tr><td style="padding:7px 12px 7px 0;color:#6b625c;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:7px 0;font-size:14px;color:#1f1a17">${val}</td></tr>`;
    })
    .join("");

  const button = (href: string, text: string, primary: boolean) =>
    `<a href="${esc(href)}" style="display:inline-block;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;margin:0 8px 8px 0;${primary ? `background:${accent};color:#fff` : `border:1px solid #ebe4de;color:#1f1a17`}">${esc(text)}</a>`;

  const html = `<!doctype html><html><body style="margin:0;background:#faf8f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b625c;margin-bottom:6px">Aangan Studio · Call prep card</div>
  <div style="background:#fff;border:1px solid #ebe4de;border-top:4px solid ${accent};border-radius:12px;padding:20px">
    ${urgent}
    <table style="border-collapse:collapse;width:100%">${table}</table>
    ${summaryLines.length ? `<div style="margin-top:16px;padding-top:14px;border-top:1px solid #ebe4de"><div style="font-size:12px;color:#6b625c;margin-bottom:6px">SUMMARY</div><ul style="margin:0;padding-left:18px;color:#1f1a17;font-size:14px;line-height:1.5">${summaryLines.map((l) => `<li>${esc(l.replace(/^[-•]\s*/, ""))}</li>`).join("")}</ul></div>` : ""}
    <div style="margin-top:18px">${button(link, "Open in dashboard", true)}${c.recording_url ? button(c.recording_url, "Listen to recording", false) : ""}</div>
  </div>
  <div style="font-size:12px;color:#6b625c;margin-top:12px">Sent automatically after the call. Reply to this email to reach the caller${c.email ? "" : " (no email captured)"}.</div>
</div></body></html>`;

  const text = [
    subject,
    "",
    st === "escalated" ? `EXISTING CLIENT COMPLAINT. Call back: ${c.phone ?? "number not captured"}\n` : !c.booking_start ? `NO SLOT BOOKED: call back today ${c.phone ?? ""}\n` : "",
    ...rows(c).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    "",
    "Summary:",
    ...summaryLines.map((l) => `- ${l.replace(/^[-•]\s*/, "")}`),
    "",
    `Open in dashboard: ${link}`,
    c.recording_url ? `Recording: ${c.recording_url}` : "",
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  return { subject, html, text };
}

export function renderCallerConfirmation(c: CallRow): { subject: string; html: string; text: string } {
  const when = formatIst(c.booking_start);
  const where = c.booking_type === "site_visit" ? "at your site" : "at our studio";
  const text = `Hi ${c.caller_name ?? "there"},

Thank you for calling Aangan Studio. Your free 60-minute design consultation is booked for ${when}, ${where}. You'll also get a calendar invite.

To make the most of it, please keep handy:
- the floor plan (or rough room sizes)
- a few photos of the space as it is today
- any reference images you like (Instagram/Pinterest saves are perfect)
- everyone who will make the decision, if they can join

See you soon,
Aangan Studio`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f1a17;max-width:520px">${esc(text).replace(/\n/g, "<br/>")}</div>`;
  return { subject: `Your Aangan Studio consultation: ${when}`, html, text };
}

async function post(payload: Record<string, unknown>): Promise<string> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  return (JSON.parse(body) as { id: string }).id;
}

/** Send with one retry. Throws if both attempts fail. */
export async function sendEmail(msg: { to: string; subject: string; html: string; text: string; replyTo?: string | null }): Promise<SendResult> {
  if (!env("RESEND_API_KEY") || !msg.to) {
    mockLog("resend", `email (dry run${msg.to ? "" : ", no recipient set"})`, { to: msg.to, subject: msg.subject, text: msg.text });
    return { id: null, mock: true, to: msg.to, subject: msg.subject };
  }
  const payload: Record<string, unknown> = {
    from: env("EMAIL_FROM", "Aangan Studio <onboarding@resend.dev>"),
    to: [msg.to],
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  };
  if (msg.replyTo) payload.reply_to = msg.replyTo;
  try {
    return { id: await post(payload), mock: false, to: msg.to, subject: msg.subject };
  } catch (first) {
    console.warn("Resend failed once, retrying", first);
    await new Promise((r) => setTimeout(r, 1500));
    return { id: await post(payload), mock: false, to: msg.to, subject: msg.subject };
  }
}

export function designerRecipient(c: CallRow): string {
  return effectiveStatus(c) === "escalated" ? env("ESCALATION_EMAIL", env("DESIGNER_EMAIL")) : env("DESIGNER_EMAIL");
}
