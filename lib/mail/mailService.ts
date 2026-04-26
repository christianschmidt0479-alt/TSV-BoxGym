// Zentrale MailService-Fassade für das Projekt

export interface SendMailInput {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
}

export interface SendMailResult {
  id?: string
}

// Importiere den aktuellen Provider (resend)
import { resendProvider } from "./providers/resendProvider"

// Zentrale Funktion für Mailversand
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  // Aktuell nur resendProvider, später erweiterbar
  return resendProvider.sendMail(input)
}
