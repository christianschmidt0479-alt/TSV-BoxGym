import type { BoxingAgeClass } from "./boxingAgeClass"

type GenderBucket = "male" | "female" | "unknown"

type WeightClassRow = {
  label: string
  code: string
  minKg: number | null
  maxKg: number | null
}

type WeightClassTableKey =
  | "adult_male"
  | "adult_female"
  | "u17_male"
  | "u17_female"
  | "u15_male"
  | "u15_female"

export type BoxingWeightClassResult = {
  className: string
  label: string
  minKg: number | null
  maxKg: number | null
  sourceAgeClass: BoxingAgeClass | "Unbekannt"
  sourceGender: GenderBucket
  note?: string
}

const TABLES: Record<WeightClassTableKey, WeightClassRow[]> = {
  // Männer + männliche Jugend U19
  adult_male: [
    { label: "Fliegengewicht", code: "M50kg", minKg: 47, maxKg: 50 },
    { label: "Bantamgewicht", code: "M55kg", minKg: 50, maxKg: 55 },
    { label: "Leichtgewicht", code: "M60kg", minKg: 55, maxKg: 60 },
    { label: "Weltergewicht", code: "M65kg", minKg: 60, maxKg: 65 },
    { label: "Mittelgewicht", code: "M75kg", minKg: 65, maxKg: 75 },
    { label: "Halbschwergewicht", code: "M80kg", minKg: 75, maxKg: 80 },
    { label: "Cruisergewicht", code: "M85kg", minKg: 80, maxKg: 85 },
    { label: "Schwergewicht", code: "M90kg", minKg: 85, maxKg: 90 },
    { label: "Superschwergewicht", code: "M90+kg", minKg: 90, maxKg: null },
  ],
  // Frauen + weibliche Jugend U19
  adult_female: [
    { label: "Halbfliegengewicht", code: "W48kg", minKg: 45, maxKg: 48 },
    { label: "Fliegengewicht", code: "W51kg", minKg: 48, maxKg: 51 },
    { label: "Bantamgewicht", code: "W54kg", minKg: 51, maxKg: 54 },
    { label: "Federgewicht", code: "W57kg", minKg: 54, maxKg: 57 },
    { label: "Leichtgewicht", code: "W60kg", minKg: 57, maxKg: 60 },
    { label: "Weltergewicht", code: "W65kg", minKg: 60, maxKg: 65 },
    { label: "Halbmittelgewicht", code: "W70kg", minKg: 65, maxKg: 70 },
    { label: "Mittelgewicht", code: "W75kg", minKg: 70, maxKg: 75 },
    { label: "Halbschwergewicht", code: "W80kg", minKg: 75, maxKg: 80 },
    { label: "Schwergewicht", code: "W80+kg", minKg: 80, maxKg: null },
  ],
  // Junioren U17
  u17_male: [
    { label: "Papiergewicht", code: "M42kg", minKg: 40, maxKg: 42 },
    { label: "Papiergewicht", code: "M44kg", minKg: 42, maxKg: 44 },
    { label: "Papiergewicht", code: "M46kg", minKg: 44, maxKg: 46 },
    { label: "Halbfliegengewicht", code: "M48kg", minKg: 46, maxKg: 48 },
    { label: "Fliegengewicht", code: "M50kg", minKg: 48, maxKg: 50 },
    { label: "Halbbantamgewicht", code: "M52kg", minKg: 50, maxKg: 52 },
    { label: "Bantamgewicht", code: "M54kg", minKg: 52, maxKg: 54 },
    { label: "Federgewicht", code: "M57kg", minKg: 54, maxKg: 57 },
    { label: "Leichtgewicht", code: "M60kg", minKg: 57, maxKg: 60 },
    { label: "Halbweltergewicht", code: "M63kg", minKg: 60, maxKg: 63 },
    { label: "Weltergewicht", code: "M66kg", minKg: 63, maxKg: 66 },
    { label: "Halbmittelgewicht", code: "M70kg", minKg: 66, maxKg: 70 },
    { label: "Mittelgewicht", code: "M75kg", minKg: 70, maxKg: 75 },
    { label: "Halbschwergewicht", code: "M80kg", minKg: 75, maxKg: 80 },
    { label: "Schwergewicht", code: "M+80kg", minKg: 80, maxKg: null },
  ],
  u17_female: [
    { label: "Papiergewicht", code: "W42kg", minKg: 40, maxKg: 42 },
    { label: "Papiergewicht", code: "W44kg", minKg: 42, maxKg: 44 },
    { label: "Papiergewicht", code: "W46kg", minKg: 44, maxKg: 46 },
    { label: "Halbfliegengewicht", code: "W48kg", minKg: 46, maxKg: 48 },
    { label: "Fliegengewicht", code: "W50kg", minKg: 48, maxKg: 50 },
    { label: "Halbbantamgewicht", code: "W52kg", minKg: 50, maxKg: 52 },
    { label: "Bantamgewicht", code: "W54kg", minKg: 52, maxKg: 54 },
    { label: "Federgewicht", code: "W57kg", minKg: 54, maxKg: 57 },
    { label: "Leichtgewicht", code: "W60kg", minKg: 57, maxKg: 60 },
    { label: "Halbweltergewicht", code: "W63kg", minKg: 60, maxKg: 63 },
    { label: "Weltergewicht", code: "W66kg", minKg: 63, maxKg: 66 },
    { label: "Halbmittelgewicht", code: "W70kg", minKg: 66, maxKg: 70 },
    { label: "Mittelgewicht", code: "W75kg", minKg: 70, maxKg: 75 },
    { label: "Halbschwergewicht", code: "W80kg", minKg: 75, maxKg: 80 },
    { label: "Schwergewicht", code: "W+80kg", minKg: 80, maxKg: null },
  ],
  // Kadetten U15
  u15_male: [
    { label: "Papiergewicht", code: "M40kg", minKg: 38, maxKg: 40 },
    { label: "Papiergewicht", code: "M42kg", minKg: 40, maxKg: 42 },
    { label: "Papiergewicht", code: "M44kg", minKg: 42, maxKg: 44 },
    { label: "Papiergewicht", code: "M46kg", minKg: 44, maxKg: 46 },
    { label: "Halbfliegengewicht", code: "M48kg", minKg: 46, maxKg: 48 },
    { label: "Fliegengewicht", code: "M50kg", minKg: 48, maxKg: 50 },
    { label: "Halbbantamgewicht", code: "M52kg", minKg: 50, maxKg: 52 },
    { label: "Bantamgewicht", code: "M54kg", minKg: 52, maxKg: 54 },
    { label: "Federgewicht", code: "M57kg", minKg: 54, maxKg: 57 },
    { label: "Leichtgewicht", code: "M60kg", minKg: 57, maxKg: 60 },
    { label: "Halbweltergewicht", code: "M63kg", minKg: 60, maxKg: 63 },
    { label: "Weltergewicht", code: "M66kg", minKg: 63, maxKg: 66 },
    { label: "Halbmittelgewicht", code: "M70kg", minKg: 66, maxKg: 70 },
    { label: "Mittelgewicht", code: "M75kg", minKg: 70, maxKg: 75 },
    { label: "Halbschwergewicht", code: "M80kg", minKg: 75, maxKg: 80 },
    { label: "Schwergewicht", code: "M+80kg", minKg: 80, maxKg: null },
  ],
  u15_female: [
    { label: "Papiergewicht", code: "W40kg", minKg: 38, maxKg: 40 },
    { label: "Papiergewicht", code: "W42kg", minKg: 40, maxKg: 42 },
    { label: "Papiergewicht", code: "W44kg", minKg: 42, maxKg: 44 },
    { label: "Papiergewicht", code: "W46kg", minKg: 44, maxKg: 46 },
    { label: "Halbfliegengewicht", code: "W48kg", minKg: 46, maxKg: 48 },
    { label: "Fliegengewicht", code: "W50kg", minKg: 48, maxKg: 50 },
    { label: "Halbbantamgewicht", code: "W52kg", minKg: 50, maxKg: 52 },
    { label: "Bantamgewicht", code: "W54kg", minKg: 52, maxKg: 54 },
    { label: "Federgewicht", code: "W57kg", minKg: 54, maxKg: 57 },
    { label: "Leichtgewicht", code: "W60kg", minKg: 57, maxKg: 60 },
    { label: "Halbweltergewicht", code: "W63kg", minKg: 60, maxKg: 63 },
    { label: "Weltergewicht", code: "W66kg", minKg: 63, maxKg: 66 },
    { label: "Halbmittelgewicht", code: "W70kg", minKg: 66, maxKg: 70 },
    { label: "Mittelgewicht", code: "W75kg", minKg: 70, maxKg: 75 },
    { label: "Halbschwergewicht", code: "W80kg", minKg: 75, maxKg: 80 },
    { label: "Schwergewicht", code: "W+80kg", minKg: 80, maxKg: null },
  ],
}

function normalizeGender(gender: string | null | undefined): GenderBucket {
  if (!gender) return "unknown"
  const value = gender.trim().toLowerCase()
  if (!value) return "unknown"

  if (value === "m" || value === "male" || value === "mann" || value === "maennlich" || value === "männlich") {
    return "male"
  }

  if (value === "w" || value === "f" || value === "female" || value === "frau" || value === "weiblich") {
    return "female"
  }

  return "unknown"
}

function tableKeyFor(ageClass: BoxingAgeClass | "Unbekannt", gender: GenderBucket): WeightClassTableKey | null {
  if (gender === "unknown") return null

  if (ageClass === "Männer/Frauen" || ageClass === "Jugend U19") {
    return gender === "male" ? "adult_male" : "adult_female"
  }

  if (ageClass === "Junioren U17") {
    return gender === "male" ? "u17_male" : "u17_female"
  }

  if (ageClass === "Kadetten U15") {
    return gender === "male" ? "u15_male" : "u15_female"
  }

  return null
}

function findClass(rows: WeightClassRow[], weightKg: number): WeightClassRow | null {
  for (const row of rows) {
    const minOk = row.minKg === null ? true : weightKg >= row.minKg
    const maxOk = row.maxKg === null ? true : weightKg < row.maxKg
    if (minOk && maxOk) return row
  }
  return null
}

export function getBoxingWeightClass(input: {
  weightKg: number | null
  ageClass: BoxingAgeClass | "Unbekannt"
  gender: string | null
}): BoxingWeightClassResult {
  if (typeof input.weightKg !== "number" || !Number.isFinite(input.weightKg)) {
    return {
      className: "Unbekannt",
      label: "Unbekannt",
      minKg: null,
      maxKg: null,
      sourceAgeClass: input.ageClass ?? "Unbekannt",
      sourceGender: normalizeGender(input.gender),
      note: "Noch kein Gewicht erfasst",
    }
  }

  const sourceGender = normalizeGender(input.gender)
  if (sourceGender === "unknown") {
    return {
      className: "Unbekannt",
      label: "Unbekannt",
      minKg: null,
      maxKg: null,
      sourceAgeClass: input.ageClass ?? "Unbekannt",
      sourceGender,
      note: "Gewichtsklasse nicht berechenbar - Geschlecht fehlt",
    }
  }

  const key = tableKeyFor(input.ageClass ?? "Unbekannt", sourceGender)
  if (!key) {
    return {
      className: "Unbekannt",
      label: "Unbekannt",
      minKg: null,
      maxKg: null,
      sourceAgeClass: input.ageClass ?? "Unbekannt",
      sourceGender,
      note: "Gewichtsklasse nicht berechenbar",
    }
  }

  const row = findClass(TABLES[key], input.weightKg)
  if (!row) {
    return {
      className: "Unbekannt",
      label: "Unbekannt",
      minKg: null,
      maxKg: null,
      sourceAgeClass: input.ageClass ?? "Unbekannt",
      sourceGender,
      note: "Gewichtsklasse nicht berechenbar",
    }
  }

  return {
    className: row.label,
    label: row.code,
    minKg: row.minKg,
    maxKg: row.maxKg,
    sourceAgeClass: input.ageClass ?? "Unbekannt",
    sourceGender,
  }
}
