import assert from "node:assert/strict"
import { test } from "node:test"

import {
  registerMemberServiceWithDeps,
  type RegisterMemberInput,
  type RegisterMemberServiceDeps,
} from "./memberRegisterService"

function createValidInput(): RegisterMemberInput {
  return {
    firstName: "Max",
    lastName: "Mustermann",
    birthDate: "1991-02-03",
    gender: "m",
    password: "Sicher12!",
    email: "max@example.com",
    phone: "01701234567",
    baseGroup: "Jugend",
    consent: true,
    memberPhase: "trial",
    isTrial: true,
    isApproved: false,
  }
}

function createBaseDeps(overrides?: Partial<RegisterMemberServiceDeps>): RegisterMemberServiceDeps {
  return {
    findMemberByEmail: async () => null,
    createMember: async () => ({ id: "member-1" } as { id: string }),
    updateMemberRegistrationData: async () => ({}),
    runRegistrationOfficePrecheck: async () => null,
    sendMemberVerificationMail: async () => undefined,
    ...overrides,
  }
}

test("registration precheck does not write visible office_list fields", async () => {
  let createPayload: Record<string, unknown> | null = null
  let updatePayload: Record<string, unknown> | null = null

  const deps = createBaseDeps({
    createMember: async (input) => {
      createPayload = input as unknown as Record<string, unknown>
      return { id: "member-1" } as { id: string }
    },
    updateMemberRegistrationData: async (_memberId, input) => {
      updatePayload = input as Record<string, unknown>
      return {}
    },
  })

  const result = await registerMemberServiceWithDeps(createValidInput(), deps)

  assert.equal(result.ok, true)
  assert.equal(createPayload?.["office_list_status"], undefined)
  assert.equal(createPayload?.["office_list_group"], undefined)
  assert.equal(createPayload?.["office_list_checked_at"], undefined)

  assert.equal(updatePayload?.["office_list_status"], undefined)
  assert.equal(updatePayload?.["office_list_group"], undefined)
  assert.equal(updatePayload?.["office_list_checked_at"], undefined)
})

test("registration succeeds even when office precheck fails", async () => {
  let precheckCalled = false

  const deps = createBaseDeps({
    runRegistrationOfficePrecheck: async () => {
      precheckCalled = true
      throw new Error("precheck unavailable")
    },
  })

  const result = await registerMemberServiceWithDeps(createValidInput(), deps)

  assert.equal(precheckCalled, true)
  assert.deepEqual(result, {
    ok: true,
    memberId: "member-1",
    mailSent: true,
  })
})
