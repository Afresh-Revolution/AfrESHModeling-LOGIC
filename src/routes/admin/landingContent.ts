import type { FastifyInstance } from "fastify";
import { getPool } from "../../db.js";

const ID = 1;

const DEFAULT_CONTENT: Record<string, string> = {
  hero_badge: "Now Accepting Applications",
  hero_title_prefix: "AfrESH",
  hero_title_highlight: "Modeling",
  hero_subtitle: "Where Elegance Meets Excellence",
  hero_primary_cta: "View Our Talent",
  hero_secondary_cta: "Apply Now",
  models_section_label: "Featured Talent",
  models_section_title: "Our Roster",
  models_section_description:
    "Discover the faces that define AfrESH Modeling — each selected for their unique presence and professional drive.",
  ecosystem_section_label: "Our Process",
  ecosystem_section_title: "The AfrESH Modeling Ecosystem",
  ecosystem_section_description:
    "A scientifically structured pipeline that transforms raw potential into industry-leading talent.",
  data_section_label: "Performance Metrics",
  data_section_title: "By The Numbers",
  data_section_description:
    "Data-driven results that validate our approach to model development and market placement.",
  apply_section_label: "Open Call",
  apply_section_title: "Become Part of AfrESH Modeling",
  apply_section_description:
    "We are always looking for extraordinary individuals. Submit your application below.",
  apply_requirements_title: "What We Look For",
  apply_requirements_intro:
    "AfrESH Modeling represents a curated selection of talent. Our scouting process is both intuitive and analytical, seeking individuals who bring something unmistakable to the industry.",
  apply_requirement_1:
    "Height preference: 5'8\" and above for women, 6'0\" and above for men",
  apply_requirement_2: "Strong facial bone structure and unique features",
  apply_requirement_3: "Professional attitude and reliability",
  apply_requirement_4: "No prior experience required — we develop raw talent",
  apply_requirement_5: "Must be 16 years or older to apply",
  apply_requirement_6:
    "Open to all ethnicities, body types within our diverse categories",
  gallery_section_label: "Editorial",
  gallery_section_title: "Recent Campaigns",
  gallery_section_description:
    "A glimpse into the campaigns and editorial work produced through the AfrESH Modeling ecosystem.",
  footer_brand_description:
    "Redefining the modeling industry through data-driven talent development and uncompromising standards of elegance.",
  footer_contact_location: "Jos, Nigeria",
  footer_contact_email: "info@afreshmodeling.com",
  footer_apply_button: "Apply Now",
  footer_portfolio_button: "View Portfolio",
  footer_contact_button: "Contact Us",
  footer_copyright_year: "2026",
  footer_copyright_text: "AfrESH Modeling. All rights reserved.",
};

function normalizeContent(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CONTENT };
  const rec = raw as Record<string, unknown>;
  const out: Record<string, string> = { ...DEFAULT_CONTENT };
  for (const key of Object.keys(DEFAULT_CONTENT)) {
    const v = rec[key];
    if (typeof v === "string") out[key] = v;
  }
  return out;
}

async function ensureLandingContent(pool: ReturnType<typeof getPool>) {
  await pool.query(
    `INSERT INTO public.landing_content (id, content)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [ID, JSON.stringify(DEFAULT_CONTENT)]
  );
}

export async function registerAdminLandingContentRoutes(fastify: FastifyInstance) {
  fastify.get("/", async (_request, reply) => {
    try {
      const pool = getPool();
      await ensureLandingContent(pool);
      const { rows } = await pool.query(
        `SELECT id, content, updated_at FROM public.landing_content WHERE id = $1`,
        [ID]
      );
      if (!rows.length) return reply.status(500).send({ error: "Landing content missing" });
      const row = rows[0] as { id: number; content: unknown; updated_at: string };
      return reply.send({
        landing_content: {
          id: row.id,
          content: normalizeContent(row.content),
          updated_at: row.updated_at,
        },
      });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Failed to load landing content" });
    }
  });

  fastify.patch<{ Body: { content?: unknown } }>("/", async (request, reply) => {
    try {
      const pool = getPool();
      await ensureLandingContent(pool);
      const incoming = normalizeContent(request.body?.content);
      const { rows } = await pool.query(
        `UPDATE public.landing_content
         SET content = $1::jsonb, updated_at = now()
         WHERE id = $2
         RETURNING id, content, updated_at`,
        [JSON.stringify(incoming), ID]
      );
      if (!rows.length) return reply.status(500).send({ error: "Update failed" });
      const row = rows[0] as { id: number; content: unknown; updated_at: string };
      return reply.send({
        landing_content: {
          id: row.id,
          content: normalizeContent(row.content),
          updated_at: row.updated_at,
        },
      });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Failed to update landing content" });
    }
  });
}
