# 4c. Live WebRTC test calls (Vaani "Start test")

Before you start: everything in SETUP.md §1–3 is done, the app is deployed, and `GET {APP_BASE_URL}/api/health`
shows `live` for vaaniWebhook, gemini, calcom, resend, hubspot and db.

Use a **real inbox you can read** as the email in booked scenarios. Cal.com sends the invite there.
Speak naturally and give details only when asked.

## Scenarios

| # | Scenario | What you say (gist) | Expected ending | Expected dashboard status |
|---|---|---|---|---|
| 1 | Clean 3BHK in Kothrud | "Meera, 3BHK in Kothrud, ~1,250 sq ft, builder finish, whole home, done by April, I decide, saw you on Instagram" | **Booked** (site visit) | qualified ≥70 |
| 2 | Pushes hard for price | 2BHK Baner, 900 sq ft. Ask "per sq ft?", "ballpark?", "just a range?" three times | Deflection line (no number!), then **booked** | qualified, asked price ✓ |
| 3 | Nashik caller | Bungalow in Nashik, full interiors | **Declined** + "no vendor network there" | unqualified · location · closed |
| 4 | Advice only | "Just want colour and furniture ideas for my living room, I'll do it myself" | **Declined** | unqualified · scope |
| 5 | Diwali in 3 weeks | Living + kitchen in Wakad, must finish before Diwali (3 weeks) | **Declined**, offered to note for later | unqualified · timeline · warm (re-engage tab) |
| 6 | Angry existing client | "My project in Viman Nagar, designer Aryan hasn't replied in 5 days, I want Nikhil" | Apology + "someone senior will call you back within 15 minutes" | escalated · 🔴 email to ESCALATION_EMAIL |
| 7 | ₹1.5 lakh budget | 1BHK Kharadi, kitchen + one bedroom, "budget 1.5 lakh max" | Gently told it's significantly below, **no rate quoted** | unqualified · budget · cold |
| 8 | Son calling for parents | Parents' 3BHK in Hadapsar, they'll decide and attend | **Booked** | qualified · flag "Calling for owners" |
| 9 | Restaurant | 1,800 sq ft restaurant in Koregaon Park | **Declined** | unqualified · scope · closed |
| 10 | Rude, Hinglish | "Jaldi bolo yaar… 3BHK Pimple Saudagar, poora ghar, February tak" | Replies in Hinglish/Hindi, stays polite, **booked** | qualified |
| 11 | Vague grey-area | Unsure of rooms, "near Wagholi or Kharadi", size unknown, "next year", must check with husband | One question at a time, **booked** | borderline or qualified · "Check details" flag |

**Automatic fail on every call:** the agent says any price number, range, per-sq-ft rate or "starts at".

## After each call, tick off

| # | Booking in Cal.com (Upcoming) | Webhook row in dashboard (≤30 s) | Designer email arrived (+ Resend → Emails shows *delivered*) | HubSpot contact + deal | Recording plays in dashboard | Status as expected | No price spoken | Email spelled back + details read back |
|---|---|---|---|---|---|---|---|---|
| 1 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 2 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 3 | n/a | ☐ | n/a (no email) | n/a | ☐ | ☐ | ☐ | n/a |
| 4 | n/a | ☐ | n/a | n/a | ☐ | ☐ | ☐ | n/a |
| 5 | n/a | ☐ | n/a | n/a | ☐ | ☐ | ☐ | n/a |
| 6 | n/a | ☐ | ☐ 🔴 urgent | n/a | ☐ | ☐ | ☐ | n/a |
| 7 | n/a | ☐ | n/a | n/a | ☐ | ☐ | ☐ | n/a |
| 8 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 9 | n/a | ☐ | n/a | n/a | ☐ | ☐ | ☐ | n/a |
| 10 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 11 | ☐ | ☐ | ☐ 🟡 if borderline | ☐ | ☐ | ☐ | ☐ | ☐ |

## If something is missing

- **No row in the dashboard:** Vaani → Webhooks → delivery log. A 401 means a wrong secret. A 5xx means: check Vercel → Logs.
- **Row exists but status is "processing…":** check the Gemini key and Vercel logs. The Activity list on the call page shows `extract_failed` / `pipeline_error`.
- **Booked in Cal.com but the email says "no slot booked":** the booking wasn't in the payload and the Cal.com lookup didn't match. Usually the email or phone differs. Send me the call's `raw` JSON and the Cal.com booking.
- **Email not received:** Resend → Emails. A 403 means you're using `onboarding@resend.dev` to an address that isn't your Resend login (see SETUP.md).
- **No HubSpot deal:** the Activity list shows `hubspot_error` with HubSpot's message (usually a missing scope).
