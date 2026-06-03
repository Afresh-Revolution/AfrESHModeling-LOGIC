import { config } from "../config.js";

const BRAND_NAME = "AfrESH Modeling";
const LOGO_PATH = "/brand-logo.png";

export function brandLogoUrl(): string {
  const base = config.publicSiteUrl.replace(/\/$/, "");
  return `${base}${LOGO_PATH}`;
}

export function wrapApplicantEmailHtml(bodyHtml: string): string {
  const logoUrl = brandLogoUrl();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${BRAND_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f4f2ed;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0b0d;">
    <tr>
      <td align="center" style="padding:28px 20px;">
        <img
          src="${logoUrl}"
          alt="${BRAND_NAME}"
          width="280"
          style="display:block;max-width:280px;width:100%;height:auto;border:0;"
        />
      </td>
    </tr>
  </table>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding:32px 20px 40px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;">
          <tr>
            <td style="padding:28px 28px 32px;font-size:16px;line-height:1.6;">
              ${bodyHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding:0 20px 32px;font-size:12px;color:#888;">
        ${BRAND_NAME} · <a href="mailto:${config.contactEmail}" style="color:#c9a84c;text-decoration:none;">${config.contactEmail}</a>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
