// Fachlicher Mailbaustein für Admin-Einladung eines Mitglieds (Zugang einrichten)
import { sendMail } from "./mailService"
import { buildMemberMail } from "./renderMailTemplate"
import { getAppBaseUrl, DEFAULT_APP_BASE_URL } from "../mailConfig"

export type MemberInviteMailInput = {
  email: string
  firstName: string
  token: string
}

export async function sendMemberInviteMail(input: MemberInviteMailInput): Promise<void> {
  const { email, firstName, token } = input
  const trimmedToken = token.trim()
  if (!trimmedToken) {
    throw new Error("Invite token fehlt")
  }

  const BASE_URL = getAppBaseUrl() || DEFAULT_APP_BASE_URL
  if (!BASE_URL) {
    throw new Error("BASE_URL fehlt")
  }

  const inviteUrl = `${BASE_URL}/mein-bereich/zugang-einrichten?token=${trimmedToken}`
  const greeting = firstName?.trim() ? `Hallo ${firstName.trim()},` : "Hallo,"

  const subject = "Zugang einrichten – TSV BoxGym"
  const html = buildMemberMail({
    title: "Zugang einrichten",
    intro: `${greeting} du wurdest als Mitglied im TSV BoxGym eingetragen. Bitte richte jetzt deinen persönlichen Zugang ein und wähle ein Passwort.`,
    ctaLabel: "Zugang jetzt einrichten",
    ctaUrl: inviteUrl,
    fallbackLabel: "Oder öffne diesen Link",
    fallbackUrl: inviteUrl,
    securityNotice:
      "Dieser Link ist 7 Tage gültig und kann nur einmal verwendet werden. Falls du diese E-Mail nicht erwartet hast, kannst du sie ignorieren.",
  })
  const text = [
    `${greeting}`,
    ``,
    `Du wurdest als Mitglied im TSV BoxGym eingetragen. Bitte richte deinen Zugang ein:`,
    ``,
    inviteUrl,
    ``,
    `Der Link ist 7 Tage gültig und kann nur einmal verwendet werden.`,
    `Falls du diese E-Mail nicht erwartet hast, kannst du sie ignorieren.`,
  ].join("\n")

  await sendMail({
    to: email,
    subject,
    html,
    text,
  })
}
