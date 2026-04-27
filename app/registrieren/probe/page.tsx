import MemberRegistrationForm from "@/components/forms/member-registration-form"

export default function RegistrierenProbePage() {
  return (
    <MemberRegistrationForm
      registrationType="trial"
      heading="Probemitglied registrieren"
      description="Registrierung für ein Probetraining im Bereich Boxen."
    />
  )
}
