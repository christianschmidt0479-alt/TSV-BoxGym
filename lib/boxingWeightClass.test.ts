import assert from "node:assert/strict"
import { test } from "node:test"

// @ts-ignore TS5097: Node test runtime needs explicit .ts extension here.
import { getBoxingWeightClass } from "./boxingWeightClass.ts"

test("Männer/U19 untere Grenze 55.0 -> M60kg", () => {
  const result = getBoxingWeightClass({
    weightKg: 55,
    ageClass: "Jugend U19",
    gender: "m",
  })

  assert.equal(result.className, "Leichtgewicht")
  assert.equal(result.label, "M60kg")
})

test("Männer/U19 obere Grenze 60.0 -> M65kg", () => {
  const result = getBoxingWeightClass({
    weightKg: 60,
    ageClass: "Jugend U19",
    gender: "m",
  })

  assert.equal(result.label, "M65kg")
})

test("Frauen/U19 untere Grenze 57.0 -> W60kg", () => {
  const result = getBoxingWeightClass({
    weightKg: 57,
    ageClass: "Jugend U19",
    gender: "w",
  })

  assert.equal(result.label, "W60kg")
})

test("Frauen/U19 obere Grenze 60.0 -> W65kg", () => {
  const result = getBoxingWeightClass({
    weightKg: 60,
    ageClass: "Jugend U19",
    gender: "w",
  })

  assert.equal(result.label, "W65kg")
})

test("U17 untere Grenze 48.0 -> M50kg", () => {
  const result = getBoxingWeightClass({
    weightKg: 48,
    ageClass: "Junioren U17",
    gender: "male",
  })

  assert.equal(result.className, "Fliegengewicht")
  assert.equal(result.label, "M50kg")
})

test("U17 obere Grenze 50.0 -> M52kg", () => {
  const result = getBoxingWeightClass({
    weightKg: 50,
    ageClass: "Junioren U17",
    gender: "male",
  })

  assert.equal(result.label, "M52kg")
})

test("U15 untere Grenze 48.0 -> M50kg", () => {
  const result = getBoxingWeightClass({
    weightKg: 48,
    ageClass: "Kadetten U15",
    gender: "m",
  })

  assert.equal(result.label, "M50kg")
})

test("U15 obere Grenze 50.0 -> M52kg", () => {
  const result = getBoxingWeightClass({
    weightKg: 50,
    ageClass: "Kadetten U15",
    gender: "m",
  })

  assert.equal(result.label, "M52kg")
})

test("fehlendes Geschlecht -> Hinweis", () => {
  const result = getBoxingWeightClass({
    weightKg: 58,
    ageClass: "Jugend U19",
    gender: null,
  })

  assert.equal(result.note, "Gewichtsklasse nicht berechenbar - Geschlecht fehlt")
})

test("fehlendes Gewicht -> Hinweis", () => {
  const result = getBoxingWeightClass({
    weightKg: null,
    ageClass: "Jugend U19",
    gender: "w",
  })

  assert.equal(result.note, "Noch kein Gewicht erfasst")
})

test("U13 ohne PDF-Tabelle -> nicht berechenbar", () => {
  const result = getBoxingWeightClass({
    weightKg: 40,
    ageClass: "Schüler U13",
    gender: "m",
  })

  assert.equal(result.note, "Gewichtsklasse nicht berechenbar")
})
