export type WeightAnalysisStatus =
  | "no_target"
  | "no_weight"
  | "in_range"
  | "near_target"
  | "above_target"
  | "below_target"
  | "needs_attention"

export type WeightAnalysisTrend = "rising" | "falling" | "stable" | "unknown"

export type WeightAnalysisInput = {
  targetWeightKg: number | null
  logs: Array<{ created_at: string; weight_kg: number }>
}

export type WeightAnalysisResult = {
  distanceKg: number | null
  status: WeightAnalysisStatus
  trend: WeightAnalysisTrend
  message: string
  lastChangeKg: number | null
}

export function getWeightStatusLabel(status: WeightAnalysisStatus): string {
  if (status === "in_range") return "Im Zielbereich"
  if (status === "near_target") return "Nah am Zielbereich"
  if (status === "above_target") return "Über dem Zielgewicht"
  if (status === "below_target") return "Unter dem Zielgewicht"
  if (status === "needs_attention") return "Bitte besprechen"
  if (status === "no_target") return "Kein Zielgewicht"
  return "Kein Gewicht"
}

export function getWeightStatusBadgeClass(status: WeightAnalysisStatus): string {
  if (status === "in_range") return "bg-emerald-100 text-emerald-800 border border-emerald-300"
  if (status === "near_target") return "bg-blue-100 text-blue-800 border border-blue-300"
  if (status === "above_target" || status === "below_target") return "bg-amber-100 text-amber-800 border border-amber-300"
  if (status === "needs_attention") return "bg-red-100 text-red-800 border border-red-300"
  return "bg-zinc-100 text-zinc-700 border border-zinc-300"
}

export function getWeightTrendLabel(trend: WeightAnalysisTrend): string {
  if (trend === "rising") return "steigend"
  if (trend === "falling") return "fallend"
  if (trend === "stable") return "stabil"
  return "noch nicht bewertbar"
}

export function getWeightTrendBadgeClass(trend: WeightAnalysisTrend): string {
  if (trend === "rising") return "bg-amber-50 text-amber-700 border border-amber-200"
  if (trend === "falling") return "bg-sky-50 text-sky-700 border border-sky-200"
  if (trend === "stable") return "bg-emerald-50 text-emerald-700 border border-emerald-200"
  return "bg-zinc-100 text-zinc-700 border border-zinc-300"
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

function resolveTrend(logs: Array<{ created_at: string; weight_kg: number }>): WeightAnalysisTrend {
  if (logs.length < 2) return "unknown"

  const sorted = [...logs].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime()
    const timeB = new Date(b.created_at).getTime()
    return timeB - timeA
  })

  const newest = sorted[0]?.weight_kg
  const previous = sorted[1]?.weight_kg
  if (!Number.isFinite(newest) || !Number.isFinite(previous)) return "unknown"

  const delta = newest - previous
  if (Math.abs(delta) <= 0.3) return "stable"
  return delta > 0 ? "rising" : "falling"
}

function resolveLastChangeKg(logs: Array<{ created_at: string; weight_kg: number }>): number | null {
  if (logs.length < 2) return null

  const sorted = [...logs].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime()
    const timeB = new Date(b.created_at).getTime()
    return timeB - timeA
  })

  const newest = sorted[0]?.weight_kg
  const previous = sorted[1]?.weight_kg
  if (!Number.isFinite(newest) || !Number.isFinite(previous)) return null
  return roundToOneDecimal(newest - previous)
}

export function analyzeWeightProgress(input: WeightAnalysisInput): WeightAnalysisResult {
  const trend = resolveTrend(input.logs)
  const lastChangeKg = resolveLastChangeKg(input.logs)
  const latestWeightKg = input.logs[0]?.weight_kg

  if (typeof latestWeightKg !== "number" || !Number.isFinite(latestWeightKg)) {
    return {
      distanceKg: null,
      status: "no_weight",
      trend,
      message: "Noch kein Gewicht erfasst.",
      lastChangeKg,
    }
  }

  if (typeof input.targetWeightKg !== "number" || !Number.isFinite(input.targetWeightKg)) {
    return {
      distanceKg: null,
      status: "no_target",
      trend,
      message: "Noch kein Zielgewicht hinterlegt.",
      lastChangeKg,
    }
  }

  const distanceKg = roundToOneDecimal(latestWeightKg - input.targetWeightKg)

  if (lastChangeKg !== null && Math.abs(lastChangeKg) > 2) {
    return {
      distanceKg,
      status: "needs_attention",
      trend,
      message: "Bitte Entwicklung mit Trainer/Admin besprechen.",
      lastChangeKg,
    }
  }

  if (distanceKg > 5 || distanceKg < -3) {
    return {
      distanceKg,
      status: "needs_attention",
      trend,
      message: "Bitte Entwicklung mit Trainer/Admin besprechen.",
      lastChangeKg,
    }
  }

  if (Math.abs(distanceKg) <= 1) {
    return {
      distanceKg,
      status: "in_range",
      trend,
      message: "Im Zielbereich.",
      lastChangeKg,
    }
  }

  if (distanceKg > 3) {
    return {
      distanceKg,
      status: "above_target",
      trend,
      message: "Über dem Zielgewicht.",
      lastChangeKg,
    }
  }

  if (distanceKg < -2) {
    return {
      distanceKg,
      status: "below_target",
      trend,
      message: "Unter dem Zielgewicht.",
      lastChangeKg,
    }
  }

  return {
    distanceKg,
    status: "near_target",
    trend,
    message: "Nah am Zielbereich.",
    lastChangeKg,
  }
}