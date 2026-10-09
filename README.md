# Aangan Studio Voice Agent

Every inbound call to Aangan Studio is answered by a Vaani voice agent, qualified against Nikhil's rubric, and,
if it fits, **booked into a 60-minute consultation during the call**. The designer then gets a call-prep email and
a dashboard page, so they never re-ask the basics. Nikhil sees the funnel in HubSpot.

## Architecture

```
Caller → Vaani agent (prompts/vaani_agent.md + knowledge_base.md, dashboard settings)
           ├── Book Appointment action → Cal.com event (60 min) → invite + reminders
           ├── Transfer call (optional, office hours)
           └── call_postprocessing → POST /api/vaani/webhook?secret=…
                 1. check ?secret= (Vaani does not sign) · store raw payload · reply 200 at once
                 2. lib/extract.ts   Gemini JSON mode → zod → cross-check vs transcript → confidence flags
                 3. lib/rubric.ts    deterministic gates + score + status   (config/rubric.json)
                 4. booking          from payload, else Cal.com v2 lookup (attendee, ±10 min)
                 5. upsert `calls`   (idempotent on vaani_call_id)
                 6. qualified/borderline → Resend email to designer + HubSpot contact & deal
                    escalated            → 🔴 Resend email to ESCALATION_EMAIL
                    unqualified          → re-engage rating, dashboard only
                 7. cost_inr = minutes × VAANI_RATE_INR
Cal.com webhook → POST /api/calcom/webhook → booking created / rescheduled / cancelled
Dashboard (/, /calls/[id]) → password-protected Next.js pages
```

| Module | Job |
|---|---|
| `lib/pipeline.ts` | channel-agnostic flow: `receiveCall` → `processCall` → `runOutputs` |
| `lib/extract.ts` | Gemini extraction, verification, heuristic fallback for mock mode |
| `lib/rubric.ts` | **the only place a lead is qualified** (pure TS, unit-tested) |
| `lib/vaani.ts` · `lib/calcom.ts` · `lib/email.ts` · `lib/hubspot.ts` | one integration each, each with a dry-run mode |
| `lib/db.ts` | Postgres (Neon) or a local JSON file when `DATABASE_URL` is empty |

## Setup

See **[SETUP.md](SETUP.md)** for every account, key and click.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FAnusha-Karwa%2FAangan-Voice-Agent&project-name=aangan-calls&repository-name=aangan-calls&env=DATABASE_URL%2CGEMINI_API_KEY%2CRESEND_API_KEY%2CDESIGNER_EMAIL%2CCALCOM_API_KEY%2CHUBSPOT_TOKEN%2CDASHBOARD_PASSWORD&envDescription=Neon+Postgres+URL%2C+Gemini+key%2C+Resend+key%2C+the+email+you+log+into+Resend+with%2C+Cal.com+key%2C+HubSpot+private-app+token%2C+and+a+dashboard+password.&envLink=https%3A%2F%2Fgithub.com%2FAnusha-Karwa%2FAangan-Voice-Agent%2Fblob%2Fmain%2FSETUP.md)

The button asks for the 7 secrets only. Non-secret settings (Cal.com event ID, HubSpot stage IDs, email sender) live in [config/defaults.json](config/defaults.json), and any env var with the same name overrides them. `APP_BASE_URL` defaults to the Vercel production URL. Add `VAANI_WEBHOOK_SECRET` after creating the Vaani webhook.

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run migrate
```

```bash
npm run dev
```

With no keys at all, everything runs in mock mode: the dashboard works off `.data/store.json`, extraction uses a
keyword heuristic, and emails / HubSpot / Cal.com calls are logged instead of sent. `GET /api/health` lists the
live and mock integrations.

Simulate calls against a running server (signs requests if `VAANI_WEBHOOK_SECRET` is set):

```bash
npx tsx scripts/simulate-call.ts --all-phone
```

## Tests and evals

| Command | What it does | Needs |
|---|---|---|
| `npm test` | Rubric unit tests (incl. all 20 phone calls on hand-labelled extractions) + "no prices in agent prompts" guard | nothing |
| `npm run eval -- --fixtures` | 4a on the golden extractions (tests the rubric alone) | nothing |
| `npm run eval` | 4a: all 40 transcripts → Gemini → rubric; match rate, false negatives and false positives | `GEMINI_API_KEY` |
| `npm run roleplay` | 4b: Gemini plays 11 callers against the agent prompt; checks for any price spoken, one question per turn, the right ending, email and booking read-back; pipes each transcript through 4a | `GEMINI_API_KEY` |
| [TEST_SCRIPT.md](TEST_SCRIPT.md) | 4c live WebRTC calls with a tick-off checklist | everything |

Results land in [eval-results.md](eval-results.md); role-play transcripts in `scripts/out/roleplay/`.

## Tuning the rubric

Everything numeric lives in [`config/rubric.json`](config/rubric.json). It is internal only and never reaches the agent.

- `status.qualified_min` / `borderline_min`: score bands (70 / 40).
- `points.*`: points per criterion, including `unknown` for unstated timeline or decision-maker.
- `scope.*`: excluded scope categories and commercial types, and the commercial sq ft range.
- `timeline.min_weeks` (gate) / `full_weeks` (full points).
- `budget.clearly_below_inr`: "clearly below scope" thresholds; `clearly_below_is_disqualifying` makes it a gate.
- `location.aliases` / `unclear_areas` / `outside`: fuzzy area matching.

After any change, run `npm test` and `npm run eval` and compare the false negatives. A missed good lead costs more than a
wasted consultation.

## Adding WhatsApp or the web form

The pipeline is channel-agnostic. A new channel only needs a route that turns its payload into a `CallInput`:

```ts
// app/api/whatsapp/webhook/route.ts  (sketch)
const input: CallInput = {
  sourceId: `wa-${thread.id}`, channel: "whatsapp", startedAt: firstMessageAt, durationSec: null,
  transcript: messages.map((m) => `${m.fromCustomer ? "Caller" : "Agent"}: ${m.text}`).join("\n"),
  phone: thread.waId, raw: payload,
};
const { row, duplicate } = await receiveCall(input);
if (!duplicate) waitUntil(processCall(row.id, input));
```

A web form submission does the same: render the form fields as `Field: value` lines as the "transcript". Extraction,
the rubric, email, HubSpot and the dashboard then work unchanged. The `channel` column tells them apart. The eval
already runs on the 10 WhatsApp and 10 web-form transcripts. For bookings in those channels, send a Cal.com
booking link in the reply. The webhook's ±10-minute lookup would then need a wider window.
