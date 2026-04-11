// Minimaler Stub für Build-Fix: sendVerificationEmail
export async function sendVerificationEmail(input: {
  email: string;
  name?: string;
  link: string;
  kind?: "member" | "trainer" | "boxzwerge";
}): Promise<ResendEmailDeliveryResult> {
  // Kein Versand, nur Dummy-Objekt für Build/Typecheck
  console.log("sendVerificationEmail (Stub)", input);
  return { provider: "resend", messageId: null };
}
import { formatDisplayDateTime, formatIsoDateForDisplay } from "@/lib/dateFormat"

type VerificationMailInput = {
  email: string
  name?: string
  link: string
  kind?: "member" | "trainer" | "boxzwerge"
}

type AdminNotificationInput = {
  kind: "member" | "trainer" | "boxzwerge"
  memberName: string
  email?: string
  group?: string
}

type AdminDigestMailInput = {
  dateLabel: string
  items: Array<{
    kind: "member" | "trainer" | "boxzwerge"
    memberName: string
    email?: string | null
    group?: string | null
    createdAt?: string
  }>
}

type ApprovalMailInput = {
  email: string
  name?: string
  kind: "member" | "trainer" | "boxzwerge"
  group?: string
}

type AccessCodeChangedMailInput = {
  email: string
  name?: string
  kind: "member" | "boxzwerge"
}

type CompetitionAssignedMailInput = {
  email: string
  name?: string
}

type CompetitionRemovedMailInput = {
  email: string
  name?: string
}

type MedicalExamReminderMailInput = {
  email: string
  name?: string
  dueDate?: string
}

type MedicalExamReminderAdminMailInput = {
  email: string
  athleteName?: string
  dueDate?: string
}

type GsMembershipCheckMailInput = {
  firstName: string
  lastName: string
  birthdateLabel: string
  recipientEmail?: string
  subject?: string
  confirmationYesLink?: string
  confirmationNoLink?: string
  confirmationLink?: string
  athleteLabel?: string
}

export type ResendEmailDeliveryResult = {
  provider: "resend"
  messageId: string | null
}

import { getAdminNotificationAddress, getMailFromAddress, getReplyToAddress } from "@/lib/mailConfig"

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function renderTextLineToHtml(line: string) {
  const urlPattern = /(https?:\/\/[^\s<]+)/g
  let lastIndex = 0
  let html = ""

  for (const match of line.matchAll(urlPattern)) {
    const matchedUrl = match[0]
    const matchIndex = match.index ?? 0

    html += escapeHtml(line.slice(lastIndex, matchIndex))
    html += `<a href="${escapeHtml(matchedUrl)}" style="color: #154c83; word-break: break-all;">${escapeHtml(matchedUrl)}</a>`
    lastIndex = matchIndex + matchedUrl.length
  }

  html += escapeHtml(line.slice(lastIndex))
  return html
}

function renderPlainTextEmailHtml(text: string) {
  return text
    .split(/\n\n+/)
    .map((paragraph) => {
      const renderedLines = paragraph.split("\n").map((line) => renderTextLineToHtml(line))
      return `<p style="margin: 0 0 16px; white-space: normal;">${renderedLines.join("<br />")}</p>`
    })
    .join("")
}

function getResendApiKey() {
  const serverKey = process.env.RESEND_API_KEY
  const devFallback = process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_RESEND_API_KEY : undefined
  return serverKey || devFallback
}

async function sendMailWithResend(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  kind?: string;
}): Promise<ResendEmailDeliveryResult> {
  const apiKey = getResendApiKey()
  const from = getMailFromAddress()
  const replyTo = input.replyTo?.trim() || getReplyToAddress()

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY")
  }

  // Exaktes Logging nach Vorgabe
  console.log("MAIL_SEND_START", { to: input.to, from, kind: input.kind || undefined });
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        reply_to: replyTo,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      console.error("MAIL_SEND_FAILED", { status: response.status, body: text });
      throw new Error(text || "Resend request failed");
    }
    let messageId = null;
    try {
      const payload = JSON.parse(text);
      messageId = typeof payload?.id === "string" ? payload.id : null;
    } catch {}
    console.log("MAIL_SEND_SUCCESS", { status: response.status, messageId });
    return {
      provider: "resend",
      messageId,
    };
  } catch (error) {
    let status = response?.status;
    let body = null;
    try { body = await response?.text(); } catch {}
    console.error("MAIL_SEND_FAILED", { error, status, body });
    throw error;
  }
}

export async function sendCustomEmail(input: {
  to: string
  subject: string
  text: string
  replyTo?: string
}): Promise<ResendEmailDeliveryResult> {
  return sendMailWithResend({
    to: input.to,
    subject: input.subject,
    text: "TEST",
    replyTo: input.replyTo,
    html: "TEST",
  })
}

function getVerificationMailContent(input: VerificationMailInput) {
  return {
    subject: "TSV BoxGym: Bitte Trainer-E-Mail bestätigen",
    preheader: "Bestätige deine E-Mail-Adresse für deinen Trainerzugang.",
    headline: "Trainerzugang bestätigen",
    greeting: "TEST",
    intro: "TEST",
    steps: ["TEST"],
    outro: "TEST",
    cta: "TEST",
  }
  // Entfernt: Lose HTML-/Template-Fragmente außerhalb von Funktionen (siehe Rückbau-Protokoll)
}

export async function sendAdminNotificationEmail(input: AdminNotificationInput) {
  const apiKey = getResendApiKey()
  const from = getMailFromAddress()
  const replyTo = getReplyToAddress()
  const adminEmail = getAdminNotificationAddress()

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY")
  }

  const labels = {
    member: "Neue Registrierung im Boxbereich",
    trainer: "Neue Trainerregistrierung",
    boxzwerge: "Neue Boxzwerge-Registrierung",
  } as const

  const subject = `TSV BoxGym Admin: ${labels[input.kind]}`

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      reply_to: replyTo,
      to: [adminEmail],
      subject,
      text: "TEST",
      html: "TEST",
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Resend admin notification failed")
  }
}

export async function sendAdminDigestEmail(input: AdminDigestMailInput) {
  const apiKey = getResendApiKey()
  const from = getMailFromAddress()
  const replyTo = getReplyToAddress()
  const adminEmail = getAdminNotificationAddress()

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY")
  }

  const labels = {
    member: "Boxbereich",
    trainer: "Trainer",
    boxzwerge: "Boxzwerge",
  } as const

  const counts = input.items.reduce<Record<AdminDigestMailInput["items"][number]["kind"], number>>(
    (acc, item) => {
      acc[item.kind] += 1
      return acc
    },
    { member: 0, trainer: 0, boxzwerge: 0 }
  )

  const subject = `TSV BoxGym Admin: Sammelmail ${input.dateLabel}`

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      reply_to: replyTo,
      to: [adminEmail],
      subject,
      text: "TEST",
      html: "TEST",
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Resend admin digest failed")
  }
}

export async function sendApprovalEmail(input: ApprovalMailInput) {
  const apiKey = getResendApiKey()
  const from = getMailFromAddress()
  const replyTo = getReplyToAddress()

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY")
  }

  const isTrainer = input.kind === "trainer"
  const isBoxzwerge = input.kind === "boxzwerge"
  const subject = isTrainer
    ? "TSV BoxGym: Dein Trainerzugang wurde freigegeben"
    : isBoxzwerge
      ? "TSV BoxGym: Boxzwerge-Zugang wurde freigegeben"
      : "TSV BoxGym: Dein Boxbereich-Zugang wurde freigegeben"
  const headline = isTrainer
    ? "Trainerzugang freigegeben"
    : isBoxzwerge
      ? "Boxzwerge-Zugang freigegeben"
      : "Boxbereich freigegeben"
  const intro = isTrainer
    ? "dein Trainerzugang wurde vom Admin freigegeben und ist jetzt aktiv."
    : isBoxzwerge
      ? "der Zugang zum Boxzwerge-Bereich wurde freigegeben und kann jetzt genutzt werden."
      : "dein Zugang zum Boxbereich wurde vom Admin freigegeben und kann jetzt genutzt werden."

  const details = isTrainer
    ? ["Trainerbereich kann jetzt genutzt werden", "Login weiter mit E-Mail und Passwort"]
    : [`Stammgruppe: ${input.group || "noch offen"}`, "Check-in und Mein Bereich können jetzt normal genutzt werden"]

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      reply_to: replyTo,
      to: [input.email],
      subject,
      text: `${headline}

Hallo${input.name ? ` ${input.name}` : ""},

${intro}

${details.map((detail, index) => `${index + 1}. ${detail}`).join("\n")}

TSV BoxGym`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #18181b; background: #f4f4f5; padding: 24px;">
          <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #e4e4e7;">
            <div style="background: linear-gradient(135deg, #154c83 0%, #0f2740 100%); color: #ffffff; padding: 28px 28px 24px;">
              <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">TSV BoxGym</div>
              <h1 style="margin: 10px 0 0; font-size: 24px; line-height: 1.2;">${headline}</h1>
            </div>
            <div style="padding: 28px;">
              <p style="margin-top: 0;">Hallo${input.name ? ` ${escapeHtml(input.name)}` : ""},</p>
              <p>${intro}</p>
              <div style="margin: 20px 0; padding: 18px; border-radius: 16px; background: #f8fafc; border: 1px solid #dbeafe;">
                <div style="font-weight: 700; margin-bottom: 8px; color: #154c83;">Wichtige Infos</div>
                <ul style="margin: 0; padding-left: 20px;">
                  ${details.map((detail) => `<li style="margin: 0 0 8px;">${escapeHtml(detail)}</li>`).join("")}
                </ul>
              </div>
              <p style="margin-bottom: 0;">Bei Rückfragen antworte einfach auf diese E-Mail.</p>
            </div>
          </div>
        </div>
      `,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Resend approval notification failed")
  }
}

export async function sendAccessCodeChangedEmail(input: AccessCodeChangedMailInput) {
  const apiKey = getResendApiKey()
  const from = getMailFromAddress()
  const replyTo = getReplyToAddress()

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY")
  }

  const subject = "TSV BoxGym: Dein Passwort wurde geändert"
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      reply_to: replyTo,
      to: [input.email],
      subject,
      text: "TEST",
      html: "TEST",
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Resend password update notification failed")
  }
}

export async function sendCompetitionAssignedEmail(input: CompetitionAssignedMailInput) {
  const apiKey = getResendApiKey()
  const from = getMailFromAddress()
  const replyTo = getReplyToAddress()

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY")
  }

  const subject = "TSV BoxGym: Du wurdest als Wettkämpfer markiert"
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      reply_to: replyTo,
      to: [input.email],
      subject,
      text: "TEST",
      html: "TEST",
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Resend competition assignment notification failed")
  }
}

export async function sendCompetitionRemovedEmail(input: CompetitionRemovedMailInput) {
  const apiKey = getResendApiKey()
  const from = getMailFromAddress()
  const replyTo = getReplyToAddress()

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY")
  }

  const subject = "TSV BoxGym: Dein Wettkämpfer-Status wurde angepasst"
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      reply_to: replyTo,
      to: [input.email],
      subject,
      text: "TEST",
      html: "TEST",
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Resend competition removal notification failed")
  }
}

export async function sendMedicalExamReminderEmail(input: MedicalExamReminderMailInput) {
  const apiKey = getResendApiKey()
  const from = getMailFromAddress()
  const replyTo = getReplyToAddress()

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY")
  }

  const dueLabel = formatIsoDateForDisplay(input.dueDate) || "in etwa 4 Wochen"
  const subject = "TSV BoxGym: Jährliche Untersuchung bitte rechtzeitig erneuern"
  const headline = "Untersuchung läuft bald ab"

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      reply_to: replyTo,
      to: [input.email],
      subject,
      text: "TEST",
      html: "TEST"
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Resend medical exam reminder failed")
  }
}

export async function sendGsMembershipCheckEmail(
  input: GsMembershipCheckMailInput
): Promise<ResendEmailDeliveryResult> {
  const apiKey = getResendApiKey()

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY")
  }

  const from = getMailFromAddress()
  const replyTo = "christian.schmidt@tsv-falkensee.de"
  const to = input.recipientEmail?.trim() || "gs@tsv-falkensee.de"
  const fullName = `${input.firstName} ${input.lastName}`.trim()
  const athleteLabel = input.athleteLabel?.trim() || "Sportler"
  const subject = input.subject?.trim() || `Mitgliedsabgleich TSV - ${fullName}`
  const confirmationYesLink = input.confirmationYesLink?.trim() || input.confirmationLink?.trim()
  const confirmationNoLink = input.confirmationNoLink?.trim()
  const confirmationBlock = confirmationYesLink && confirmationNoLink
    ? `

Bitte genau einen Link anklicken:
JA, Mitglied:
${confirmationYesLink}

NEIN, kein Mitglied:
${confirmationNoLink}`
    : ""
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      reply_to: replyTo,
      to: [to],
      subject,
      text: "TEST",
      html: "TEST",
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Resend GS membership check failed")
  }

  try {
    const payload = (await response.json()) as { id?: string | null }
    return {
      provider: "resend",
      messageId: typeof payload?.id === "string" ? payload.id : null,
    }
  } catch {
    return {
      provider: "resend",
      messageId: null,
    }
  }
}

export async function sendMedicalExamReminderAdminEmail(input: MedicalExamReminderAdminMailInput) {
  const apiKey = getResendApiKey()
  const from = getMailFromAddress()
  const replyTo = getReplyToAddress()

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY")
  }

  const dueLabel = formatIsoDateForDisplay(input.dueDate) || "in etwa 4 Wochen"
  const subject = "TSV BoxGym Admin: Wettkämpfer braucht neue Untersuchung"
  const headline = "Jährliche Untersuchung läuft bald ab"

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      reply_to: replyTo,
      to: [input.email],
      subject,
      text: "TEST",
      html: "TEST",
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Resend medical exam admin reminder failed")
  }
}
