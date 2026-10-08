// Live check of the Cal.com read path used by the webhook.
import "./lib";
import { findBookingForCall } from "../lib/calcom";
async function main() {
  const r = await findBookingForCall({ email: "nobody@example.com", phone: null, callStart: new Date(), durationSec: 300 });
  console.log("bookings lookup OK, match:", r);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
