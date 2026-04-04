export type AdminQrEntryKey = "registration" | "member-checkin" | "trial-signup"

export type AdminQrEntry = {
  key: AdminQrEntryKey
  title: string
  description: string
  url: string
  alt: string
  eyebrow: string
  helper: string
}

type BuildAdminQrEntriesInput = {
  baseUrl: string
  memberQrUrl: string
  trialQrUrl: string
}

export function buildAdminQrEntries({ baseUrl, memberQrUrl, trialQrUrl }: BuildAdminQrEntriesInput): AdminQrEntry[] {
  return [
    {
      key: "registration",
      title: "TSV Boxbereiche Mitglieder registrieren",
      description: "Der zentrale QR-Code für die Registrierung im Boxbereich. Geeignet für Handyansicht, Aushang und direkte Ausgabe im Gym.",
      url: `${baseUrl}/tsv-mitglied-registrieren`,
      alt: "QR-Code TSV Boxbereiche Mitglieder registrieren",
      eyebrow: "Registrierung",
      helper: "Für TSV-Mitglieder oder Personen, die parallel die TSV-Mitgliedschaft beantragen.",
    },
    {
      key: "member-checkin",
      title: "Mitglieder Check-in",
      description: "Führt direkt zum QR-Zugang für reguläre Mitglieder im Trainingsbetrieb.",
      url: memberQrUrl,
      alt: "QR-Code Mitglieder Check-in",
      eyebrow: "Check-in",
      helper: "Für den regulären Zugang im Mitgliedsbereich.",
    },
    {
      key: "trial-signup",
      title: "Probetraining Anmeldung",
      description: "Dauerhaft aktiver QR-Code für die Registrierung neuer Probemitglieder am Eingang.",
      url: trialQrUrl,
      alt: "QR-Code Probetraining Anmeldung",
      eyebrow: "Registrierung",
      helper: "Nach der Registrierung erfolgt der weitere Check-in über den normalen Check-in-QR-Code.",
    },
  ]
}