import type { FastifyInstance } from "fastify";
import { uploadImageBuffer } from "../../cloudinary.js";
import { config } from "../../config.js";
import { getPool } from "../../db.js";
import {
  parseImageUrlsField,
  rowImageUrls,
  toDbImageFields,
} from "../../lib/imageUrls.js";
import { ensureRosterSocialUrlColumn, rosterReturnColumns } from "../../lib/rosterDb.js";
import { filesNamed, firstFileNamed, readMultipart } from "../../lib/multipart.js";

function isLikelyHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function uploadImageFiles(
  files: { buffer: Buffer; mimetype: string }[],
  folder: string
): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    if (!file.buffer?.length) continue;
    if (!file.mimetype?.toLowerCase().startsWith("image/")) {
      throw new Error("Invalid image type");
    }
    urls.push(await uploadImageBuffer(file.buffer, file.mimetype, folder));
  }
  return urls;
}

function normalizeSocialUrl(raw: string | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  let trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (!isLikelyHttpUrl(trimmed)) {
    trimmed = trimmed.replace(/^\/\//, "");
    if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed) || trimmed.startsWith("www.")) {
      trimmed = `https://${trimmed}`;
    }
  }
  if (!isLikelyHttpUrl(trimmed)) {
    throw new Error("social_url must be a valid http(s) URL");
  }
  return trimmed;
}

export async function registerAdminRosterRoutes(fastify: FastifyInstance) {
  fastify.get("/", async (_request, reply) => {
    try {
      const pool = getPool();
      await ensureRosterSocialUrlColumn(pool);
      const { rows } = await pool.query(
        `SELECT ${rosterReturnColumns}, created_at, updated_at
         FROM roster
         ORDER BY sort_order ASC NULLS LAST, name ASC`
      );
      return reply.send({ roster: rows });
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : "Failed to list roster";
      return reply.status(500).send({ error: message });
    }
  });

  fastify.post(
    "/",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      let fields: Record<string, string>;
      let files: { fieldname: string; buffer: Buffer; mimetype: string }[];
      try {
        ({ fields, files } = await readMultipart(request));
      } catch (e) {
        return reply.status(400).send({
          error: e instanceof Error ? e.message : "Invalid multipart payload",
        });
      }
      const name = String(fields.name ?? "").trim();
      const category = String(fields.category ?? "").trim();
      const sort_order = Number(fields.sort_order ?? 0) || 0;
      let social_url: string | null = null;
      try {
        social_url = normalizeSocialUrl(fields.social_url) ?? null;
      } catch (e) {
        return reply.status(400).send({
          error: e instanceof Error ? e.message : "Invalid social_url",
        });
      }

      if (!name || !category) {
        return reply.status(400).send({ error: "name and category required" });
      }

      const multiFiles = [
        ...filesNamed(files, "images"),
        ...filesNamed(files, "image"),
      ];
      const manualUrls = parseImageUrlsField(fields);
      const manualSingle = String(fields.image_url ?? "").trim();

      try {
        const uploaded = await uploadImageFiles(multiFiles, config.folders.roster);
        const merged = [
          ...manualUrls,
          ...uploaded,
          ...(manualSingle && isLikelyHttpUrl(manualSingle) ? [manualSingle] : []),
        ];
        const { image_url, image_urls } = toDbImageFields(merged);

        if (!image_url) {
          return reply.status(400).send({ error: "At least one image is required" });
        }

        const pool = getPool();
        await ensureRosterSocialUrlColumn(pool);
        const { rows } = await pool.query(
          `INSERT INTO roster (name, category, image_url, image_urls, social_url, sort_order)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)
         RETURNING ${rosterReturnColumns}`,
          [name, category, image_url, JSON.stringify(image_urls), social_url, sort_order]
        );
        return reply.status(201).send({ model: rows[0] });
      } catch (e) {
        console.error(e);
        return reply.status(500).send({
          error: "Failed to create roster entry",
        });
      }
    }
  );

  fastify.patch<{
    Params: { id: string };
  }>(
    "/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = request.params;
      let fields: Record<string, string>;
      let files: { fieldname: string; buffer: Buffer; mimetype: string }[];
      try {
        ({ fields, files } = await readMultipart(request));
      } catch (e) {
        return reply.status(400).send({
          error: e instanceof Error ? e.message : "Invalid multipart payload",
        });
      }

      const name =
        fields.name !== undefined ? String(fields.name).trim() : undefined;
      const category =
        fields.category !== undefined ? String(fields.category).trim() : undefined;
      const sort_order =
        fields.sort_order !== undefined ? Number(fields.sort_order) : undefined;
      let social_url: string | null | undefined;
      try {
        social_url = normalizeSocialUrl(fields.social_url);
      } catch (e) {
        return reply.status(400).send({
          error: e instanceof Error ? e.message : "Invalid social_url",
        });
      }

      const multiFiles = [
        ...filesNamed(files, "images"),
        ...filesNamed(files, "image"),
      ];
      const imgFile = firstFileNamed(files, "image");
      const allUploadFiles =
        multiFiles.length > 0
          ? multiFiles
          : imgFile?.buffer?.length
            ? [imgFile]
            : [];

      const sets: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      const pool = getPool();
      await ensureRosterSocialUrlColumn(pool);

      if (name !== undefined) {
        sets.push(`name = $${i++}`);
        vals.push(name);
      }
      if (category !== undefined) {
        sets.push(`category = $${i++}`);
        vals.push(category);
      }
      if (sort_order !== undefined && !Number.isNaN(sort_order)) {
        sets.push(`sort_order = $${i++}`);
        vals.push(sort_order);
      }
      if (social_url !== undefined) {
        sets.push(`social_url = $${i++}`);
        vals.push(social_url);
      }

      const hasImageField =
        fields.image_urls !== undefined ||
        fields.image_url !== undefined ||
        allUploadFiles.length > 0;

      if (hasImageField) {
        try {
          const existing = await pool.query<{
            image_url: string;
            image_urls: unknown;
          }>(`SELECT image_url, image_urls FROM roster WHERE id = $1::uuid`, [id]);
          if (!existing.rows.length) {
            return reply.status(404).send({ error: "Not found" });
          }

          let urls =
            fields.image_urls !== undefined
              ? parseImageUrlsField(fields)
              : rowImageUrls(existing.rows[0]);

          const manualSingle =
            fields.image_url !== undefined ? String(fields.image_url).trim() : undefined;
          if (manualSingle && isLikelyHttpUrl(manualSingle)) {
            urls = [manualSingle];
          } else if (manualSingle === "") {
            urls = [];
          }

          const uploaded = await uploadImageFiles(allUploadFiles, config.folders.roster);
          urls = [...urls, ...uploaded];

          const { image_url, image_urls } = toDbImageFields(urls);
          if (!image_url) {
            return reply.status(400).send({ error: "At least one image is required" });
          }

          sets.push(`image_url = $${i++}`);
          vals.push(image_url);
          sets.push(`image_urls = $${i++}::jsonb`);
          vals.push(JSON.stringify(image_urls));
        } catch (e) {
          console.error(e);
          return reply.status(502).send({ error: "Image upload failed" });
        }
      }

      if (!sets.length) {
        return reply.status(400).send({ error: "No fields to update" });
      }

      sets.push(`updated_at = now()`);
      vals.push(id);
      const idPlaceholder = vals.length;

      try {
        const { rowCount, rows } = await pool.query(
          `UPDATE roster SET ${sets.join(", ")} WHERE id = $${idPlaceholder}::uuid
         RETURNING ${rosterReturnColumns}`,
          vals
        );
        if (!rowCount) return reply.status(404).send({ error: "Not found" });
        return reply.send({ model: rows[0] });
      } catch (e) {
        console.error(e);
        return reply.status(500).send({ error: "Update failed" });
      }
    }
  );

  fastify.delete<{
    Params: { id: string };
  }>(
    "/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const pool = getPool();
        const { rowCount } = await pool.query(
          `DELETE FROM roster WHERE id = $1::uuid`,
          [id]
        );
        if (!rowCount) return reply.status(404).send({ error: "Not found" });
        return reply.send({ ok: true });
      } catch (e) {
        console.error(e);
        return reply.status(500).send({ error: "Delete failed" });
      }
    }
  );
}
