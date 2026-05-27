import type { FastifyRequest } from "fastify";
import type { MultipartFile } from "@fastify/multipart";

export type ParsedFile = {
  fieldname: string;
  buffer: Buffer;
  mimetype: string;
};

const DEFAULT_BUFFERED_FILE_LIMIT_BYTES = 15 * 1024 * 1024;

async function readPartBufferWithLimit(
  part: MultipartFile,
  maxBytes: number
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    for await (const chunk of part.file) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) {
        part.file.destroy();
        throw new Error(`File too large (max ${Math.floor(maxBytes / (1024 * 1024))}MB)`);
      }
      chunks.push(buf);
    }
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to read multipart file");
  }

  return Buffer.concat(chunks, total);
}

/** Consume full multipart body (fields + files). */
export async function readMultipart(request: FastifyRequest): Promise<{
  fields: Record<string, string>;
  files: ParsedFile[];
}> {
  const fields: Record<string, string> = {};
  const files: ParsedFile[] = [];

  for await (const part of request.parts()) {
    if (part.type === "file") {
      const buffer = await readPartBufferWithLimit(
        part,
        DEFAULT_BUFFERED_FILE_LIMIT_BYTES
      );
      files.push({
        fieldname: part.fieldname,
        buffer,
        mimetype: part.mimetype || "application/octet-stream",
      });
    } else {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }

  return { fields, files };
}

export function filesNamed(files: ParsedFile[], name: string): ParsedFile[] {
  return files.filter((f) => f.fieldname === name);
}

export function firstFileNamed(
  files: ParsedFile[],
  name: string
): ParsedFile | undefined {
  return files.find((f) => f.fieldname === name);
}

export { readPartBufferWithLimit };
