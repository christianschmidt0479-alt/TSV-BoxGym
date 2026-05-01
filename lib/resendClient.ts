import { formatDisplayDateTime, formatIsoDateForDisplay } from "@/lib/dateFormat"
import { DEFAULT_MAIL_FROM, DEFAULT_REPLY_TO, getAdminNotificationAddress } from "@/lib/mailConfig"
import { buildBaseMailLayout, escapeMailHtml, renderTextAsMailContent } from "@/lib/mail/baseMailLayout"
import { sendMemberVerificationMail } from "./mail/memberVerificationMail"

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

function getResendApiKey() {
  const serverKey = process.env.RESEND_API_KEY
  const devFallback = process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_RESEND_API_KEY : undefined
  return serverKey || devFallback
}

async function sendMailWithResend(input: {
  to: string
  subject: string
  text: string
  html: string
}): Promise<ResendEmailDeliveryResult> {
  const apiKey = getResendApiKey()
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY")
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: DEFAULT_MAIL_FROM,
      reply_to: DEFAULT_REPLY_TO,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(raw || "Resend request failed")
  }

  try {
    const payload = JSON.parse(raw) as { id?: string | null }
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

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function renderMailFromText(title: string, text: string) {
  return buildBaseMailLayout({
    title,
    content: renderTextAsMailContent(text),
  })
}

export async function sendVerificationEmail(input: unknown): Promise<void> {
  if (input && typeof input === "object" && "token" in input && "email" in input) {
    const token = typeof (input as { token?: unknown }).token === "string" ? (input as { token: string }).token : ""
    const email = typeof (input as { email?: unknown }).email === "string" ? (input as { email: string }).email : ""
    if (!token.trim() || !email.trim()) {
      throw new Error("sendVerificationEmail: token oder email fehlt")
    }
    await sendMemberVerificationMail({ email: normalizeEmail(email), token })
    return
  }

  const legacy = input as Partial<VerificationMailInput> | null
  if (!legacy || typeof legacy.email !== "string") {
    throw new Error("sendVerificationEmail: Ungültige Parameter")
  }

  const email = normalizeEmail(legacy.email)
  const link = typeof legacy.link === "string" ? legacy.link.trim() : ""
  if (!link) {
    throw new Error("sendVerificationEmail: link fehlt")
  }

  const subject = legacy.kind === "trainer"
    ? "TSV BoxGym: Bitte Trainer-E-Mail bestätigen"
    : legacy.kind === "boxzwerge"
      ? "TSV BoxGym: Bitte Eltern-E-Mail bestätigen"
      : "TSV BoxGym: Bitte E-Mail für dein Mitgliedskonto bestätigen"

  const text = [
    `Hallo${legacy.name?.trim() ? ` ${legacy.name.trim()}` : ""},`,
    "",
    "bitte bestätige deine E-Mail-Adresse über diesen Link:",
    link,
    "",
    "Falls du diese Registrierung nicht selbst gestartet hast, ignoriere diese E-Mail.",
    "",
    "TSV BoxGym",
  ].join("\n")

  const html = buildBaseMailLayout({
    title: "E-Mail-Adresse bestätigen",
    ctaLabel: "E-Mail bestätigen",
    ctaUrl: link,
    content: `
      <p style="margin:0 0 14px;color:#1f2937;font-size:15px;line-height:1.6;">Hallo${legacy.name?.trim() ? ` ${escapeMailHtml(legacy.name.trim())}` : ""},</p>
      <p style="margin:0 0 16px;color:#1f2937;font-size:15px;line-height:1.6;">Bitte bestätige deine E-Mail-Adresse über den folgenden Link:</p>
      <p style="margin:0 0 16px;color:#6b7280;font-size:13px;line-height:1.6;">Falls der Button nicht funktioniert, nutze diesen Link:<br /><a href="${escapeMailHtml(link)}" style="color:#154c83;word-break:break-all;">${escapeMailHtml(link)}</a></p>
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">Falls du diese Registrierung nicht selbst gestartet hast, ignoriere diese E-Mail.</p>
    `,
  })

  await sendMailWithResend({ to: email, subject, text, html })
}

export async function sendCustomEmail(input: {
  to: string
  subject: string
  text: string
  replyTo?: string
}): Promise<ResendEmailDeliveryResult> {
  const subject = input.subject.trim() || "TSV BoxGym"
  const text = input.text.trim()
  const html = renderMailFromText(subject, text)

  return sendMailWithResend({
    to: normalizeEmail(input.to),
    subject,
    text,
    html,
  })
}

export async function sendAdminNotificationEmail(input: AdminNotificationInput) {
  const labels = {
    member: "Neue Registrierung im Boxbereich",
    trainer: "Neue Trainerregistrierung",
    boxzwerge: "Neue Boxzwerge-Registrierung",
  } as const

  const subject = `TSV BoxGym Admin: ${labels[input.kind]}`
  const text = [
    labels[input.kind],
    "",
    `Name: ${input.memberName}`,
    `E-Mail: ${input.email?.trim() || "-"}`,
    `Gruppe: ${input.group?.trim() || "-"}`,
    "",
    "TSV BoxGym",
  ].join("\n")

  await sendMailWithResend({
    to: normalizeEmail(getAdminNotificationAddress()),
    subject,
    text,
    html: renderMailFromText(subject, text),
  })
}

export async function sendAdminDigestEmail(input: AdminDigestMailInput) {
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
  const lines = [
    `Neue Registrierungen (${input.dateLabel})`,
    "",
    `Boxbereich: ${counts.member}`,
    `Trainer: ${counts.trainer}`,
    `Boxzwerge: ${counts.boxzwerge}`,
    "",
  ]

  for (const item of input.items) {
    const createdAtLabel = item.createdAt && !Number.isNaN(new Date(item.createdAt).getTime())
      ? formatDisplayDateTime(new Date(item.createdAt))
      : "unbekannt"
    lines.push(
      `- ${labels[item.kind]} | ${item.memberName} | ${item.email?.trim() || "-"} | ${item.group?.trim() || "-"} | ${createdAtLabel}`
    )
  }

  lines.push("", "TSV BoxGym")
  const text = lines.join("\n")

  await sendMailWithResend({
    to: normalizeEmail(getAdminNotificationAddress()),
    subject,
    text,
    html: renderMailFromText(subject, text),
  })
}

export async function sendApprovalEmail(input: ApprovalMailInput) {
  const isTrainer = input.kind === "trainer"
  const isBoxzwerge = input.kind === "boxzwerge"
  const subject = isTrainer
    ? "TSV BoxGym: Dein Trainerzugang wurde freigegeben"
    : isBoxzwerge
      ? "TSV BoxGym: Boxzwerge-Zugang wurde freigegeben"
      : "TSV BoxGym: Dein Boxbereich-Zugang wurde freigegeben"

  const intro = isTrainer
    ? "dein Trainerzugang wurde vom Admin freigegeben und ist jetzt aktiv."
    : isBoxzwerge
      ? "der Zugang zum Boxzwerge-Bereich wurde freigegeben und kann jetzt genutzt werden."
      : "dein Zugang zum Boxbereich wurde vom Admin freigegeben und kann jetzt genutzt werden."

  const details = isTrainer
    ? ["Trainerbereich kann jetzt genutzt werden", "Login weiter mit E-Mail und Passwort"]
    : [`Stammgruppe: ${input.group || "noch offen"}`, "Check-in und Mein Bereich können jetzt normal genutzt werden"]

  const text = [
    `Hallo${input.name?.trim() ? ` ${input.name.trim()}` : ""},`,
    "",
    intro,
    "",
    ...details.map((detail, index) => `${index + 1}. ${detail}`),
    "",
    "Bei Rückfragen antworte einfach auf diese E-Mail.",
    "",
    "TSV BoxGym",
  ].join("\n")

  await sendMailWithResend({
    to: normalizeEmail(input.email),
    subject,
    text,
    html: renderMailFromText(subject, text),
  })
}

export async function sendAccessCodeChangedEmail(input: AccessCodeChangedMailInput) {
  const subject = input.kind === "boxzwerge"
    ? "TSV BoxGym: Passwort für den Boxzwerge-Bereich wurde geändert"
    : "TSV BoxGym: Dein Passwort wurde geändert"

  const text = [
    `Hallo${input.name?.trim() ? ` ${input.name.trim()}` : ""},`,
    "",
    "dein Passwort wurde im System aktualisiert.",
    "Falls du das nicht warst, antworte bitte direkt auf diese E-Mail.",
    "",
    "TSV BoxGym",
  ].join("\n")

  await sendMailWithResend({
    to: normalizeEmail(input.email),
    subject,
    text,
    html: renderMailFromText(subject, text),
  })
}

export async function sendCompetitionAssignedEmail(input: CompetitionAssignedMailInput) {
  const subject = "TSV BoxGym: Du wurdest als Wettkämpfer markiert"
  const text = [
    `Hallo${input.name?.trim() ? ` ${input.name.trim()}` : ""},`,
    "",
    "du wurdest für die Wettkampfverwaltung markiert.",
    "Bitte prüfe und ergänze bei Bedarf deine Wettkampfdaten.",
    "",
    "TSV BoxGym",
  ].join("\n")

  await sendMailWithResend({
    to: normalizeEmail(input.email),
    subject,
    text,
    html: renderMailFromText(subject, text),
  })
}

export async function sendCompetitionRemovedEmail(input: CompetitionRemovedMailInput) {
  const subject = "TSV BoxGym: Dein Wettkämpfer-Status wurde angepasst"
  const text = [
    `Hallo${input.name?.trim() ? ` ${input.name.trim()}` : ""},`,
    "",
    "dein Eintrag in der Wettkampfverwaltung wurde angepasst.",
    "",
    "TSV BoxGym",
  ].join("\n")

  await sendMailWithResend({
    to: normalizeEmail(input.email),
    subject,
    text,
    html: renderMailFromText(subject, text),
  })
}

export async function sendMedicalExamReminderEmail(input: MedicalExamReminderMailInput) {
  const dueLabel = formatIsoDateForDisplay(input.dueDate) || "in etwa 4 Wochen"
  const subject = "TSV BoxGym: Jährliche Untersuchung bitte rechtzeitig erneuern"
  const text = [
    `Hallo${input.name?.trim() ? ` ${input.name.trim()}` : ""},`,
    "",
    "deine jährliche ärztliche Untersuchung für den Wettkampfbereich läuft bald ab.",
    `Voraussichtliches Ablaufdatum: ${dueLabel}`,
    "",
    "TSV BoxGym",
  ].join("\n")

  await sendMailWithResend({
    to: normalizeEmail(input.email),
    subject,
    text,
    html: renderMailFromText(subject, text),
  })
}

export async function sendGsMembershipCheckEmail(input: GsMembershipCheckMailInput): Promise<ResendEmailDeliveryResult> {
  const to = input.recipientEmail?.trim() || "gs@tsv-falkensee.de"
  const fullName = `${input.firstName} ${input.lastName}`.trim()
  const athleteLabel = input.athleteLabel?.trim() || "Sportler"
  const subject = input.subject?.trim() || `Mitgliedsabgleich TSV - ${fullName}`

  const confirmationYesLink = input.confirmationYesLink?.trim() || input.confirmationLink?.trim() || ""
  const confirmationNoLink = input.confirmationNoLink?.trim() || ""

  const textParts = [
    "Liebe GS,",
    "",
    `bitte prüft, ob ${athleteLabel} ${fullName}, geboren am ${input.birthdateLabel}, Mitglied in unserem Verein ist.`,
  ]

  if (confirmationYesLink && confirmationNoLink) {
    textParts.push(
      "",
      "Bitte genau einen Link anklicken:",
      `JA, Mitglied: ${confirmationYesLink}`,
      `NEIN, kein Mitglied: ${confirmationNoLink}`,
    )
  }

  textParts.push("", "Vielen Dank.", "", "Liebe Grüße", "Christian")
  const text = textParts.join("\n")

  return sendMailWithResend({
    to: normalizeEmail(to),
    subject,
    text,
    html: renderMailFromText(subject, text),
  })
}

export async function sendMedicalExamReminderAdminEmail(input: MedicalExamReminderAdminMailInput) {
  const dueLabel = formatIsoDateForDisplay(input.dueDate) || "in etwa 4 Wochen"
  const subject = "TSV BoxGym Admin: Wettkämpfer braucht neue Untersuchung"
  const text = [
    "Hinweis für Wettkampfverwaltung",
    "",
    `Athlet: ${input.athleteName?.trim() || "-"}`,
    `Ablaufdatum: ${dueLabel}`,
    "",
    "TSV BoxGym",
  ].join("\n")

  await sendMailWithResend({
    to: normalizeEmail(input.email),
    subject,
    text,
    html: renderMailFromText(subject, text),
  })
}
