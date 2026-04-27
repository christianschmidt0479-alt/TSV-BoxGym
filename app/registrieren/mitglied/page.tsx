import MemberRegistrationForm from "@/components/forms/member-registration-form"

export default function RegistrierenMitgliedPage() {
  return (
    <MemberRegistrationForm
      registrationType="member"
      heading="TSV Mitglied registrieren"
      description="Registrierung als Mitglied für den Bereich Boxen im TSV Falkensee."
    />
  )
}
