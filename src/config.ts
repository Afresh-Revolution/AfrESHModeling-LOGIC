import "dotenv/config";

// Always allowed (dev + production site). Any extra origins from the
// CORS_ORIGINS env var are merged on top of these so a misconfigured deploy
// can never block the live site from POSTing to /api/applications.
const ALWAYS_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://afreshmodeling.com",
  "https://www.afreshmodeling.com",
];

function parseOrigins(raw: string | undefined): string[] {
  const fromEnv = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...ALWAYS_ALLOWED_ORIGINS, ...fromEnv]));
}

/** Marketing site origin (logo in emails must be an absolute HTTPS URL). */
function resolvePublicSiteUrl(corsOrigins: string[]): string {
  const explicit = process.env.PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const fromNext = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromNext) return fromNext;

  const httpsOrigin = corsOrigins.find(
    (o) => o.startsWith("https://") && !o.includes("ondigitalocean.app")
  );
  if (httpsOrigin) return httpsOrigin;

  return "http://localhost:3000";
}

/** Same secret the Next app uses for cookie JWT verification (JWT_SECRET or ADMIN_SESSION_SECRET). */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  trustProxy: process.env.TRUST_PROXY?.trim().toLowerCase() === "true",
  jwtSecret:
    process.env.JWT_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    "",
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  get publicSiteUrl() {
    return resolvePublicSiteUrl(this.corsOrigins);
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
    apiKey: process.env.CLOUDINARY_API_KEY ?? "",
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
    unsignedUploadPreset:
      process.env.CLOUDINARY_UNSIGNED_UPLOAD_PRESET?.trim() ?? "",
  },
  folders: {
    applications: `${process.env.CLOUDINARY_UPLOAD_FOLDER ?? "afresh"}/applications`,
    roster: `${process.env.CLOUDINARY_UPLOAD_FOLDER ?? "afresh"}/roster`,
    editorial: `${process.env.CLOUDINARY_UPLOAD_FOLDER ?? "afresh"}/editorial`,
    hire_models: `${process.env.CLOUDINARY_UPLOAD_FOLDER ?? "afresh"}/hire-models`,
  },
  resendApiKey: process.env.RESEND_API_KEY?.trim() ?? "",
  contactEmail: "info@afreshmodeling.com",
  resendFrom:
    process.env.RESEND_FROM?.trim() ??
    "AfrESH Modeling <info@afreshmodeling.com>",
};

export function assertDb() {
  if (!config.databaseUrl) {
    throw new Error("storage is required");
  }
}

export function assertJwtSecret() {
  if (!config.jwtSecret) {
    throw new Error(
      "JWT_SECRET or ADMIN_SESSION_SECRET is required for auth and admin routes"
    );
  }
}
