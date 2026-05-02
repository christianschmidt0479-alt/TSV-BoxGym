import assert from "node:assert/strict"
import { test } from "node:test"

// @ts-ignore TS5097: Node test runtime needs explicit .ts extension here.
import { getBoxingAgeClass } from "./boxingAgeClass.ts"

const NOW = new Date("2026-05-02T12:00:00.000Z")

test("wird 9 -> noch nicht wettkampffähig", () => {
  const result = getBoxingAgeClass("2017-08-10", NOW)

  assert.equal(result.ageThisYear, 9)
  assert.equal(result.ageClass, "Noch nicht wettkampffähig")
  assert.equal(result.competitionEligibleNow, false)
})

test("wird 10, Geburtstag noch nicht gehabt -> Schüler U13 + Hinweis", () => {
  const result = getBoxingAgeClass("2016-12-10", NOW)

  assert.equal(result.ageThisYear, 10)
  assert.equal(result.currentAge, 9)
  assert.equal(result.ageClass, "Schüler U13")
  assert.equal(result.competitionEligibleNow, false)
  assert.equal(result.note, "Wettkampf erst ab 10. Geburtstag")
})

test("wird 12 -> Schüler U13", () => {
  const result = getBoxingAgeClass("2014-02-10", NOW)

  assert.equal(result.ageThisYear, 12)
  assert.equal(result.ageClass, "Schüler U13")
})

test("wird 13 -> Kadetten U15", () => {
  const result = getBoxingAgeClass("2013-10-01", NOW)

  assert.equal(result.ageThisYear, 13)
  assert.equal(result.ageClass, "Kadetten U15")
})

test("wird 15 -> Junioren U17", () => {
  const result = getBoxingAgeClass("2011-01-03", NOW)

  assert.equal(result.ageThisYear, 15)
  assert.equal(result.ageClass, "Junioren U17")
})

test("wird 17 -> Jugend U19", () => {
  const result = getBoxingAgeClass("2009-09-01", NOW)

  assert.equal(result.ageThisYear, 17)
  assert.equal(result.ageClass, "Jugend U19")
})

test("wird 19 -> Männer/Frauen", () => {
  const result = getBoxingAgeClass("2007-02-01", NOW)

  assert.equal(result.ageThisYear, 19)
  assert.equal(result.ageClass, "Männer/Frauen")
  assert.equal(result.competitionEligibleNow, true)
})

test("fehlendes Geburtsdatum -> Unbekannt", () => {
  const result = getBoxingAgeClass(null, NOW)

  assert.equal(result.ageThisYear, null)
  assert.equal(result.currentAge, null)
  assert.equal(result.ageClass, "Unbekannt")
  assert.equal(result.competitionEligibleNow, false)
})
