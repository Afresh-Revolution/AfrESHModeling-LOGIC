import type { FastifyInstance } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import {
  createUploadSignature,
  uploadImageBuffer,
  uploadVideoStream,
} from "../../cloudinary.js";
import { config } from "../../config.js";
import { getPool } from "../../db.js";
import {
  parseImageUrlsField,
  rowImageUrls,
  toDbImageFields,
} from "../../lib/imageUrls.js";

const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;

function isLikelyHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function readHireModelsMultipart(request: any): Promise<{
  fields: Record<string, string>;
  images: { buffer: Buffer; mimetype: string }[];
  video?: { file: MultipartFile["file"]; mimetype: string };
}> {
  const fields: Record<string, string> = {};
  const images: { buffer: Buffer; mimetype: string }[] = [];
  let video: { file: MultipartFile["file"]; mimetype: string } | undefined;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (part.fieldname === "image" || part.fieldname === "images") {
        const buf = await part.toBuffer();
        if (buf?.length) {
          images.push({ buffer: buf, mimetype: part.mimetype || "application/octet-stream" });
        }
      } else if (part.fieldname === "video") {
        video = { file: part.file, mimetype: part.mimetype || "application/octet-stream" };
      }
    } else {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }

  return { fields, images, video };
}

const HIRE_RETURN = `id::text, name, image_url, image_urls, video_url, accomplishments, sort_order`;

export async function registerAdminHireModelsRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/upload-signature",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const resource_type = String((request.query as { resource_type?: string })?.resource_type ?? "video").trim();
      if (resource_type !== "video" && resource_type !== "image") {
        return reply.status(400).send({ error: "Invalid resource_type" });
      }

      const folder = config.folders.hire_models;
      const { timestamp, signature, apiKey, cloudName } = createUploadSignature({
        folder,
      });

      return reply.send({
        cloudName,
        apiKey,
        timestamp,
        signature,
        folder,
        resource_type,
        max_file_size: resource_type === "video" ? MAX_VIDEO_SIZE_BYTES : undefined,
      });
    }
  );

  fastify.get("/", async (_request, reply) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT ${HIRE_RETURN}, created_at, updated_at
         FROM hire_models
         ORDER BY sort_order ASC NULLS LAST, name ASC`
      );
      return reply.send({ hire_models: rows });
    } catch (e) {
      console.error(e);
      return reply.status(500).send({ error: "Failed to list hire models" });
    }
  });

  fastify.post(
    "/",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { fields, images, video } = await readHireModelsMultipart(request);
      const name = String(fields.name ?? "").trim();
      const accomplishments = String(fields.accomplishments ?? "").trim();
      const sort_order = Number(fields.sort_order ?? 0) || 0;
      const manualUrls = parseImageUrlsField(fields);
      const image_url_body =
        fields.image_url !== undefined ? String(fields.image_url).trim() : "";
      const video_url_body =
        fields.video_url !== undefined ? String(fields.video_url).trim() : "";

      if (!name) {
        return reply.status(400).send({ error: "name required" });
      }

      const uploadedUrls: string[] = [];
      for (const img of images) {
        uploadedUrls.push(
          await uploadImageBuffer(img.buffer, img.mimetype, config.folders.hire_models)
        );
      }
      const mergedUrls = [
        ...manualUrls,
        ...uploadedUrls,
        ...(image_url_body && isLikelyHttpUrl(image_url_body) ? [image_url_body] : []),
      ];
      const { image_url, image_urls } = toDbImageFields(mergedUrls);
      const hasImage = !!image_url;
      const hasVideoUrl = !!(video_url_body && isLikelyHttpUrl(video_url_body));
      const hasVideoFile = !!video?.file;

      if (!hasImage && !hasVideoFile && !hasVideoUrl) {
        return reply.status(400).send({
          error: "image or video file required (or image_url/video_url)",
        });
      }
      if (image_url_body && !isLikelyHttpUrl(image_url_body)) {
        return reply.status(400).send({ error: "Invalid image_url" });
      }
      if (video_url_body && !isLikelyHttpUrl(video_url_body)) {
        return reply.status(400).send({ error: "Invalid video_url" });
      }

      try {
        const video_url = video?.file
          ? await uploadVideoStream(video.file, video.mimetype, config.folders.hire_models)
          : video_url_body || null;
        const pool = getPool();
        const { rows } = await pool.query(
          `INSERT INTO hire_models (name, image_url, image_urls, video_url, accomplishments, sort_order)
           VALUES ($1, $2, $3::jsonb, $4, $5, $6)
           RETURNING ${HIRE_RETURN}`,
          [
            name,
            image_url || null,
            JSON.stringify(image_urls),
            video_url,
            accomplishments,
            sort_order,
          ]
        );
        return reply.status(201).send({ item: rows[0] });
      } catch (e) {
        console.error(e);
        return reply.status(500).send({ error: "Failed to create hire model" });
      }
    }
  );

  fastify.patch<{ Params: { id: string } }>(
    "/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = request.params;
      const { fields, images, video } = await readHireModelsMultipart(request);

      const name = fields.name !== undefined ? String(fields.name).trim() : undefined;
      const accomplishments =
        fields.accomplishments !== undefined
          ? String(fields.accomplishments).trim()
          : undefined;
      const sort_order =
        fields.sort_order !== undefined ? Number(fields.sort_order) : undefined;
      const image_url_body =
        fields.image_url !== undefined ? String(fields.image_url).trim() : undefined;
      const video_url_body =
        fields.video_url !== undefined ? String(fields.video_url).trim() : undefined;
      const clear_video =
        fields.clear_video !== undefined ? String(fields.clear_video).trim() : "";

      const hasImageUpdate =
        fields.image_urls !== undefined ||
        fields.image_url !== undefined ||
        images.length > 0;

      let video_url: string | null | undefined = undefined;
      if (clear_video === "1" || clear_video.toLowerCase() === "true") {
        video_url = null;
      } else if (video_url_body !== undefined) {
        if (video_url_body && !isLikelyHttpUrl(video_url_body)) {
          return reply.status(400).send({ error: "Invalid video_url" });
        }
        video_url = video_url_body || null;
      } else if (video?.file) {
        try {
          video_url = await uploadVideoStream(
            video.file,
            video.mimetype,
            config.folders.hire_models
          );
        } catch (e) {
          console.error(e);
          return reply.status(502).send({ error: "Video upload failed" });
        }
      }

      const sets: string[] = [];
      const vals: unknown[] = [];
      let i = 1;

      if (name !== undefined) {
        sets.push(`name = $${i++}`);
        vals.push(name);
      }
      if (accomplishments !== undefined) {
        sets.push(`accomplishments = $${i++}`);
        vals.push(accomplishments);
      }
      if (sort_order !== undefined && !Number.isNaN(sort_order)) {
        sets.push(`sort_order = $${i++}`);
        vals.push(sort_order);
      }
      if (hasImageUpdate) {
        try {
          const pool = getPool();
          const existing = await pool.query<{
            image_url: string | null;
            image_urls: unknown;
          }>(`SELECT image_url, image_urls FROM hire_models WHERE id = $1::uuid`, [id]);
          if (!existing.rows.length) {
            return reply.status(404).send({ error: "Not found" });
          }

          let urls =
            fields.image_urls !== undefined
              ? parseImageUrlsField(fields)
              : rowImageUrls(existing.rows[0]);

          if (image_url_body !== undefined) {
            if (image_url_body && isLikelyHttpUrl(image_url_body)) {
              urls = [image_url_body];
            } else {
              urls = [];
            }
          }

          for (const img of images) {
            urls.push(
              await uploadImageBuffer(img.buffer, img.mimetype, config.folders.hire_models)
            );
          }

          const { image_url, image_urls } = toDbImageFields(urls);
          sets.push(`image_url = $${i++}`);
          vals.push(image_url || null);
          sets.push(`image_urls = $${i++}::jsonb`);
          vals.push(JSON.stringify(image_urls));
        } catch (e) {
          console.error(e);
          return reply.status(502).send({ error: "Image upload failed" });
        }
      }
      if (video_url !== undefined) {
        sets.push(`video_url = $${i++}`);
        vals.push(video_url);
      }

      if (!sets.length) {
        return reply.status(400).send({ error: "No fields to update" });
      }

      sets.push(`updated_at = now()`);
      vals.push(id);
      const idPlaceholder = vals.length;

      try {
        const pool = getPool();
        const { rowCount, rows } = await pool.query(
          `UPDATE hire_models SET ${sets.join(", ")} WHERE id = $${idPlaceholder}::uuid
           RETURNING ${HIRE_RETURN}`,
          vals
        );
        if (!rowCount) return reply.status(404).send({ error: "Not found" });
        return reply.send({ item: rows[0] });
      } catch (e) {
        console.error(e);
        return reply.status(500).send({ error: "Update failed" });
      }
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const pool = getPool();
        const { rowCount } = await pool.query(
          `DELETE FROM hire_models WHERE id = $1::uuid`,
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
