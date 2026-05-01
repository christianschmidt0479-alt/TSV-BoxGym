const BRAND_LOGO_URL = "https://www.tsvboxgym.de/brand/tsv-boxgym-logo-v2.png"

export function escapeMailHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function linkifyLine(line: string) {
  const urlPattern = /(https?:\/\/[^\s<]+)/g
  let lastIndex = 0
  let html = ""

  for (const match of line.matchAll(urlPattern)) {
    const matchedUrl = match[0]
    const matchIndex = match.index ?? 0

    html += escapeMailHtml(line.slice(lastIndex, matchIndex))
    html += `<a href="${escapeMailHtml(matchedUrl)}" style="color:#154c83;word-break:break-all;">${escapeMailHtml(matchedUrl)}</a>`
    lastIndex = matchIndex + matchedUrl.length
  }

  html += escapeMailHtml(line.slice(lastIndex))
  return html
}

export function renderTextAsMailContent(text: string) {
  return text
    .split(/\n\n+/)
    .map((paragraph) => {
      const renderedLines = paragraph.split("\n").map((line) => linkifyLine(line))
      return `<p style="margin:0 0 14px;color:#1f2937;font-size:15px;line-height:1.6;">${renderedLines.join("<br />")}</p>`
    })
    .join("")
}

export function buildBaseMailLayout(input: { title: string; content: string; ctaLabel?: string; ctaUrl?: string }) {
  const ctaBlock = input.ctaLabel?.trim() && input.ctaUrl?.trim()
    ? `<div style="margin:18px 0 18px 0;">
        <a href="${escapeMailHtml(input.ctaUrl)}" style="display:inline-block;background:#154c83;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">${escapeMailHtml(input.ctaLabel)}</a>
      </div>`
    : ""

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeMailHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Avenir Next','Segoe UI',Arial,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:24px 24px 12px 24px;text-align:center;background:#ffffff;border-bottom:1px solid #eef2f7;">
              <img src="${BRAND_LOGO_URL}" alt="TSV BoxGym" width="220" style="display:block;margin:0 auto;max-width:220px;width:100%;height:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h1 style="margin:0 0 14px 0;font-size:22px;line-height:1.25;color:#0f2740;">${escapeMailHtml(input.title)}</h1>
                ${ctaBlock}
              ${input.content}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 22px 24px;border-top:1px solid #eef2f7;color:#6b7280;font-size:12px;text-align:center;">
              TSV Falkensee | TSV BoxGym
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
