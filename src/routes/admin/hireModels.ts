import type { FastifyInstance } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import {
  createUploadSignature,
  uploadImageBuffer,
  uploadVideoStream,
} from "../../cloudinary.js";
import { config } from "../../config.js";
import { getPool } from "../../db.js";

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
  image?: { buffer: Buffer; mimetype: string };
  video?: { file: MultipartFile["file"]; mimetype: string };
}> {
  const fields: Record<string, string> = {};
  let image: { buffer: Buffer; mimetype: string } | undefined;
  let video: { file: MultipartFile["file"]; mimetype: string } | undefined;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (part.fieldname === "image") {
        const buf = await part.toBuffer();
        if (buf?.length) {
          image = { buffer: buf, mimetype: part.mimetype || "application/octet-stream" };
        }
      } else if (part.fieldname === "video") {
        video = { file: part.file, mimetype: part.mimetype || "application/octet-stream" };
      }
    } else {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }

  return { fields, image, video };
}

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
        `SELECT id::text, name, image_url, video_url, accomplishments, sort_order, created_at, updated_at
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
      const { fields, image, video } = await readHireModelsMultipart(request);
      const name = String(fields.name ?? "").trim();
      const accomplishments = String(fields.accomplishments ?? "").trim();
      const sort_order = Number(fields.sort_order ?? 0) || 0;
      const image_url_body =
        fields.image_url !== undefined ? String(fields.image_url).trim() : "";
      const video_url_body =
        fields.video_url !== undefined ? String(fields.video_url).trim() : "";

      if (!name) {
        return reply.status(400).send({ error: "name required" });
      }
      if (
        !image?.buffer?.length &&
        !video?.file &&
        !image_url_body &&
        !video_url_body
      ) {
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
        const image_url = image?.buffer?.length
          ? await uploadImageBuffer(image.buffer, image.mimetype, config.folders.hire_models)
          : image_url_body || null;
        const video_url = video?.file
          ? await uploadVideoStream(video.file, video.mimetype, config.folders.hire_models)
          : video_url_body || null;
        const pool = getPool();
        const { rows } = await pool.query(
          `INSERT INTO hire_models (name, image_url, video_url, accomplishments, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id::text, name, image_url, video_url, accomplishments, sort_order`,
          [name, image_url, video_url, accomplishments, sort_order]
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
      const { fields, image, video } = await readHireModelsMultipart(request);

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

      let image_url: string | undefined = image_url_body;
      if (image?.buffer?.length) {
        try {
          image_url = await uploadImageBuffer(
            image.buffer,
            image.mimetype,
            config.folders.hire_models
          );
        } catch (e) {
          console.error(e);
          return reply.status(502).send({ error: "Image upload failed" });
        }
      }

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
      if (image_url !== undefined && image_url !== "") {
        sets.push(`image_url = $${i++}`);
        vals.push(image_url);
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
           RETURNING id::text, name, image_url, video_url, accomplishments, sort_order`,
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
