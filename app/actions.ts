"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AUTH_COOKIE, authToken } from "@/lib/auth";
import { db, logEvent } from "@/lib/db";
import { notifyDesigner, pushHubspot } from "@/lib/pipeline";
import type { CallStatus } from "@/lib/types";

const STATUSES: CallStatus[] = ["qualified", "borderline", "unqualified", "escalated", "incomplete"];

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  if (!process.env.DASHBOARD_PASSWORD || password !== process.env.DASHBOARD_PASSWORD) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  cookies().set(AUTH_COOKIE, await authToken(password), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/" });
  redirect(next.startsWith("/") ? next : "/");
}

export async function logout() {
  cookies().delete(AUTH_COOKIE);
  redirect("/login");
}

export async function overrideStatus(formData: FormData) {
  const id = String(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  const by = String(formData.get("by") ?? "").trim() || "front desk";
  const row = await db().getCall(id);
  if (!row) return;
  const value = STATUSES.includes(status as CallStatus) && status !== row.status ? status : null;
  await db().updateCall(id, { status_override: value, override_by: value ? by : null });
  await logEvent(id, "status_override", { from: row.status_override ?? row.status, to: value ?? row.status, by });
  revalidatePath(`/calls/${id}`);
  revalidatePath("/");
}

export async function resendEmail(formData: FormData) {
  const id = String(formData.get("id"));
  const row = await db().getCall(id);
  if (!row) return;
  await logEvent(id, "manual_resend_email", {});
  await notifyDesigner(row);
  revalidatePath(`/calls/${id}`);
}

export async function resendHubspot(formData: FormData) {
  const id = String(formData.get("id"));
  const row = await db().getCall(id);
  if (!row) return;
  await logEvent(id, "manual_resend_hubspot", {});
  await pushHubspot(row);
  revalidatePath(`/calls/${id}`);
}

export async function markContacted(formData: FormData) {
  const id = String(formData.get("id"));
  await db().updateCall(id, { reengaged_at: new Date().toISOString() });
  await logEvent(id, "reengage_contacted", {});
  revalidatePath("/");
}
