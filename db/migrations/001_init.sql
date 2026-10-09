-- Aangan Studio voice agent: calls + audit log.
-- Run with `npm run migrate` (uses DATABASE_URL). Safe to re-run.

create extension if not exists pgcrypto;

create table if not exists calls (
  id                  uuid primary key default gen_random_uuid(),
  vaani_call_id       text unique,
  channel             text not null default 'phone',
  started_at          timestamptz,
  duration_sec        int,
  after_hours         bool,
  caller_name         text,
  phone               text,
  email               text,
  call_type           text check (call_type in ('new','existing_client','other')),
  project_type        text check (project_type in ('residential','commercial','other')),
  property            text,
  scope               text,
  scope_category      text,
  location_area       text,
  in_service_area     bool,
  carpet_sqft         int,
  site_state          text check (site_state in ('bare','builder','lived_in','rented','unknown')),
  timeline_text       text,
  target_date         date,
  weeks_to_target     numeric,
  decision_maker      text check (decision_maker in ('self','authorised','represents','research','unknown')),
  budget_volunteered  text,
  budget_inr          numeric,
  asked_price         bool,
  source              text,
  language            text,
  score               int,
  gate_fail           text,
  status              text check (status in ('qualified','borderline','unqualified','escalated','incomplete')),
  decline_reason      text,
  reengage_rating     text check (reengage_rating in ('warm','cold','closed')),
  reengage_date       date,
  reengaged_at        timestamptz,
  flags               text[] not null default '{}',
  email_id            text,
  booking_start       timestamptz,
  booking_type        text check (booking_type in ('site_visit','studio')),
  calcom_booking_uid  text,
  booking_status      text,
  summary             text,
  transcript          text,
  transcript_url      text,
  recording_url       text,
  notified_at         timestamptz,
  hubspot_contact_id  text,
  hubspot_deal_id     text,
  cost_inr            numeric,
  status_override     text,
  override_by         text,
  extraction          jsonb,
  raw                 jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists calls_started_at_idx on calls (started_at desc);
create index if not exists calls_status_idx on calls (status);
create index if not exists calls_booking_start_idx on calls (booking_start);
create index if not exists calls_calcom_uid_idx on calls (calcom_booking_uid);

create table if not exists call_events (
  id       bigserial primary key,
  call_id  uuid references calls(id) on delete cascade,
  at       timestamptz not null default now(),
  type     text not null,
  detail   jsonb
);

create index if not exists call_events_call_idx on call_events (call_id, at desc);
