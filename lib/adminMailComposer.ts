import { createGsMembershipConfirmationLinks } from "@/lib/gsMembershipConfirmation"
import { formatDateInputForDisplay, formatIsoDateForDisplay } from "@/lib/dateFormat"
import { createMemberUpdateLink } from "@/lib/memberUpdateTokens"
import { getAppBaseUrl, getReplyToAddress } from "@/lib/mailConfig"

type MailKind = "member" | "trainer" | "boxzwerge"
type ApprovalFollowupTopicId = "email_confirmation" | "data_review" | "gs_correction" | "missing_details" | "general_followup"

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
      kind: "approval_followup"
      memberId?: string
      email: string
      name?: string
      targetKind: MailKind
      topicIds?: ApprovalFollowupTopicId[]
      correctionLink?: string
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
  | {
      kind: "medical_exam_reminder"
      email: string
      name?: string
      dueDate?: string
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
  topicSuggestions?: Array<{
    id: string
    label: string
    subject: string
    body: string
  }>
}

function escapeName(value?: string) {
  return value?.trim() ?? ""
}

function formatBirthdateLabel(value: string) {
  return formatDateInputForDisplay(value)
}

function getVerificationCopy(targetKind: MailKind | undefined, name?: string, link?: string) {
  if (!link?.trim()) {
    throw new Error("Link für Verifizierungs-Mail fehlt.")
  }

  if (targetKind === "trainer") {
    return {
      subject: "TSV BoxGym: Bitte Trainer-E-Mail bestätigen",
      body: `Trainerzugang bestätigen

Hallo${name ? ` ${name}` : ""},

bitte bestätige deine E-Mail-Adresse für deinen TSV BoxGym Trainerzugang.

1. Bestätigungslink in dieser E-Mail öffnen
2. Danach wartet dein Konto auf die finale Freigabe
3. Erst nach der Freigabe ist der Trainerzugang aktiv

Link: ${link}

Falls du diese Registrierung nicht selbst gestartet hast, kannst du diese E-Mail einfach ignorieren.

TSV BoxGym`,
    }
  }

  if (targetKind === "boxzwerge") {
    return {
      subject: "TSV BoxGym: Bitte Eltern-E-Mail bestätigen",
      body: `Boxzwerge-Registrierung bestätigen

Hallo${name ? ` ${name}` : ""},

bitte bestätige die hinterlegte E-Mail-Adresse für die Boxzwerge-Registrierung. So können Rückfragen, Trainingsinfos und wichtige Hinweise sicher zugestellt werden.

1. Bestätigungslink öffnen
2. Die Registrierung wird danach als bestätigt markiert
3. Der weitere Ablauf läuft anschliessend über TSV BoxGym

Link: ${link}

Falls du diese Registrierung nicht selbst vorgenommen hast, melde dich bitte bei TSV BoxGym oder ignoriere diese E-Mail.

TSV BoxGym`,
    }
  }

  return {
    subject: "TSV BoxGym: Bitte E-Mail für dein Mitgliedskonto bestätigen",
    body: `Mitgliedskonto bestätigen

Hallo${name ? ` ${name}` : ""},

bitte bestätige deine E-Mail-Adresse für dein TSV BoxGym Mitgliedskonto.

1. Bestätigungslink öffnen
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
    : [`Stammgruppe: ${request.group || "noch offen"}`, "Check-in und Mein Bereich können jetzt normal genutzt werden"]

  return {
    subject,
    body: `${headline}

Hallo${request.name ? ` ${request.name}` : ""},

${intro}

${details.map((detail, index) => `${index + 1}. ${detail}`).join("\n")}

Bei Rückfragen antworte einfach auf diese E-Mail.

TSV BoxGym`,
  }
}

function getAccessCodeChangedCopy(request: Extract<AdminMailDraftRequest, { kind: "access_code_changed" }>) {
  const isBoxzwerge = request.targetKind === "boxzwerge"
  const subject = isBoxzwerge
    ? "TSV BoxGym: Passwort für den Boxzwerge-Bereich wurde geändert"
    : "TSV BoxGym: Dein Passwort wurde geändert"

  return {
    subject,
    body: `Passwort aktualisiert

Hallo${request.name ? ` ${request.name}` : ""},

${isBoxzwerge ? "das Passwort für den Boxzwerge-Bereich wurde im System aktualisiert." : "dein Passwort für den Boxbereich wurde im System aktualisiert."}

Falls du das neue Passwort nicht kennst oder Rückfragen hast, antworte bitte direkt auf diese E-Mail.

TSV BoxGym`,
  }
}

async function getApprovalFollowupTopics(
  request: Extract<AdminMailDraftRequest, { kind: "approval_followup" }>,
  options?: { generateDynamicLinks?: boolean; baseUrl?: string }
) {
  const name = escapeName(request.name)
  const salutation = `Hallo${name ? ` ${name}` : ""},`
  const correctionHint = request.correctionLink?.trim()
    ? `

Falls du deine Angaben direkt selbst anpassen möchtest, nutze bitte diesen Link:
${request.correctionLink.trim()}`
    : ""
  const shouldGenerateDynamicLinks = options?.generateDynamicLinks !== false
  const updateLink =
    shouldGenerateDynamicLinks && request.memberId && request.targetKind !== "trainer"
      ? (await createMemberUpdateLink(request.memberId, { baseUrl: options?.baseUrl })).url
      : request.correctionLink?.trim() || ""
  const updateLinkBlock = updateLink
    ? `

Du kannst deine Daten hier sicher überprüfen und ggf. korrigieren:
${updateLink}

Aus Sicherheitsgründen ist eine Passwortbestätigung erforderlich.`
    : ""

  const allTopics = {
    email_confirmation: {
      id: "email_confirmation",
      label: "Bitte E-Mail bestätigen",
      subject: request.targetKind === "trainer"
        ? "TSV BoxGym: Bitte E-Mail für den Trainerzugang bestätigen"
        : "TSV BoxGym: Bitte E-Mail für deinen Zugang bestätigen",
      body: `Bitte E-Mail bestätigen

${salutation}

für die weitere Freigabe fehlt aktuell noch die bestätigte E-Mail-Adresse. Bitte öffne den Bestätigungslink aus der bisherigen Mail und bestätige die Adresse.${correctionHint}

Wenn du die Mail nicht mehr findest, antworte kurz auf diese Nachricht.

TSV BoxGym`,
    },
    data_review: {
      id: "data_review",
      label: "Bitte Daten prüfen",
      subject: "TSV BoxGym: Bitte deine Daten kurz prüfen",
      body: `Daten bitte prüfen

${salutation}

bitte prüfe die hinterlegten Daten kurz auf Vollständigkeit und Richtigkeit, damit die Freigabe ohne Rückfragen abgeschlossen werden kann.${updateLinkBlock}${correctionHint}

Wenn etwas nicht stimmt, antworte bitte kurz auf diese Mail.

TSV BoxGym`,
    },
    gs_correction: {
      id: "gs_correction",
      label: "Bitte Daten korrigieren wegen GS-Abgleich",
      subject: "TSV BoxGym: Bitte Daten wegen GS-Abgleich prüfen",
      body: `Datenabgleich mit der GS

${salutation}

beim Abgleich mit der aktuellen TSV-Liste gibt es noch eine Abweichung. Bitte prüfe besonders Name, Geburtsdatum und hinterlegte Stammdaten.${correctionHint}

Wenn du Rückfragen hast, antworte einfach auf diese Mail.

TSV BoxGym`,
    },
    missing_details: {
      id: "missing_details",
      label: "Bitte fehlende Angaben ergänzen",
      subject: "TSV BoxGym: Bitte fehlende Angaben ergänzen",
      body: `Fehlende Angaben ergänzen

${salutation}

für die Freigabe fehlen aktuell noch einzelne Angaben. Bitte ergänze die fehlenden Daten, damit der Vorgang abgeschlossen werden kann.${correctionHint}

Wenn unklar ist, was genau fehlt, antworte bitte kurz auf diese Mail.

TSV BoxGym`,
    },
    general_followup: {
      id: "general_followup",
      label: "Allgemeine Freigabe-Rückfrage",
      subject: "TSV BoxGym: Rückfrage zur Freigabe",
      body: `Rückfrage zur Freigabe

${salutation}

wir prüfen aktuell die Freigabe und haben noch eine kurze Rückfrage. Bitte antworte kurz auf diese Nachricht, damit wir den Vorgang abschließen können.${correctionHint}

TSV BoxGym`,
    },
  } as const

  const requestedIds: ApprovalFollowupTopicId[] = Array.isArray(request.topicIds) && request.topicIds.length > 0
    ? request.topicIds
    : ["general_followup"]

  const uniqueIds: ApprovalFollowupTopicId[] = Array.from(new Set<ApprovalFollowupTopicId>([...requestedIds, "general_followup"]))
  return uniqueIds.map((id) => allTopics[id])
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

function getMedicalExamReminderCopy(request: Extract<AdminMailDraftRequest, { kind: "medical_exam_reminder" }>) {
  const dueLabel = formatIsoDateForDisplay(request.dueDate) || "in etwa 4 Wochen"
  return {
    subject: "TSV BoxGym: Jährliche Untersuchung bitte rechtzeitig erneuern",
    body: `Untersuchung läuft bald ab

Hallo${request.name ? ` ${request.name}` : ""},

deine jährliche ärztliche Untersuchung für den Wettkampfbereich läuft bald ab. Bitte kümmere dich rechtzeitig um eine neue Untersuchung.

Voraussichtliches Ablaufdatum: ${dueLabel}

Wenn der neue Termin erfolgt ist, gib die Information bitte an TSV BoxGym weiter.

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

export async function buildAdminMailDraftPreview(
  request: AdminMailDraftRequest,
  options?: { generateDynamicLinks?: boolean; baseUrl?: string }
): Promise<AdminMailDraftPreview> {
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
      successMessage: "Passwort-Mail versendet",
      auditAction: "access_code_changed_notice_sent",
      auditTargetType: request.targetKind,
      auditTargetName: escapeName(request.name) || request.email.trim().toLowerCase(),
      auditDetailsPrefix: `Mail an ${request.email.trim().toLowerCase()}`,
    }
  }

  if (request.kind === "approval_followup") {
    const topics = await getApprovalFollowupTopics(request, options)
    const first = topics[0]
    return {
      kind: request.kind,
      to: request.email.trim().toLowerCase(),
      subject: first.subject,
      body: first.body,
      replyTo: getReplyToAddress(),
      successMessage: "Nachricht versendet",
      auditAction: "approval_followup_sent",
      auditTargetType: request.targetKind,
      auditTargetName: escapeName(request.name) || request.email.trim().toLowerCase(),
      auditDetailsPrefix: `Mail an ${request.email.trim().toLowerCase()}`,
      topicSuggestions: topics,
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

  if (request.kind === "medical_exam_reminder") {
    const copy = getMedicalExamReminderCopy(request)
    return {
      kind: request.kind,
      to: request.email.trim().toLowerCase(),
      subject: copy.subject,
      body: copy.body,
      replyTo: getReplyToAddress(),
      successMessage: "Erinnerungs-Mail versendet",
      auditAction: "medical_exam_reminder_sent",
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