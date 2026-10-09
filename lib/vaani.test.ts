import { describe, expect, it } from "vitest";
import { isVaaniHost, normaliseTranscript, normaliseVaaniPayload, verifyVaaniRequest } from "./vaani";

// Sample payload from https://docs.vaanivoice.ai/guides/webhook-setup (call_postprocessing).
const DOCS_SAMPLE = {
  event: "call_postprocessing",
  call_id: "outbound-1784899978-36cec598",
  timestamp: "2026-07-24T13:34:22.278854+00:00",
  data: {
    room_name: "outbound-1784899978-36cec598",
    call_id: "outbound-1784899978-36cec598",
    call_duration: 55150.022999999994,
    end_reason: "Call ended",
    summary: "The user called to have their name recorded.",
    entities: { name: "Ayush Awasthi" },
    dispositions: { acas: "Name Collected" },
    recording_url: "https://uat.vaaniresearch.com/api/stream/outbound-1784899978-36cec598",
    transcript: "[13:33:14] AGENT: Hi! how can I help you today?\n\n[13:33:19] USER: Yeah. How are you?\n\n[13:33:31] AGENT: I am doing great.",
  },
};

describe("normaliseVaaniPayload", () => {
  it("parses the documented call_postprocessing payload", () => {
    const c = normaliseVaaniPayload(DOCS_SAMPLE);
    expect(c.event).toBe("call_postprocessing");
    expect(c.callId).toBe("outbound-1784899978-36cec598");
    expect(c.durationSec).toBe(55); // milliseconds -> seconds
    expect(c.startedAt.toISOString()).toBe("2026-07-24T13:33:27.278Z"); // timestamp minus duration
    expect(c.transcript).toBe("Agent: Hi! how can I help you today?\nCaller: Yeah. How are you?\nAgent: I am doing great.");
    expect(c.recordingUrl).toContain("/api/stream/");
    expect(c.entities).toEqual({ name: "Ayush Awasthi" });
  });

  it("call_ended reports seconds", () => {
    expect(normaliseVaaniPayload({ event: "call_ended", room_name: "r1", call_duration: 42.5 }).durationSec).toBe(43);
  });

  it("lifecycle events use room_name as the call id", () => {
    const c = normaliseVaaniPayload({ event: "call_started", room_name: "room_1", phone_number: "+919876543210" });
    expect(c.callId).toBe("room_1");
    expect(c.callerPhone).toBe("+919876543210");
  });

  it("flags a successful human transfer", () => {
    expect(normaliseVaaniPayload({ event: "human_transfer_successful", room_name: "r" }).transferred).toBe(true);
  });
});

describe("helpers", () => {
  it("normalises speaker labels", () => expect(normaliseTranscript("USER: hi\nASSISTANT: hello")).toBe("Caller: hi\nAgent: hello"));
  it("only sends the API key to Vaani hosts", () => {
    expect(isVaaniHost("https://api.vaanivoice.ai/api/stream/x")).toBe(true);
    expect(isVaaniHost("https://uat.vaaniresearch.com/api/stream/x")).toBe(true);
    expect(isVaaniHost("https://evil.example.com/vaanivoice.ai")).toBe(false);
  });
  it("checks the ?secret= when one is configured", () => {
    process.env.VAANI_WEBHOOK_SECRET = "s3cret";
    const h = new Headers();
    expect(verifyVaaniRequest("", h, new URL("https://x/api/vaani/webhook?secret=s3cret")).ok).toBe(true);
    expect(verifyVaaniRequest("", h, new URL("https://x/api/vaani/webhook?secret=nope")).ok).toBe(false);
    expect(verifyVaaniRequest("", h, new URL("https://x/api/vaani/webhook")).ok).toBe(false);
    delete process.env.VAANI_WEBHOOK_SECRET;
  });
});
