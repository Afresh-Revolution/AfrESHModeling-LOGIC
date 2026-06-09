import type { Pool } from "pg";

let socialColumnEnsured = false;

/** Adds roster.social_url when missing — safe on live DBs; does not change existing row data. */
export async function ensureRosterSocialUrlColumn(pool: Pool): Promise<void> {
  if (socialColumnEnsured) return;
  await pool.query(`ALTER TABLE public.roster ADD COLUMN IF NOT EXISTS social_url text`);
  socialColumnEnsured = true;
}

export const rosterReturnColumns =
  "id::text, name, category, image_url, image_urls, social_url, sort_order";
