import { Resend } from "resend";
import { config } from "../config.js";
import { wrapApplicantEmailHtml } from "./emailBrand.js";

function client(): Resend {
  if (!config.resendApiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }
  return new Resend(config.resendApiKey);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInterview(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export async function sendShortlistedEmail(opts: {
  to: string;
  name: string;
  interviewAtIso: string;
}): Promise<void> {
  const r = client();
  const when = formatInterview(opts.interviewAtIso);
  const body = `
      <p style="margin:0 0 1rem;">Hi ${escapeHtml(opts.name)},</p>
      <p style="margin:0 0 1rem;">Thank you for applying to <strong>AfrESH Modeling</strong>. We're pleased to let you know you've been <strong>shortlisted</strong>.</p>
      <p style="margin:0 0 0.5rem;">Your interview is scheduled for:</p>
      <p style="font-size:1.1em;margin:0 0 1rem;"><strong>${escapeHtml(when)}</strong></p>
      <p style="margin:0 0 1rem;">We'll send any further details separately. If you need to reschedule, reply to this email.</p>
      <p style="color:#666;font-size:0.9em;margin:2rem 0 0;">— AfrESH Modeling</p>
    `;
  const { error } = await r.emails.send({
    from: config.resendFrom,
    to: opts.to,
    subject: "AfrESH Modeling — You're shortlisted",
    html: wrapApplicantEmailHtml(body),
  });
  if (error) throw new Error(error.message);
}

export async function sendRejectedEmail(opts: {
  to: string;
  name: string;
}): Promise<void> {
  const r = client();
  const body = `
      <p style="margin:0 0 1rem;">Hi ${escapeHtml(opts.name)},</p>
      <p style="margin:0 0 1rem;">Thank you for your interest in <strong>AfrESH Modeling</strong> and for taking the time to apply.</p>
      <p style="margin:0 0 1rem;">After careful review, we won't be moving forward with your application at this time. We encourage you to keep developing your portfolio and to consider applying again in the future.</p>
      <p style="color:#666;font-size:0.9em;margin:2rem 0 0;">— AfrESH Modeling</p>
    `;
  const { error } = await r.emails.send({
    from: config.resendFrom,
    to: opts.to,
    subject: "AfrESH Modeling — Application update",
    html: wrapApplicantEmailHtml(body),
  });
  if (error) throw new Error(error.message);
}
