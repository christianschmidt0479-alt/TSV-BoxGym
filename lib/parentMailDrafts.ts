import { createServerSupabaseServiceClient } from "@/lib/serverSupabase"
import { formatIsoDateForDisplay } from "@/lib/dateFormat"
import { DEFAULT_APP_BASE_URL } from "@/lib/mailConfig"

export type ParentFamilyMailRow = {
  parent_account_id: string
  parent_name: string
  parent_email: string
  parent_phone: string | null
  children: Array<{
    member_id: string
    child_name: string
    child_birthdate: string | null
    child_group: string | null
  }>
}

function getServerSupabase() {
  return createServerSupabaseServiceClient()
}

export async function getParentFamilyMailRows() {
  const supabase = getServerSupabase()
  const parentChildLinksResponse = await supabase
    .from("parent_child_links")
    .select(`
      member_id,
      parent_account_id,
      parent_accounts (
        id,
        parent_name,
        email,
        phone
      ),
      members (
        id,
        name,
        first_name,
        last_name,
        birthdate,
        base_group
      )
    `)

  if (parentChildLinksResponse.error) {
    throw parentChildLinksResponse.error
  }

  const groupedParentRows = new Map<string, ParentFamilyMailRow>()

  for (const row of (parentChildLinksResponse.data ?? []) as Array<Record<string, unknown>>) {
    const parent = Array.isArray(row.parent_accounts) ? row.parent_accounts[0] : row.parent_accounts
    const member = Array.isArray(row.members) ? row.members[0] : row.members

    if (!parent || !member || typeof row.parent_account_id !== "string") continue

    const parentName = typeof parent === "object" && "parent_name" in parent ? String(parent.parent_name ?? "") : ""
    const parentEmail = typeof parent === "object" && "email" in parent ? String(parent.email ?? "") : ""
    const parentPhone = typeof parent === "object" && "phone" in parent ? String(parent.phone ?? "") || null : null
    const childName =
      typeof member === "object"
        ? `${"first_name" in member ? String(member.first_name ?? "") : ""} ${"last_name" in member ? String(member.last_name ?? "") : ""}`.trim() ||
          ("name" in member ? String(member.name ?? "") : "")
        : ""
    const childBirthdate = typeof member === "object" && "birthdate" in member ? String(member.birthdate ?? "") || null : null
    const childGroup = typeof member === "object" && "base_group" in member ? String(member.base_group ?? "") || null : null

    const existing = groupedParentRows.get(row.parent_account_id)

    if (existing) {
      existing.children.push({
        member_id: typeof row.member_id === "string" ? row.member_id : "",
        child_name: childName,
        child_birthdate: childBirthdate,
        child_group: childGroup,
      })
      continue
    }

    groupedParentRows.set(row.parent_account_id, {
      parent_account_id: row.parent_account_id,
      parent_name: parentName,
      parent_email: parentEmail,
      parent_phone: parentPhone,
      children: [
        {
          member_id: typeof row.member_id === "string" ? row.member_id : "",
          child_name: childName,
          child_birthdate: childBirthdate,
          child_group: childGroup,
        },
      ],
    })
  }

  return Array.from(groupedParentRows.values())
    .map((row) => ({
      ...row,
      children: row.children.sort((a, b) => a.child_name.localeCompare(b.child_name)),
    }))
    .sort((a, b) => a.parent_name.localeCompare(b.parent_name))
}

export function getParentFamilyLink(row: ParentFamilyMailRow, baseUrl: string) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "") || DEFAULT_APP_BASE_URL
  const firstChildId = row.children[0]?.member_id || ""
  const params = new URLSearchParams({
    view: "parent",
    email: row.parent_email,
    child: firstChildId,
  })

  return `${normalizedBaseUrl}/mein-bereich?${params.toString()}#familienkonto`
}

export function getParentFamilySubject(row: ParentFamilyMailRow) {
  if (row.children.length === 1) {
    return `TSV BoxGym: Digitaler Zugang für ${row.children[0]?.child_name || "euer Kind"}`
  }

  return "TSV BoxGym: Digitaler Zugang für eure Kinder"
}

export function getParentFamilyBody(row: ParentFamilyMailRow, baseUrl: string) {
  const link = getParentFamilyLink(row, baseUrl)
  const childLines = row.children
    .map((child, index) => `${index + 1}. ${[child.child_name, formatIsoDateForDisplay(child.child_birthdate), child.child_group || null].filter(Boolean).join(" · ")}`)
    .join("\n")

  return `Liebe Eltern,

wir möchten euch informieren, dass wir im TSV BoxGym zukünftig eine digitale Anwesenheitsliste führen.

Für euer Elternkonto sind bereits folgende Kinder im System angelegt:
${childLines}

Über diesen Link gelangt ihr direkt in den Elternbereich:
${link}

Dort findet ihr alle angelegten Kinder direkt im Familienkonto. Die Eltern-E-Mail ist bereits vorausgefüllt.

Wichtig:
- Beim ersten Öffnen gebt ihr Vorname und Nachname des Elternteils an.
- Danach legt ihr euer eigenes Eltern-Passwort fest.
- Die Anwesenheit wird künftig vor Ort digital erfasst.
- Falls sich eure Kontaktdaten geändert haben, gebt uns bitte kurz Bescheid.

Vielen Dank für eure Unterstützung.

Sportliche Grüße
TSV BoxGym`
}
