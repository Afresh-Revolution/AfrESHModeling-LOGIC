import type { FastifyInstance } from "fastify";
import { getPool } from "../db.js";
import { loadLandingContentRow } from "../lib/landingContentStore.js";

/**
 * Read-only JSON for the Next.js marketing site (same shape as legacy `/api/editorial` + `/api/roster`).
 */
export async function registerPublicSiteRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/editorial",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (_request, reply) => {
      try {
        const pool = getPool();
        const { rows } = await pool.query(
          `SELECT id::text, title, image_url, video_url, sort_order
           FROM editorial
           ORDER BY sort_order ASC NULLS LAST, title ASC`
        );
        return reply.send({ editorial: rows });
      } catch (e) {
        console.error(e);
        return reply.status(500).send({ error: "Could not load editorial" });
      }
    }
  );

  fastify.get(
    "/roster",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (_request, reply) => {
      try {
        const pool = getPool();
        const { rows } = await pool.query(
          `SELECT id::text, name, category, image_url, image_urls, sort_order
           FROM roster
           ORDER BY sort_order ASC NULLS LAST, name ASC`
        );
        return reply.send({ roster: rows });
      } catch (e) {
        console.error(e);
        return reply.status(500).send({ error: "Could not load roster" });
      }
    }
  );

  fastify.get(
    "/hire-models",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (_request, reply) => {
      try {
        const pool = getPool();
        const { rows } = await pool.query(
          `SELECT id::text, name, image_url, image_urls, video_url, accomplishments, sort_order
           FROM hire_models
           ORDER BY sort_order ASC NULLS LAST, name ASC`
        );
        return reply.send({ hire_models: rows });
      } catch (e) {
        console.error(e);
        return reply.status(500).send({ error: "Could not load hire models" });
      }
    }
  );

  fastify.get(
    "/landing-content",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (_request, reply) => {
      try {
        const pool = getPool();
        const landing = await loadLandingContentRow(pool);
        if (!landing) {
          return reply.status(503).send({ error: "Landing content not configured" });
        }
        return reply.send({ landing_content: landing });
      } catch (e) {
        console.error(e);
        return reply.status(500).send({ error: "Could not load landing content" });
      }
    }
  );

  fastify.get(
    "/metrics",
    { config: { rateLimit: { max: 300, timeWindow: "1 minute" } } },
    async (_request, reply) => {
      try {
        const pool = getPool();
        const { rows } = await pool.query(
          `SELECT id, total_earnings_display, brand_partnerships, countries_placements,
                  models_represented, campaigns_delivered, years_excellence, placement_rate_percent,
                  category_distribution, placement_by_year, updated_at
           FROM site_metrics WHERE id = 1`
        );
        if (!rows.length) {
          return reply.status(503).send({ error: "Metrics not configured" });
        }
        return reply.send({ metrics: rows[0] });
      } catch (e) {
        console.error(e);
        return reply.status(500).send({ error: "Could not load metrics" });
      }
    }
  );
}
