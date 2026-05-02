import assert from "node:assert/strict"
import { test } from "node:test"

// @ts-ignore TS5097: Node test runtime needs explicit .ts extension here.
import { analyzeWeightProgress } from "./weightAnalysis.ts"

test("no_target when target weight is missing", () => {
  const result = analyzeWeightProgress({
    targetWeightKg: null,
    logs: [{ created_at: "2026-05-01T10:00:00.000Z", weight_kg: 72 }],
  })

  assert.equal(result.status, "no_target")
  assert.equal(result.message, "Noch kein Zielgewicht hinterlegt.")
})

test("no_weight when logs are missing", () => {
  const result = analyzeWeightProgress({
    targetWeightKg: 70,
    logs: [],
  })

  assert.equal(result.status, "no_weight")
  assert.equal(result.message, "Noch kein Gewicht erfasst.")
})

test("in_range within plus/minus 1kg", () => {
  const result = analyzeWeightProgress({
    targetWeightKg: 70,
    logs: [{ created_at: "2026-05-01T10:00:00.000Z", weight_kg: 70.8 }],
  })

  assert.equal(result.status, "in_range")
})

test("above_target at plus 4kg", () => {
  const result = analyzeWeightProgress({
    targetWeightKg: 70,
    logs: [{ created_at: "2026-05-01T10:00:00.000Z", weight_kg: 74 }],
  })

  assert.equal(result.status, "above_target")
})

test("below_target at minus 3kg", () => {
  const result = analyzeWeightProgress({
    targetWeightKg: 70,
    logs: [{ created_at: "2026-05-01T10:00:00.000Z", weight_kg: 67 }],
  })

  assert.equal(result.status, "below_target")
})

test("needs_attention at minus 3kg with fast change", () => {
  const result = analyzeWeightProgress({
    targetWeightKg: 70,
    logs: [
      { created_at: "2026-05-02T10:00:00.000Z", weight_kg: 67 },
      { created_at: "2026-05-01T10:00:00.000Z", weight_kg: 70 },
    ],
  })

  assert.equal(result.status, "needs_attention")
  assert.equal(result.message, "Bitte Entwicklung mit Trainer/Admin besprechen.")
})

test("needs_attention on fast change above 2kg", () => {
  const result = analyzeWeightProgress({
    targetWeightKg: 70,
    logs: [
      { created_at: "2026-05-02T10:00:00.000Z", weight_kg: 72.5 },
      { created_at: "2026-05-01T10:00:00.000Z", weight_kg: 69.9 },
    ],
  })

  assert.equal(result.status, "needs_attention")
  assert.equal(result.lastChangeKg, 2.6)
})
