// Zentrales, robustes, mobilfreundliches Mail-Template für alle Member-Mails (TSV Falkensee Stil)
// Hauptfarbe: #154c83
// Footer: "TSV Falkensee | TSV BoxGym"

import { buildBaseMailLayout, escapeMailHtml } from "./baseMailLayout"

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
  const fallback = fallbackLabel && fallbackUrl
    ? `<div style="margin:18px 0 0 0;font-size:14px;line-height:1.6;word-break:break-all;">
        <span style="color:#154c83;font-weight:600;">${escapeMailHtml(fallbackLabel)}:</span><br />
        <a href="${escapeMailHtml(fallbackUrl)}" style="color:#154c83;word-break:break-all;">${escapeMailHtml(fallbackUrl)}</a>
      </div>`
    : ""

  const content = `
    <p style="font-size:15px;line-height:1.6;margin:0 0 18px 0;color:#1f2937;">${escapeMailHtml(intro)}</p>
    ${hint ? `<p style="font-size:14px;color:#154c83;margin:0 0 14px 0;">${escapeMailHtml(hint)}</p>` : ""}
    ${fallback}
    ${securityNotice ? `<p style="margin:20px 0 0 0;font-size:13px;color:#6b7280;line-height:1.6;">${escapeMailHtml(securityNotice)}</p>` : ""}
  `

  return buildBaseMailLayout({ title, content, ctaLabel, ctaUrl })
}
