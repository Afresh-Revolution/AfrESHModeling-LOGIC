import type { FastifyInstance } from "fastify";
import { getPool } from "../../db.js";
import {
  LANDING_CONTENT_ID,
  ensureLandingContentRow,
  loadLandingContentRow,
  normalizeLandingContent,
} from "../../lib/landingContentStore.js";

export async function registerAdminLandingContentRoutes(fastify: FastifyInstance) {
  fastify.get("/", async (_request, reply) => {
    try {
      const pool = getPool();
      const landing = await loadLandingContentRow(pool);
      if (!landing) return reply.status(500).send({ error: "Landing content missing" });
      return reply.send({ landing_content: landing });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Failed to load landing content" });
    }
  });

  fastify.patch<{ Body: { content?: unknown } }>("/", async (request, reply) => {
    try {
      const pool = getPool();
      await ensureLandingContentRow(pool);
      const incoming = normalizeLandingContent(request.body?.content);
      const { rows } = await pool.query(
        `UPDATE public.landing_content
         SET content = $1::jsonb, updated_at = now()
         WHERE id = $2
         RETURNING id, content, updated_at`,
        [JSON.stringify(incoming), LANDING_CONTENT_ID]
      );
      if (!rows.length) return reply.status(500).send({ error: "Update failed" });
      const row = rows[0] as { id: number; content: unknown; updated_at: string };
      return reply.send({
        landing_content: {
          id: row.id,
          content: normalizeLandingContent(row.content),
          updated_at: row.updated_at,
        },
      });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Failed to update landing content" });
    }
  });
}
