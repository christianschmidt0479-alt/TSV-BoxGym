// Zentrales, robustes, mobilfreundliches Mail-Template für alle Member-Mails (TSV Falkensee Stil)
// Hauptfarbe: #154c83
// Footer: "TSV Falkensee | TSV BoxGym"

export interface BuildMemberMailOptions {
  title: string
  intro: string
  ctaLabel: string
  ctaUrl: string
  fallbackLabel?: string
  fallbackUrl?: string
  hint?: string
  securityNotice?: string
}

export function buildMemberMail({
  title,
  intro,
  ctaLabel,
  ctaUrl,
  fallbackLabel,
  fallbackUrl,
  hint,
  securityNotice,
}: BuildMemberMailOptions): string {
  // Fallback-Link-Label
  const fallback = fallbackLabel && fallbackUrl
    ? `<div style="margin:24px 0 0 0;font-size:14px;line-height:1.5;word-break:break-all;text-align:center;">
        <span style="color:#154c83;">${fallbackLabel}:</span><br />
        <a href="${fallbackUrl}" style="color:#154c83;word-break:break-all;">${fallbackUrl}</a>
      </div>`
    : ""

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f6f6f6;font-family:'Avenir Next',Segoe UI,sans-serif;color:#222;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f6;padding:0;margin:0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;margin:32px auto 0 auto;background:#fff;border-radius:10px;box-shadow:0 2px 8px #0001;padding:0 0 32px 0;">
          <tr>
            <td style="padding:32px 24px 0 24px;text-align:center;">
              <img 
                src="https://www.tsvboxgym.de/assets/logos/boxgym-kompakt.png"
                alt="TSV BoxGym Kompakt Logo"
                style="display:block;margin:0 auto 16px auto;width:100%;max-width:110px;height:auto;"
              />
              <div style="font-size:22px;font-weight:700;color:#154c83;letter-spacing:0.5px;margin-bottom:4px;">TSV Falkensee</div>
              <div style="font-size:16px;font-weight:500;color:#154c83;opacity:0.8;margin-bottom:24px;">TSV BoxGym</div>
              <h1 style="font-size:22px;font-weight:700;color:#222;margin:0 0 16px 0;line-height:1.2;">${title}</h1>
              <p style="font-size:16px;line-height:1.5;margin:0 0 24px 0;color:#222;">${intro}</p>
              ${hint ? `<div style="font-size:15px;color:#154c83;margin-bottom:18px;">${hint}</div>` : ""}
              <a href="${ctaUrl}" style="display:inline-block;background:#154c83;color:#fff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:8px;margin:0 0 8px 0;letter-spacing:0.2px;">${ctaLabel}</a>
              ${fallback}
              ${securityNotice ? `<div style="margin:32px 0 0 0;font-size:13px;color:#666;line-height:1.5;text-align:center;">${securityNotice}</div>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:32px 0 0 0;text-align:center;">
              <div style="font-size:13px;color:#999;">TSV Falkensee | TSV BoxGym</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
