import { createGsMembershipConfirmationLinks } from "@/lib/gsMembershipConfirmation"
import { getAppBaseUrl, getReplyToAddress } from "@/lib/mailConfig"

type MailKind = "member" | "trainer" | "boxzwerge"

export type AdminMailDraftRequest =
  | {
      kind: "gs_request"
      memberId?: string
      firstName: string
      lastName: string
      birthdate: string
      recipientEmail?: string
      subject?: string
      athleteLabel?: string
      confirmationYesLink?: string
      confirmationNoLink?: string
      confirmationLink?: string
    }
  | {
      kind: "verification_member"
      memberId: string
      email: string
      name?: string
      targetKind?: MailKind
    }
  | {
      kind: "verification"
      email: string
      name?: string
      link: string
      targetKind?: MailKind
    }
  | {
      kind: "approval_notice"
      email: string
      name?: string
      targetKind: MailKind
      group?: string
    }
  | {
      kind: "access_code_changed"
      email: string
      name?: string
      targetKind: Extract<MailKind, "member" | "boxzwerge">
    }
  | {
      kind: "competition_assigned"
      email: string
      name?: string
    }
  | {
      kind: "competition_removed"
      email: string
      name?: string
    }

export type AdminMailDraftPreview = {
  kind: AdminMailDraftRequest["kind"]
  to: string
  subject: string
  body: string
  replyTo: string
  successMessage: string
  auditAction: string
  auditTargetType: string
  auditTargetName: string
  auditDetailsPrefix: string
}

function escapeName(value?: string) {
  return value?.trim() ?? ""
}

function formatBirthdateLabel(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return null
  }

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmedValue)) {
    return trimmedValue
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    const [year, month, day] = trimmedValue.split("-").map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))

    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null
    }

    return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(date)
  }

  const parsed = new Date(trimmedValue)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(parsed)
}

function getVerificationCopy(targetKind: MailKind | undefined, name?: string, link?: string) {
  if (!link?.trim()) {
    throw new Error("Link für Verifizierungs-Mail fehlt.")
  }

  if (targetKind === "trainer") {
    return {
      subject: "TSV BoxGym: Bitte Trainer-E-Mail bestaetigen",
      body: `Trainerzugang bestaetigen

Hallo${name ? ` ${name}` : ""},

bitte bestaetige deine E-Mail-Adresse fuer deinen TSV BoxGym Trainerzugang.

1. Bestaetigungslink in dieser E-Mail oeffnen
2. Danach wartet dein Konto auf die finale Freigabe
3. Erst nach der Freigabe ist der Trainerzugang aktiv

Link: ${link}

Falls du diese Registrierung nicht selbst gestartet hast, kannst du diese E-Mail einfach ignorieren.

TSV BoxGym`,
    }
  }

  if (targetKind === "boxzwerge") {
    return {
      subject: "TSV BoxGym: Bitte Eltern-E-Mail bestaetigen",
      body: `Boxzwerge-Registrierung bestaetigen

Hallo${name ? ` ${name}` : ""},

bitte bestaetige die hinterlegte E-Mail-Adresse fuer die Boxzwerge-Registrierung. So koennen Rueckfragen, Trainingsinfos und wichtige Hinweise sicher zugestellt werden.

1. Bestaetigungslink oeffnen
2. Die Registrierung wird danach als bestaetigt markiert
3. Der weitere Ablauf laeuft anschliessend ueber TSV BoxGym

Link: ${link}

Falls du diese Registrierung nicht selbst vorgenommen hast, melde dich bitte bei TSV BoxGym oder ignoriere diese E-Mail.

TSV BoxGym`,
    }
  }

  return {
    subject: "TSV BoxGym: Bitte E-Mail fuer dein Mitgliedskonto bestaetigen",
    body: `Mitgliedskonto bestaetigen

Hallo${name ? ` ${name}` : ""},

bitte bestaetige deine E-Mail-Adresse fuer dein TSV BoxGym Mitgliedskonto.

1. Bestaetigungslink oeffnen
2. Danach kann dein Konto vom Admin final freigegeben werden
3. Bis dahin bleibt dein Status im System sichtbar

Link: ${link}

Falls du diese Registrierung nicht selbst gestartet hast, kannst du diese E-Mail ignorieren.

TSV BoxGym`,
  }
}

function getApprovalCopy(request: Extract<AdminMailDraftRequest, { kind: "approval_notice" }>) {
  const isTrainer = request.targetKind === "trainer"
  const isBoxzwerge = request.targetKind === "boxzwerge"
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
    : [`Stammgruppe: ${request.group || "noch offen"}`, "Check-in und Mein Bereich koennen jetzt normal genutzt werden"]

  return {
    subject,
    body: `${headline}

Hallo${request.name ? ` ${request.name}` : ""},

${intro}

${details.map((detail, index) => `${index + 1}. ${detail}`).join("\n")}

Bei Rueckfragen antworte einfach auf diese E-Mail.

TSV BoxGym`,
  }
}

function getAccessCodeChangedCopy(request: Extract<AdminMailDraftRequest, { kind: "access_code_changed" }>) {
  const isBoxzwerge = request.targetKind === "boxzwerge"
  const subject = isBoxzwerge
    ? "TSV BoxGym: Zugangscode fuer den Boxzwerge-Bereich wurde geaendert"
    : "TSV BoxGym: Dein Zugangscode wurde geaendert"

  return {
    subject,
    body: `Zugangscode aktualisiert

Hallo${request.name ? ` ${request.name}` : ""},

${isBoxzwerge ? "der Zugangscode fuer den Boxzwerge-Bereich wurde im System aktualisiert." : "dein Zugangscode fuer den Boxbereich wurde im System aktualisiert."}

Falls du den neuen Zugangscode nicht kennst oder Rueckfragen hast, antworte bitte direkt auf diese E-Mail.

TSV BoxGym`,
  }
}

function getCompetitionAssignedCopy(request: Extract<AdminMailDraftRequest, { kind: "competition_assigned" }>) {
  return {
    subject: "TSV BoxGym: Du wurdest als Wettkämpfer markiert",
    body: `Wettkämpfer-Status gesetzt

Hallo${request.name ? ` ${request.name}` : ""},

du wurdest vom Admin für die Wettkampfverwaltung markiert. Deine Daten können jetzt im Wettkampfbereich gepflegt und vorbereitet werden.

Bitte prüfe und ergänze jetzt deine Wettkampfdaten:
- Lizenznummer
- letzte ärztliche Untersuchung
- aktuelle Wettkampfbilanz

Wenn etwas fehlt, melde dich bitte direkt beim Trainerteam oder antworte auf diese E-Mail.

TSV BoxGym`,
  }
}

function getCompetitionRemovedCopy(request: Extract<AdminMailDraftRequest, { kind: "competition_removed" }>) {
  return {
    subject: "TSV BoxGym: Dein Wettkämpfer-Status wurde angepasst",
    body: `Wettkämpfer-Status geändert

Hallo${request.name ? ` ${request.name}` : ""},

dein Eintrag in der Wettkampfverwaltung wurde vom Admin angepasst. Du stehst aktuell nicht mehr auf der aktiven Wettkampfliste.

Wenn du Rückfragen dazu hast, antworte bitte direkt auf diese E-Mail.

TSV BoxGym`,
  }
}

function getGsRequestCopy(request: Extract<AdminMailDraftRequest, { kind: "gs_request" }>) {
  const firstName = request.firstName.trim()
  const lastName = request.lastName.trim()
  const birthdateLabel = formatBirthdateLabel(request.birthdate)

  if (!firstName || !lastName || !birthdateLabel) {
    throw new Error("Vorname, Nachname oder Geburtsdatum für GS-Anfrage sind ungültig.")
  }

  const fullName = `${firstName} ${lastName}`.trim()
  const athleteLabel = request.athleteLabel?.trim() || "Sportler"
  const generatedLinks = request.memberId?.trim()
    ? createGsMembershipConfirmationLinks(request.memberId.trim(), getAppBaseUrl())
    : null
  const confirmationYesLink = request.confirmationYesLink?.trim() || request.confirmationLink?.trim() || generatedLinks?.yesLink || ""
  const confirmationNoLink = request.confirmationNoLink?.trim() || generatedLinks?.noLink || ""
  const confirmationBlock = confirmationYesLink && confirmationNoLink
    ? `\n\nBitte genau einen Link anklicken:\nJA, Mitglied:\n${confirmationYesLink}\n\nNEIN, kein Mitglied:\n${confirmationNoLink}`
    : ""

  return {
    to: request.recipientEmail?.trim() || "gs@tsv-falkensee.de",
    replyTo: "christian.schmidt@tsv-falkensee.de",
    subject: request.subject?.trim() || `Mitgliedsabgleich TSV - ${fullName}`,
    body: `Liebe GS,

bitte prüft, ob ${athleteLabel} ${fullName}, geboren am ${birthdateLabel}, Mitglied in unserem Verein ist.${confirmationBlock}

Vielen Dank.

Liebe Grüße
Christian`,
    auditTargetName: fullName,
    auditDetailsPrefix: `GS-Anfrage gesendet an ${request.recipientEmail?.trim() || "gs@tsv-falkensee.de"} für Geburtsdatum ${birthdateLabel}`,
  }
}

export function buildAdminMailDraftPreview(request: AdminMailDraftRequest): AdminMailDraftPreview {
  if (request.kind === "verification_member") {
    throw new Error("verification_member muss vor dem Preview in verification aufgelöst werden.")
  }

  if (request.kind === "verification") {
    const copy = getVerificationCopy(request.targetKind, escapeName(request.name), request.link)
    return {
      kind: request.kind,
      to: request.email.trim().toLowerCase(),
      subject: copy.subject,
      body: copy.body,
      replyTo: getReplyToAddress(),
      successMessage: "Bestätigungs-Mail versendet",
      auditAction: "member_verification_resent",
      auditTargetType: request.targetKind || "member",
      auditTargetName: escapeName(request.name) || request.email.trim().toLowerCase(),
      auditDetailsPrefix: "Verification email resent to",
    }
  }

  if (request.kind === "approval_notice") {
    const copy = getApprovalCopy(request)
    return {
      kind: request.kind,
      to: request.email.trim().toLowerCase(),
      subject: copy.subject,
      body: copy.body,
      replyTo: getReplyToAddress(),
      successMessage: "Freigabe-Mail versendet",
      auditAction: "approval_notice_sent",
      auditTargetType: request.targetKind,
      auditTargetName: escapeName(request.name) || request.email.trim().toLowerCase(),
      auditDetailsPrefix: `Mail an ${request.email.trim().toLowerCase()}${request.group ? `, Gruppe: ${request.group}` : ""}`,
    }
  }

  if (request.kind === "access_code_changed") {
    const copy = getAccessCodeChangedCopy(request)
    return {
      kind: request.kind,
      to: request.email.trim().toLowerCase(),
      subject: copy.subject,
      body: copy.body,
      replyTo: getReplyToAddress(),
      successMessage: "Zugangscode-Mail versendet",
      auditAction: "access_code_changed_notice_sent",
      auditTargetType: request.targetKind,
      auditTargetName: escapeName(request.name) || request.email.trim().toLowerCase(),
      auditDetailsPrefix: `Mail an ${request.email.trim().toLowerCase()}`,
    }
  }

  if (request.kind === "competition_assigned") {
    const copy = getCompetitionAssignedCopy(request)
    return {
      kind: request.kind,
      to: request.email.trim().toLowerCase(),
      subject: copy.subject,
      body: copy.body,
      replyTo: getReplyToAddress(),
      successMessage: "Wettkampf-Mail versendet",
      auditAction: "competition_assigned_notice_sent",
      auditTargetType: "member",
      auditTargetName: escapeName(request.name) || request.email.trim().toLowerCase(),
      auditDetailsPrefix: `Mail an ${request.email.trim().toLowerCase()}`,
    }
  }

  if (request.kind === "competition_removed") {
    const copy = getCompetitionRemovedCopy(request)
    return {
      kind: request.kind,
      to: request.email.trim().toLowerCase(),
      subject: copy.subject,
      body: copy.body,
      replyTo: getReplyToAddress(),
      successMessage: "Wettkampf-Mail versendet",
      auditAction: "competition_removed_notice_sent",
      auditTargetType: "member",
      auditTargetName: escapeName(request.name) || request.email.trim().toLowerCase(),
      auditDetailsPrefix: `Mail an ${request.email.trim().toLowerCase()}`,
    }
  }

  const copy = getGsRequestCopy(request)
  return {
    kind: request.kind,
    to: copy.to,
    subject: copy.subject,
    body: copy.body,
    replyTo: copy.replyTo,
    successMessage: request.recipientEmail?.trim() ? "Test-Mail versendet" : "GS-Anfrage versendet",
    auditAction: "member_gs_request_sent",
    auditTargetType: "member",
    auditTargetName: copy.auditTargetName,
    auditDetailsPrefix: copy.auditDetailsPrefix,
  }
}