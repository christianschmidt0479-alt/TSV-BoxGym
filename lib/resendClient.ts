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

import { getAdminNotificationAddress, getMailFromAddress, getReplyToAddress } from "@/lib/mailConfig"

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function getResendApiKey() {
  const serverKey = process.env.RESEND_API_KEY
  const devFallback = process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_RESEND_API_KEY : undefined
  return serverKey || devFallback
}

function getVerificationMailContent(input: VerificationMailInput) {
  if (input.kind === "trainer") {
    return {
      subject: "TSV BoxGym: Bitte Trainer-E-Mail bestaetigen",
      preheader: "Bestaetige deine E-Mail-Adresse fuer deinen Trainerzugang.",
      headline: "Trainerzugang bestaetigen",
      greeting: `Hallo${input.name ? ` ${escapeHtml(input.name)}` : ""},`,
      intro:
        "bitte bestaetige deine E-Mail-Adresse fuer deinen TSV BoxGym Trainerzugang.",
      steps: [
        "Bestaetigungslink in dieser E-Mail oeffnen",
        "Danach wartet dein Konto auf die finale Freigabe",
        "Erst nach der Freigabe ist der Trainerzugang aktiv",
      ],
      outro:
        "Falls du diese Registrierung nicht selbst gestartet hast, kannst du diese E-Mail einfach ignorieren.",
      cta: "Trainer-E-Mail bestaetigen",
    }
  }

  if (input.kind === "boxzwerge") {
    return {
      subject: "TSV BoxGym: Bitte Eltern-E-Mail bestaetigen",
      preheader: "Bestaetige die E-Mail-Adresse fuer die Boxzwerge-Registrierung.",
      headline: "Boxzwerge-Registrierung bestaetigen",
      greeting: `Hallo${input.name ? ` ${escapeHtml(input.name)}` : ""},`,
      intro:
        "bitte bestaetige die hinterlegte E-Mail-Adresse fuer die Boxzwerge-Registrierung. So koennen Rueckfragen, Trainingsinfos und wichtige Hinweise sicher zugestellt werden.",
      steps: [
        "Bestaetigungslink oeffnen",
        "Die Registrierung wird danach als bestaetigt markiert",
        "Der weitere Ablauf laeuft anschliessend ueber TSV BoxGym",
      ],
      outro:
        "Falls du diese Registrierung nicht selbst vorgenommen hast, melde dich bitte bei TSV BoxGym oder ignoriere diese E-Mail.",
      cta: "E-Mail bestaetigen",
    }
  }

  return {
    subject: "TSV BoxGym: Bitte E-Mail fuer dein Mitgliedskonto bestaetigen",
    preheader: "Bestaetige deine E-Mail-Adresse fuer dein Mitgliedskonto.",
    headline: "Mitgliedskonto bestaetigen",
    greeting: `Hallo${input.name ? ` ${escapeHtml(input.name)}` : ""},`,
    intro:
      "bitte bestaetige deine E-Mail-Adresse fuer dein TSV BoxGym Mitgliedskonto.",
    steps: [
      "Bestaetigungslink oeffnen",
      "Danach kann dein Konto vom Admin final freigegeben werden",
      "Bis dahin bleibt dein Status im System sichtbar",
    ],
    outro:
      "Falls du diese Registrierung nicht selbst gestartet hast, kannst du diese E-Mail ignorieren.",
    cta: "E-Mail bestaetigen",
  }
}

export async function sendVerificationEmail(input: VerificationMailInput) {
  const apiKey = getResendApiKey()
  const from = getMailFromAddress()
  const replyTo = getReplyToAddress()
  const content = getVerificationMailContent(input)

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
      from,
      reply_to: replyTo,
      to: [input.email],
      subject: content.subject,
      text: `${content.headline}

${content.greeting}

${content.intro}

${content.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}

Link: ${input.link}

${content.outro}

TSV BoxGym`,
      html: `
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
          ${content.preheader}
        </div>
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #18181b; background: #f4f4f5; padding: 24px;">
          <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #e4e4e7;">
            <div style="background: linear-gradient(135deg, #154c83 0%, #0f2740 100%); color: #ffffff; padding: 28px 28px 24px;">
              <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">TSV BoxGym</div>
              <h1 style="margin: 10px 0 0; font-size: 28px; line-height: 1.2;">${content.headline}</h1>
            </div>
            <div style="padding: 28px;">
              <p style="margin-top: 0;">${content.greeting}</p>
              <p>${content.intro}</p>
              <div style="margin: 20px 0; padding: 18px; border-radius: 16px; background: #f8fafc; border: 1px solid #dbeafe;">
                <div style="font-weight: 700; margin-bottom: 8px; color: #154c83;">So geht es weiter</div>
                <ol style="margin: 0; padding-left: 20px;">
                  ${content.steps.map((step) => `<li style="margin: 0 0 8px;">${escapeHtml(step)}</li>`).join("")}
                </ol>
              </div>
              <p>
                <a href="${input.link}" style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: #154c83; color: #ffffff; text-decoration: none; font-weight: 600;">
                  ${content.cta}
                </a>
              </p>
              <p style="margin-bottom: 6px;">Falls der Button nicht funktioniert, kannst du diesen Link direkt oeffnen:</p>
              <p style="word-break: break-word; margin-top: 0;"><a href="${input.link}">${input.link}</a></p>
              <p style="margin-bottom: 0;">${content.outro}</p>
            </div>
          </div>
          <div style="max-width: 640px; margin: 14px auto 0; font-size: 12px; color: #71717a; text-align: center;">
            TSV BoxGym · Antwort an ${escapeHtml(replyTo)}
          </div>
        </div>
      `,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Resend request failed")
  }
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
      text: `${labels[input.kind]}

Name: ${input.memberName}
E-Mail: ${input.email || "—"}
Gruppe: ${input.group || "—"}

Bitte im Adminbereich prüfen.

TSV BoxGym`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #18181b; background: #f4f4f5; padding: 24px;">
          <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #e4e4e7;">
            <div style="background: linear-gradient(135deg, #154c83 0%, #0f2740 100%); color: #ffffff; padding: 28px 28px 24px;">
              <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">TSV BoxGym</div>
              <h1 style="margin: 10px 0 0; font-size: 24px; line-height: 1.2;">${labels[input.kind]}</h1>
            </div>
            <div style="padding: 28px;">
              <p>Im System ist ein neuer Vorgang eingegangen.</p>
              <div style="margin: 20px 0; padding: 18px; border-radius: 16px; background: #f8fafc; border: 1px solid #dbeafe;">
                <div><strong>Name:</strong> ${escapeHtml(input.memberName)}</div>
                <div><strong>E-Mail:</strong> ${escapeHtml(input.email || "—")}</div>
                <div><strong>Gruppe:</strong> ${escapeHtml(input.group || "—")}</div>
              </div>
              <p>Bitte im Adminbereich prüfen und bei Bedarf freigeben.</p>
            </div>
          </div>
        </div>
      `,
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
      text: `TSV BoxGym Sammelmail ${input.dateLabel}

Neue Vorgänge gesamt: ${input.items.length}
Neue Boxbereich-Beitritte: ${counts.member}
Neue Trainerregistrierungen: ${counts.trainer}
Neue Boxzwerge-Registrierungen: ${counts.boxzwerge}

${input.items
  .map((item, index) => {
    const timeLabel = item.createdAt
      ? new Date(item.createdAt).toLocaleString("de-DE", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : "—"
    return `${index + 1}. ${labels[item.kind]} · ${item.memberName} · ${item.email || "—"} · ${item.group || "—"} · ${timeLabel}`
  })
  .join("\n")}

Bitte im Adminbereich prüfen.

TSV BoxGym`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #18181b; background: #f4f4f5; padding: 24px;">
          <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #e4e4e7;">
            <div style="background: linear-gradient(135deg, #154c83 0%, #0f2740 100%); color: #ffffff; padding: 28px 28px 24px;">
              <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">TSV BoxGym</div>
              <h1 style="margin: 10px 0 0; font-size: 24px; line-height: 1.2;">Admin-Sammelmail ${escapeHtml(input.dateLabel)}</h1>
            </div>
            <div style="padding: 28px;">
              <p>Diese Sammelmail enthält alle neuen Registrierungen seit der letzten Admin-Mail.</p>
              <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 20px 0;">
                <div style="padding: 14px; border-radius: 16px; background: #eff6ff; border: 1px solid #bfdbfe;">
                  <div style="font-size: 12px; color: #1d4ed8;">Gesamt</div>
                  <div style="font-size: 24px; font-weight: 700;">${input.items.length}</div>
                </div>
                <div style="padding: 14px; border-radius: 16px; background: #eff6ff; border: 1px solid #bfdbfe;">
                  <div style="font-size: 12px; color: #1d4ed8;">Boxbereich</div>
                  <div style="font-size: 24px; font-weight: 700;">${counts.member}</div>
                </div>
                <div style="padding: 14px; border-radius: 16px; background: #f5f3ff; border: 1px solid #ddd6fe;">
                  <div style="font-size: 12px; color: #6d28d9;">Trainer</div>
                  <div style="font-size: 24px; font-weight: 700;">${counts.trainer}</div>
                </div>
                <div style="padding: 14px; border-radius: 16px; background: #fff7ed; border: 1px solid #fed7aa;">
                  <div style="font-size: 12px; color: #c2410c;">Boxzwerge</div>
                  <div style="font-size: 24px; font-weight: 700;">${counts.boxzwerge}</div>
                </div>
              </div>
              <div style="margin-top: 18px; border: 1px solid #e4e4e7; border-radius: 16px; overflow: hidden;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <thead style="background: #f8fafc;">
                    <tr>
                      <th style="text-align:left; padding: 12px; border-bottom: 1px solid #e4e4e7;">Typ</th>
                      <th style="text-align:left; padding: 12px; border-bottom: 1px solid #e4e4e7;">Name</th>
                      <th style="text-align:left; padding: 12px; border-bottom: 1px solid #e4e4e7;">E-Mail</th>
                      <th style="text-align:left; padding: 12px; border-bottom: 1px solid #e4e4e7;">Gruppe</th>
                      <th style="text-align:left; padding: 12px; border-bottom: 1px solid #e4e4e7;">Eingang</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${input.items
                      .map((item) => {
                        const timeLabel = item.createdAt
                          ? new Date(item.createdAt).toLocaleString("de-DE", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"
                        return `
                          <tr>
                            <td style="padding: 12px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(labels[item.kind])}</td>
                            <td style="padding: 12px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(item.memberName)}</td>
                            <td style="padding: 12px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(item.email || "—")}</td>
                            <td style="padding: 12px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(item.group || "—")}</td>
                            <td style="padding: 12px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(timeLabel)}</td>
                          </tr>
                        `
                      })
                      .join("")}
                  </tbody>
                </table>
              </div>
              <p style="margin: 18px 0 0;">Bitte im Adminbereich prüfen und die offenen Rollen oder Freigaben bearbeiten.</p>
            </div>
          </div>
        </div>
      `,
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
    : [`Stammgruppe: ${input.group || "noch offen"}`, "Check-in und Mein Bereich koennen jetzt normal genutzt werden"]

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
              <p style="margin-bottom: 0;">Bei Rueckfragen antworte einfach auf diese E-Mail.</p>
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

  const isBoxzwerge = input.kind === "boxzwerge"
  const subject = isBoxzwerge
    ? "TSV BoxGym: Zugangscode fuer den Boxzwerge-Bereich wurde geaendert"
    : "TSV BoxGym: Dein Zugangscode wurde geaendert"
  const headline = "Zugangscode aktualisiert"
  const intro = isBoxzwerge
    ? "der Zugangscode fuer den Boxzwerge-Bereich wurde im System aktualisiert."
    : "dein Zugangscode fuer den Boxbereich wurde im System aktualisiert."

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

Bitte bei Rueckfragen direkt an TSV BoxGym wenden.

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
              <p>Falls du den neuen Zugangscode nicht kennst oder Rueckfragen hast, antworte bitte direkt auf diese E-Mail.</p>
            </div>
          </div>
        </div>
      `,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Resend access code update notification failed")
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
  const headline = "Wettkämpfer-Status gesetzt"
  const intro =
    "du wurdest vom Admin für die Wettkampfverwaltung markiert. Deine Daten können jetzt im Wettkampfbereich gepflegt und vorbereitet werden."

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

Bitte prüfe und ergänze jetzt deine Wettkampfdaten:
- Lizenznummer
- letzte ärztliche Untersuchung
- aktuelle Wettkampfbilanz

Wenn etwas fehlt, melde dich bitte direkt beim Trainerteam oder antworte auf diese E-Mail.

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
                <div style="font-weight: 700; margin-bottom: 8px; color: #154c83;">Wichtig</div>
                <ul style="margin: 0; padding-left: 20px;">
                  <li style="margin: 0 0 8px;">Bitte Lizenznummer und letzte ärztliche Untersuchung prüfen</li>
                  <li style="margin: 0 0 8px;">Bitte auch die aktuelle Wettkampfbilanz vervollständigen lassen</li>
                  <li style="margin: 0;">Bei Rückfragen oder fehlenden Angaben antworte direkt auf diese E-Mail</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      `,
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
  const headline = "Wettkämpfer-Status geändert"
  const intro =
    "dein Eintrag in der Wettkampfverwaltung wurde vom Admin angepasst. Du stehst aktuell nicht mehr auf der aktiven Wettkampfliste."

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

Bei Rückfragen melde dich bitte direkt bei TSV BoxGym.

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
              <p>Wenn du Rückfragen dazu hast, antworte bitte direkt auf diese E-Mail.</p>
            </div>
          </div>
        </div>
      `,
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

  const dueLabel = input.dueDate
    ? new Date(`${input.dueDate}T12:00:00`).toLocaleDateString("de-DE")
    : "in etwa 4 Wochen"
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
      text: `${headline}

Hallo${input.name ? ` ${input.name}` : ""},

deine jährliche ärztliche Untersuchung für den Wettkampfbereich läuft bald ab. Bitte kümmere dich rechtzeitig um eine neue Untersuchung.

Voraussichtliches Ablaufdatum: ${dueLabel}

Wenn der neue Termin erfolgt ist, gib die Information bitte an TSV BoxGym weiter.

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
              <p>deine jährliche ärztliche Untersuchung für den Wettkampfbereich läuft bald ab. Bitte kümmere dich rechtzeitig um eine neue Untersuchung.</p>
              <div style="margin: 20px 0; padding: 18px; border-radius: 16px; background: #f8fafc; border: 1px solid #dbeafe;">
                <div style="font-weight: 700; margin-bottom: 8px; color: #154c83;">Wichtig</div>
                <div>Voraussichtliches Ablaufdatum: <strong>${escapeHtml(dueLabel)}</strong></div>
                <div>Bitte die neue Untersuchung rechtzeitig organisieren.</div>
              </div>
              <p style="margin-bottom: 0;">Wenn der neue Termin erfolgt ist, gib die Information bitte an TSV BoxGym weiter.</p>
            </div>
          </div>
        </div>
      `,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Resend medical exam reminder failed")
  }
}

export async function sendMedicalExamReminderAdminEmail(input: MedicalExamReminderAdminMailInput) {
  const apiKey = getResendApiKey()
  const from = getMailFromAddress()
  const replyTo = getReplyToAddress()

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY")
  }

  const dueLabel = input.dueDate
    ? new Date(`${input.dueDate}T12:00:00`).toLocaleDateString("de-DE")
    : "in etwa 4 Wochen"
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
      text: `${headline}

Sportler: ${input.athleteName || "—"}
Ablaufdatum: ${dueLabel}

Bitte neue jährliche Untersuchung rechtzeitig anstoßen oder nachhalten.

TSV BoxGym`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #18181b; background: #f4f4f5; padding: 24px;">
          <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #e4e4e7;">
            <div style="background: linear-gradient(135deg, #154c83 0%, #0f2740 100%); color: #ffffff; padding: 28px 28px 24px;">
              <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85;">TSV BoxGym</div>
              <h1 style="margin: 10px 0 0; font-size: 24px; line-height: 1.2;">${headline}</h1>
            </div>
            <div style="padding: 28px;">
              <p>Für einen aktiven Wettkämpfer steht die jährliche Untersuchung vor dem Ablauf.</p>
              <div style="margin: 20px 0; padding: 18px; border-radius: 16px; background: #f8fafc; border: 1px solid #dbeafe;">
                <div><strong>Sportler:</strong> ${escapeHtml(input.athleteName || "—")}</div>
                <div><strong>Ablaufdatum:</strong> ${escapeHtml(dueLabel)}</div>
              </div>
              <p style="margin-bottom: 0;">Bitte neue jährliche Untersuchung rechtzeitig anstoßen oder nachhalten.</p>
            </div>
          </div>
        </div>
      `,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || "Resend medical exam admin reminder failed")
  }
}
