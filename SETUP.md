# SETUP: everything you need to do by hand

The app already runs end to end **without any keys**. Every integration whose key is missing runs in
**mock / dry-run mode** and logs what it would have sent. `GET /api/health` shows which ones are live.

Work top to bottom. Paste every value into `.env.local` (copy `.env.example`), and later into Vercel.
Total time: about 45–60 minutes.

---

## 1. Accounts and keys

| # | Service | Sign up at | What to copy | Env var(s) |
|---|---|---|---|---|
| 1 | **Neon** (Postgres) | https://neon.tech → New project (region: *AWS Asia Pacific (Singapore)*, closest to Pune) | Dashboard → *Connect* → connection string (`postgresql://…?sslmode=require`) | `DATABASE_URL` |
| 2 | **Google Gemini** | https://aistudio.google.com/apikey → *Create API key* | the key | `GEMINI_API_KEY` |
| 3 | **Cal.com** | https://cal.com/signup | Settings → Developer → **API keys** → *New* (no expiry) | `CALCOM_API_KEY` |
| 3b | | Create the event (step 2 below) and copy its numeric ID from the URL `…/event-types/<ID>` | | `CALCOM_EVENT_TYPE_ID` |
| 4 | **Resend** | https://resend.com/signup (**sign up with the email that should receive the designer emails**) | API Keys → *Create* (permission: Sending access) | `RESEND_API_KEY` |
| 4b | | Your own email (the Resend login email, see note) | | `DESIGNER_EMAIL`, `ESCALATION_EMAIL` |
| 5 | **HubSpot** | https://app.hubspot.com/signup-hubspot/crm (free CRM) | Settings ⚙ → Integrations → **Private Apps** (or *Development → Legacy apps* in newer accounts) → *Create* → Scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`, `crm.objects.deals.write` → copy the token (`pat-…`) | `HUBSPOT_TOKEN` |
| 6 | **Vaani Labs** | https://www.vaanilabs.in (dashboard) | Webhooks → *Add webhook* → copy the secret `vv_whk_…` (shown **once**) | `VAANI_WEBHOOK_SECRET` |
| 6b | | API key (`vv_live_…`) and agent / flow id: optional, only for reference | | `VAANI_API_KEY`, `VAANI_AGENT_ID` |
| 7 | **Vercel** | https://vercel.com/signup (sign in with GitHub) | (see §4 Deploy) | n/a |
| 8 | **GitHub** | create an empty repo, e.g. `aangan-voice-agent` | send me the URL and I'll push | n/a |
| — | Dashboard | choose any password | | `DASHBOARD_PASSWORD` |
| — | App URL | your Vercel URL, e.g. `https://aangan-voice-agent.vercel.app` | | `APP_BASE_URL` |
| — | Front desk (optional) | a phone number for call transfer | | `FRONT_DESK_NUMBER` |

### ⚠️ Resend sending note
`onboarding@resend.dev` only delivers to **the Resend account owner's own email**. Any other recipient gets a 403.
So for this build: sign up to Resend with the email you want the designer emails to land in, and set
`DESIGNER_EMAIL` and `ESCALATION_EMAIL` to that same address. To email Nikhil or real callers, verify a domain
in Resend (Domains → Add → add the DNS records), then set `EMAIL_FROM="Aangan Studio <calls@yourdomain>"`.
`SEND_CALLER_CONFIRMATION=true` only makes sense after that.

After pasting the keys into `.env.local`:

```bash
npm run migrate
```

```bash
npm run eval
```

```bash
npm run roleplay
```

---

## 2. Cal.com event

> ✅ **Done via the API (Oct 8):** event **"Aangan Studio — Design Consultation"**, ID **7399507**, 60 min, slug `aangan-design-consultation`, locations *attendee address (site visit)* + *studio address*, name/email/phone required, 12 h minimum notice, 30 min buffer after. Still check in the Cal.com UI: (a) replace the placeholder studio address with the real one, keeping "Aangan Studio" at the start, which is how the app recognises a studio visit; (b) your availability (default schedule, Asia/Kolkata). The steps below are for reference.

1. Event Types → **New** → title **"Aangan Studio — Design Consultation"**, duration **60 min**.
2. **Location**: add two options so the caller can choose:
   - *In person (attendee address)*: label it **Site visit**
   - *In person (organizer address)*: the studio address, label it **Studio visit**
3. **Booking questions**: make **Name**, **Email** and **Phone number** required (add *Phone* if it's not there; Attendee phone number → Required).
4. **Availability**: your real working hours (e.g. Mon–Sat 10:00–19:00), timezone **Asia/Kolkata**.
5. Limits (recommended): minimum notice 12 hours, buffer 30 min.
6. Copy the event ID from the URL into `CALCOM_EVENT_TYPE_ID`.
7. Optional (reschedule/cancel sync): Settings → Developer → **Webhooks** → New →
   URL `{APP_BASE_URL}/api/calcom/webhook`, triggers *Booking created, rescheduled, cancelled*, set a secret → `CALCOM_WEBHOOK_SECRET`.

---

## 3. Vaani dashboard checklist (your part)

> Vaani's **public API has no endpoint for editing an agent's prompt** (checked the OpenAPI spec, Oct 2026),
> so the prompt is pasted by hand. The Book Appointment / Transfer / Start-test features aren't in the public
> API docs either, so menu names below may differ slightly: look for the closest match.

**V1. Persona**
- Agent name: **Aangan Studio Assistant**. Identity: "phone assistant for Aangan Studio, an interior design studio in Pune".
- Greeting / first message: `Hi, this is Aangan Studio's assistant. This call is recorded so our designer has your details. May I know your name?`
- Speaking speed: normal (1.0). Slightly slower (0.9) if test callers find it fast.
- Languages: **English + Hindi**. (Marathi: test later, see §5.)
- Voice: a warm Indian-English female or male voice. STT and LLM: leave on defaults.

**V2. System prompt**
- Paste the whole of [`prompts/vaani_agent.md`](prompts/vaani_agent.md) into the agent's prompt / instructions field.

**V3. Knowledge base**
- Upload or paste [`prompts/knowledge_base.md`](prompts/knowledge_base.md).
- ❌ **Never upload `knowledge/pricing.md`.** The agent must not know any number.

**V4. Actions → Integration tools → Book Appointment**
- Enable it and choose **Cal.com**. Paste `CALCOM_API_KEY` and `CALCOM_EVENT_TYPE_ID`.
- Invite duration: **60 min**. Timezone: Asia/Kolkata.
- Required attendee fields: **name, email, phone**.
- If it offers to pass location / notes, map *site visit / studio visit* to the location field.

**V5. Actions → Transfer call (optional)**
- Number: `FRONT_DESK_NUMBER`. Condition: caller asks for a human or has a complaint, **10am–7pm only**.
- Outside hours there is no transfer: the webhook sends the 🔴 escalation email instead.
- WebRTC test calls can't really transfer, so skip this until you have a phone number.

**V6. Webhook / post-call data**
- Webhooks → Add: name `aangan-dashboard`, URL **`{APP_BASE_URL}/api/vaani/webhook`**, events **`call.completed`** and **`call.failed`**.
- Copy the `vv_whk_…` secret into `VAANI_WEBHOOK_SECRET` (in Vercel too) and redeploy.
- Press **Test** (sends `webhook.ping`): the app answers `{"ok":true,"pong":true}`.
- If the screen only has a "custom webhook" with a static header instead of signing, add header
  `x-webhook-secret: <VAANI_WEBHOOK_SECRET>` (or append `?secret=<VAANI_WEBHOOK_SECRET>` to the URL). Both are accepted.
- Make sure *include transcript* and *include recording URL* are on, if those toggles exist.

**V7. Test**
- **Start test** (WebRTC), then follow [`TEST_SCRIPT.md`](TEST_SCRIPT.md).
- After the **first** test call: open the call in the dashboard and expand *Activity*, or send me the row's `raw` JSON.
  The `call.completed` payload fields are undocumented, so I'll tighten the parser (`lib/vaani.ts`) to the real field names.

---

## 4. Deploy (Vercel)

Option A (recommended): give me the GitHub repo URL. I push; you then go to Vercel → *Add New Project* → import the repo → framework Next.js → paste all env vars → Deploy.

Option B (CLI, from this folder):

```bash
npx vercel login
```

```bash
npx vercel --prod
```

Then Vercel → Project → Settings → Environment Variables → add everything from `.env.local`
(set `APP_BASE_URL` to the production URL), and redeploy. Run `npm run migrate` once locally against the Neon URL.

Without `DATABASE_URL` the app falls back to a local JSON file, which **does not persist on Vercel**. Set Neon before deploying.

---

## 5. Decisions I made (change any of them)

| Decision | Why | Where to change |
|---|---|---|
| **Timelines are measured from the call's date**, not from today | The September transcripts say "by March", which only makes sense relative to the call | `lib/rubric.ts` |
| **A volunteered budget that is clearly too low fails the lead** (gate `budget`, rating `cold`) | Nikhil's rubric: "If they volunteer a number that clearly fails, note it and do not forward". T10 must be unqualified. | `config/rubric.json` → `budget.clearly_below_is_disqualifying` |
| "Tight" budget = below 1.5 × the "clearly below" threshold | Not specified; gives 8 points instead of 15 | `budget.tight_multiplier` |
| Office "clearly below" = ₹600/sq ft | Not specified for offices | `budget.clearly_below_inr.office_per_sqft` |
| Commercial size upper limit 3,300 sq ft | "~3,000" means some tolerance | `scope.commercial_max_sqft` |
| Unknown timeline (never stated) = 12 points + `unconfirmed_fields` flag | The agent always asks, so a missing answer is worth checking | `points.timeline.unknown` |
| Unknown decision-maker = full 15 + `unconfirmed_fields` | Brief: don't drop a lead below qualified for it | `points.decision_maker.unknown` |
| "Calling for owners who will attend" gets a `represented` flag (T14's "decision-maker flag") | Makes T14 visible in the dashboard | `lib/rubric.ts` |
| Extra flag `no_booking` for qualified/borderline calls without a slot | Drives the ⚠️ "call back today" email | `lib/pipeline.ts` |
| Cafés, bars, salons and showrooms are also excluded commercial types | Same reasoning as retail/hospitality | `scope.excluded_commercial_types` |
| Webhook replies 200 at once and processes in the background (`waitUntil`) | Vaani times out after 10 s and disables a webhook after 5 failures | `app/api/vaani/webhook/route.ts` |
| Gemini model `gemini-3.8-flash` | Current stable Flash per Google's docs (Oct 2026) | `GEMINI_MODEL` env |
| `VAANI_RATE_INR=7` kept as the brief says | Vaani's API docs list voicebot at 4 paise/sec (≈₹2.40/min); set your real rate | `VAANI_RATE_INR` env |
| HubSpot deal stages: `appointmentscheduled` (booked) / `qualifiedtobuy` (no slot) | HubSpot's default Sales Pipeline | `HUBSPOT_STAGE_*` env |
| Dashboard auth = one shared password (cookie, 30 days) | Simple and enough for a studio front desk | `middleware.ts` |

### Areas mapped to "unclear" (12 points, not a fail). Nikhil to confirm
Wagholi, Lohegaon, Dhanori, Vishrantwadi, Yerawada, Katraj, Bibwewadi, Ambegaon, Narhe, Manjri, Moshi, Chakan,
Dighi, Bhosari, Keshav Nagar, Mundhwa, and a bare "Pune". Move any of them into `location.aliases` (pointing to
the nearest service area) or `location.outside` in `config/rubric.json`.

Aliases I added as "in area": Cybercity/Amanora → Magarpatta/Hadapsar, Sunderban/Bopodi → Aundh,
Dahanukar Colony/Karve Nagar/Mayur Colony → Kothrud, Balewadi → Baner, Tathawade → Wakad, Punawale → Ravet,
Nigdi/Akurdi → Chinchwad, Pimple Gurav → Pimple Saudagar, Wanowrie/Salunke Vihar → NIBM,
Mohammed Wadi/Pisoli → Undri, Sinhgad Road/Dhayari → Nanded City, Shivajinagar/Model Colony/Camp/SB Road → Deccan,
Prabhat Road/Law College Road → Erandwane, Boat Club Road → Koregaon Park.

### Marathi
Test 3–4 WebRTC calls in Marathi. If STT quality is poor, keep English + Hindi and let the agent say
"I'll continue in Hindi/English if that's okay". The extraction prompt handles any language.
