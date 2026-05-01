import assert from "node:assert/strict"
import test from "node:test"

import {
  BOXZWERGE_UPLOAD_GROUP,
  NORMAL_OFFICE_UPLOAD_GROUPS,
  shouldReplaceStoredRowForUploadedGroups,
  validateUploadGroupsForScope,
} from "./officeUploadGroups.ts"

test("normal scope accepts Basic Ue18", () => {
  const result = validateUploadGroupsForScope({
    groups: ["Basic Ü18"],
    filesCount: 1,
    scope: "normal",
  })

  assert.equal(result.ok, true)
})

test("normal scope rejects Boxzwerge with dedicated message", () => {
  const result = validateUploadGroupsForScope({
    groups: [BOXZWERGE_UPLOAD_GROUP],
    filesCount: 1,
    scope: "normal",
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 400)
    assert.equal(result.message, "Boxzwerge werden über den separaten Boxzwerge-Upload abgeglichen.")
  }
})

test("boxzwerge scope accepts only Boxzwerge", () => {
  const okResult = validateUploadGroupsForScope({
    groups: [BOXZWERGE_UPLOAD_GROUP],
    filesCount: 1,
    scope: "boxzwerge",
  })
  assert.equal(okResult.ok, true)

  const blockedResult = validateUploadGroupsForScope({
    groups: ["Basic 10 - 14 Jahre"],
    filesCount: 1,
    scope: "boxzwerge",
  })
  assert.equal(blockedResult.ok, false)
})

test("replace logic keeps Basic and Boxzwerge isolated", () => {
  const basicSet = new Set(["Basic Ü18"])
  const boxSet = new Set([BOXZWERGE_UPLOAD_GROUP])

  assert.equal(
    shouldReplaceStoredRowForUploadedGroups(
      { excel: "Ja", groupExcel: "Basic Ü18", groupDb: "-" },
      basicSet
    ),
    true
  )
  assert.equal(
    shouldReplaceStoredRowForUploadedGroups(
      { excel: "Ja", groupExcel: BOXZWERGE_UPLOAD_GROUP, groupDb: "-" },
      basicSet
    ),
    false
  )
  assert.equal(
    shouldReplaceStoredRowForUploadedGroups(
      { excel: "Ja", groupExcel: "Basic Ü18", groupDb: "-" },
      boxSet
    ),
    false
  )
  assert.equal(
    shouldReplaceStoredRowForUploadedGroups(
      { excel: "Ja", groupExcel: BOXZWERGE_UPLOAD_GROUP, groupDb: "-" },
      boxSet
    ),
    true
  )
})

test("normal upload group list excludes Boxzwerge and L-Gruppe", () => {
  assert.equal(NORMAL_OFFICE_UPLOAD_GROUPS.some((group) => group === BOXZWERGE_UPLOAD_GROUP), false)
  assert.equal(NORMAL_OFFICE_UPLOAD_GROUPS.some((group) => group === "L-Gruppe"), false)
})
