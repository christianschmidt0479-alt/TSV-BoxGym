import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { readCheckinSettings, writeCheckinWindowOverride } from "@/lib/checkinSettingsDb"
import { getMemberCheckinModeLabel } from "@/lib/memberCheckin"
import { FerienmodusToggleClient } from "./ferienmodus-toggle-client"

export async function FerienmodusCard() {
  const settings = await readCheckinSettings()
  const ferienAktiv = settings.disableCheckinTimeWindow

  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-semibold text-base">Ferienmodus</div>
          <div className="text-sm text-muted-foreground mt-1">Im Ferienmodus wird die normale Check-in-Zeitfensterlogik deaktiviert. Nur berechtigte Gruppen können sich einchecken.</div>
        </div>
        <FerienmodusToggleClient initialAktiv={ferienAktiv} />
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Label>Status:</Label>
        {ferienAktiv ? (
          <Badge variant="default">Aktiv</Badge>
        ) : (
          <Badge variant="outline">Inaktiv</Badge>
        )}
        <span className="text-xs text-muted-foreground">({getMemberCheckinModeLabel(ferienAktiv ? "ferien" : "normal")})</span>
      </div>
    </Card>
  )
}