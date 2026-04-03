import type { Metadata } from "next"
import Link from "next/link"

const responsibleEmail = "info@tsvboxgym.de"

export const metadata: Metadata = {
  title: "Datenschutzerklärung | TSV BoxGym",
  description: "Informationen zur Verarbeitung personenbezogener Daten in der TSV BoxGym App.",
}

function Section({
  title,
  children,
}: Readonly<{
  title: string
  children: React.ReactNode
}>) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      <div className="space-y-3 text-sm leading-6 text-zinc-700">{children}</div>
    </section>
  )
}

export default function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 md:px-6 md:py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-[28px] bg-[#0f2740] px-5 py-6 text-white shadow-xl sm:px-6 sm:py-8 md:px-8">
          <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-50">
            Rechtliches
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Datenschutzerklärung</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50/85 sm:text-base">
            Diese Datenschutzerklärung informiert über die Verarbeitung personenbezogener Daten bei der Nutzung
            der TSV BoxGym App für Check-in, Registrierung, Mitgliedsbereich, Elternbereich und Trainerzugang.
          </p>
          <p className="mt-3 text-xs text-blue-100/80">Stand: 03.04.2026</p>
        </div>

        <div className="space-y-6 rounded-[28px] bg-white p-5 shadow-sm sm:p-6 md:p-8">
          <Section title="1. Verantwortlicher">
            <p>
              Verantwortlich für die Verarbeitung personenbezogener Daten im Rahmen dieser Anwendung ist TSV
              Falkensee e.V., Bereich Boxen.
            </p>
            <p>
              E-Mail: <a className="font-medium text-[#154c83] underline underline-offset-4" href={`mailto:${responsibleEmail}`}>{responsibleEmail}</a>
              <br />
              Vereinsangaben und Postanschrift: <a className="font-medium text-[#154c83] underline underline-offset-4" href="https://tsv-falkensee.de/impressum" target="_blank" rel="noreferrer">offizielles Vereinsimpressum</a>
            </p>
          </Section>

          <Section title="2. Zwecke und Rechtsgrundlagen der Verarbeitung">
            <p>Wir verarbeiten personenbezogene Daten nur, soweit dies für den Betrieb der Anwendung und die Organisation des Trainings erforderlich ist.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Bereitstellung der Website und IT-Sicherheit auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO</li>
              <li>Registrierung, Verwaltung von Mitglieds- und Elternkonten sowie Durchführung des Check-ins auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO</li>
              <li>Organisation des Trainingsbetriebs, Gruppenverwaltung und interne Vereinsabläufe auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO</li>
              <li>Versand von Verifizierungs-, Benachrichtigungs- und Organisations-E-Mails auf Grundlage von Art. 6 Abs. 1 lit. b und lit. f DSGVO</li>
              <li>Verarbeitung von Angaben Minderjähriger im Rahmen der Vereinsorganisation und mit Beteiligung der Erziehungsberechtigten</li>
            </ul>
          </Section>

          <Section title="3. Verarbeitete Datenkategorien">
            <ul className="list-disc space-y-1 pl-5">
              <li>Stammdaten wie Vorname, Nachname, Geburtsdatum, Geschlecht, Stammgruppe und Mitgliedsstatus</li>
              <li>Kontaktdaten wie E-Mail-Adresse, Telefonnummer sowie je nach Bereich Eltern- oder Notfallkontakte</li>
              <li>Zugangsdaten wie Passwort, E-Mail-Verifikationsstatus, Trainerkontoangaben und rollenbezogene Freigaben</li>
              <li>Trainings- und Check-in-Daten wie Einheit, Zeitpunkt, Trainingsgruppe, QR-Freischaltung und Teilnahmehistorie</li>
              <li>Geräte- und Sitzungsdaten, soweit sie für Login, QR-Zugang oder Gerätewiedererkennung technisch erforderlich sind</li>
              <li>Optional gepflegte Organisationsdaten für Wettkampf- oder Trainerverwaltung, z. B. Lizenzdaten, Untersuchungsdatum oder Rollenbezug</li>
            </ul>
          </Section>

          <Section title="4. Nutzung der Website und technische Protokolle">
            <p>
              Beim Aufruf der Anwendung verarbeiten wir bzw. unsere Hosting- und Plattformanbieter technisch
              erforderliche Verbindungsdaten, insbesondere IP-Adresse, Zeitpunkt des Zugriffs, angeforderte
              Ressource, Browser- und Geräteinformationen sowie Fehlermeldungen. Die Verarbeitung erfolgt zur
              sicheren Bereitstellung der Anwendung, zur Fehleranalyse und zur Missbrauchsabwehr.
            </p>
            <p>
              Eine Nutzung von Marketing-, Tracking- oder Analyse-Tools ist in der Anwendung derzeit nicht
              vorgesehen.
            </p>
          </Section>

          <Section title="5. Registrierung, Check-in und Kontoverwaltung">
            <p>
              Bei der Registrierung und beim Check-in verarbeiten wir die jeweils eingegebenen Daten zur
              Identifikation von Mitgliedern, zur Zuordnung zu Trainingsgruppen, zur Freigabe von Zugangsrechten
              sowie zur Dokumentation der Teilnahme am Trainingsbetrieb.
            </p>
            <p>
              Für Probetrainings und bestimmte Spezialbereiche können weitere Angaben wie Telefonnummer,
              Erziehungsberechtigte oder organisatorische Zusatzinformationen erforderlich sein. Trainer- und
              Elternzugänge werden nur für die jeweils vorgesehenen Bereiche bereitgestellt.
            </p>
          </Section>

          <Section title="6. Cookies, Local Storage und vergleichbare Speichertechniken">
            <p>
              Die Anwendung verwendet nur technisch erforderliche Speichermechanismen. Rechtsgrundlage ist Art. 6
              Abs. 1 lit. f DSGVO, soweit sie für einen stabilen und sicheren Betrieb notwendig sind, sowie Art. 6
              Abs. 1 lit. b DSGVO bei eingeloggten Bereichen.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Mitglieder- und Elternsitzungen per HttpOnly-Cookie für bis zu 1 Stunde</li>
              <li>Trainer-Sitzungen per HttpOnly-Cookie für bis zu 10 Minuten</li>
              <li>Gerätewiedererkennung für Mitglieder per HttpOnly-Cookie für bis zu 90 Tage</li>
              <li>QR-Zugang per HttpOnly-Cookie für bis zu 180 Minuten</li>
              <li>Browserinterne Speicherung für vorübergehende Registrierungsentwürfe, QR-Zugang oder lokale Trainerstatusdaten bis zur Löschung durch Browser, Logout oder Fristablauf</li>
            </ul>
          </Section>

          <Section title="7. E-Mail-Kommunikation">
            <p>
              Wir versenden E-Mails für Verifizierung, Freigabe, organisatorische Hinweise und Verwaltungsabläufe.
              Dabei werden insbesondere E-Mail-Adresse, Name, Statusinformationen und der Inhalt der jeweiligen
              Benachrichtigung verarbeitet.
            </p>
          </Section>

          <Section title="8. Empfänger und eingesetzte Dienstleister">
            <p>Wir setzen externe Dienstleister ein, soweit dies für den Betrieb der Anwendung erforderlich ist.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Vercel für Hosting und technische Bereitstellung der Webanwendung</li>
              <li>Supabase für Datenbank, Authentifizierungsnahe Funktionen und serverseitige Datenverarbeitung</li>
              <li>Resend für den Versand von E-Mails</li>
            </ul>
            <p>
              Mit diesen Dienstleistern werden, soweit erforderlich, Vereinbarungen zur Auftragsverarbeitung
              geschlossen oder geeignete Datenschutzgarantien genutzt.
            </p>
          </Section>

          <Section title="9. Speicherdauer">
            <p>
              Personenbezogene Daten speichern wir nur so lange, wie dies für die jeweiligen Zwecke erforderlich
              ist oder gesetzliche Aufbewahrungspflichten bestehen.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Technische Sitzungsdaten werden nach Ablauf der jeweiligen Session automatisch ungültig</li>
              <li>Entwurfsdaten im Browser bleiben bis zur Löschung durch die Nutzerin oder den Nutzer oder bis zum Zurücksetzen des Browsers gespeichert</li>
              <li>Mitglieds-, Check-in- und Verwaltungsdaten bleiben gespeichert, solange sie für Vereinsorganisation, Nachweis oder gesetzliche Pflichten benötigt werden</li>
            </ul>
          </Section>

          <Section title="10. Minderjährige">
            <p>
              Soweit Daten Minderjähriger verarbeitet werden, erfolgt dies im Rahmen des Trainings- und
              Mitgliedschaftsverhältnisses. Soweit erforderlich, erfolgt die Kommunikation über oder mit den
              Erziehungsberechtigten.
            </p>
          </Section>

          <Section title="11. Rechte betroffener Personen">
            <p>Betroffene Personen haben nach den gesetzlichen Voraussetzungen insbesondere folgende Rechte:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Auskunft nach Art. 15 DSGVO</li>
              <li>Berichtigung nach Art. 16 DSGVO</li>
              <li>Löschung nach Art. 17 DSGVO</li>
              <li>Einschränkung der Verarbeitung nach Art. 18 DSGVO</li>
              <li>Datenübertragbarkeit nach Art. 20 DSGVO</li>
              <li>Widerspruch gegen Verarbeitungen auf Grundlage von Art. 6 Abs. 1 lit. e oder lit. f DSGVO nach Art. 21 DSGVO</li>
              <li>Beschwerde bei einer Datenschutzaufsichtsbehörde</li>
            </ul>
          </Section>

          <Section title="12. Pflicht zur Bereitstellung und automatisierte Entscheidungen">
            <p>
              Die Bereitstellung solcher Daten, die für Registrierung, Login, Check-in oder Vereinsorganisation
              erforderlich sind, ist für die Nutzung der jeweiligen Funktionen notwendig. Ohne diese Daten können
              einzelne Funktionen der Anwendung nicht oder nicht vollständig bereitgestellt werden.
            </p>
            <p>
              Eine ausschliesslich automatisierte Entscheidungsfindung im Sinne von Art. 22 DSGVO findet nicht statt.
            </p>
          </Section>

          <Section title="13. Kontakt zum Datenschutz">
            <p>
              Datenschutzanfragen können an <a className="font-medium text-[#154c83] underline underline-offset-4" href={`mailto:${responsibleEmail}`}>{responsibleEmail}</a> gerichtet werden.
            </p>
            <p>
              Zur Startseite: <Link className="font-medium text-[#154c83] underline underline-offset-4" href="/">TSV BoxGym</Link>
            </p>
          </Section>
        </div>
      </div>
    </div>
  )
}