// Shared shapes. Column names stay snake_case so rows map 1:1 to Postgres.

export type CallStatus = "qualified" | "borderline" | "unqualified" | "escalated" | "incomplete";
export type ReengageRating = "warm" | "cold" | "closed";
export type Flag =
  | "vip"
  | "frustrated"
  | "unconfirmed_fields"
  | "existing_client"
  | "wants_human"
  | "transferred"
  | "represented"
  | "no_booking";

export interface CallRow {
  id: string;
  vaani_call_id: string | null;
  channel: string;
  started_at: string | null;
  duration_sec: number | null;
  after_hours: boolean | null;
  caller_name: string | null;
  phone: string | null;
  email: string | null;
  call_type: string | null;
  project_type: string | null;
  property: string | null;
  scope: string | null;
  scope_category: string | null;
  location_area: string | null;
  in_service_area: boolean | null;
  carpet_sqft: number | null;
  site_state: string | null;
  timeline_text: string | null;
  target_date: string | null;
  weeks_to_target: number | null;
  decision_maker: string | null;
  budget_volunteered: string | null;
  budget_inr: number | null;
  asked_price: boolean | null;
  source: string | null;
  language: string | null;
  score: number | null;
  gate_fail: string | null;
  status: CallStatus | null;
  decline_reason: string | null;
  reengage_rating: ReengageRating | null;
  reengage_date: string | null;
  reengaged_at: string | null;
  flags: string[];
  email_id: string | null;
  booking_start: string | null;
  booking_type: string | null;
  calcom_booking_uid: string | null;
  booking_status: string | null;
  summary: string | null;
  transcript: string | null;
  transcript_url: string | null;
  recording_url: string | null;
  notified_at: string | null;
  hubspot_contact_id: string | null;
  hubspot_deal_id: string | null;
  cost_inr: number | null;
  status_override: string | null;
  override_by: string | null;
  extraction: unknown;
  raw: unknown;
  created_at: string;
  updated_at: string;
}

export interface CallEvent {
  id: number | string;
  call_id: string;
  at: string;
  type: string;
  detail: unknown;
}

/** The status a human sees: the front-desk override wins over the rubric. */
export function effectiveStatus(row: Pick<CallRow, "status" | "status_override">): CallStatus | null {
  return (row.status_override as CallStatus) || row.status;
}
