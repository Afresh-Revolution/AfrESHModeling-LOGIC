export function parseImageUrlsJson(
  raw: unknown,
  fallback?: string | null
): string[] {
  if (Array.isArray(raw)) {
    const urls = raw
      .filter((u): u is string => typeof u === "string")
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length) return urls;
  }
  if (typeof raw === "string" && raw.trim()) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      try {
        return parseImageUrlsJson(JSON.parse(trimmed), fallback);
      } catch {
        /* fall through */
      }
    }
    return [trimmed];
  }
  if (fallback?.trim()) return [fallback.trim()];
  return [];
}

export function parseImageUrlsField(fields: Record<string, string>): string[] {
  if (fields.image_urls !== undefined) {
    try {
      return parseImageUrlsJson(JSON.parse(fields.image_urls));
    } catch {
      return [];
    }
  }
  return [];
}

export function rowImageUrls(row: {
  image_urls?: unknown;
  image_url?: string | null;
}): string[] {
  const urls = parseImageUrlsJson(row.image_urls, row.image_url);
  if (urls.length) return urls;
  return parseImageUrlsJson(row.image_url);
}

export function toDbImageFields(urls: string[]): {
  image_url: string;
  image_urls: string[];
} {
  const clean = urls.filter(Boolean);
  return {
    image_url: clean[0] ?? "",
    image_urls: clean,
  };
}
