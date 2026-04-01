import fs from "node:fs"
import { createClient } from "@supabase/supabase-js"

const PARENT_SETUP_PENDING_HASH = "__parent_setup_pending__"

function readEnvFile(path) {
  return Object.fromEntries(
    fs
      .readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=")
        return [line.slice(0, index), line.slice(index + 1)]
      })
  )
}

function encodeManualParentDraft(payload) {
  return `manual_parent_mail:${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`
}

function getParentName(children) {
  const guardianNames = [...new Set(children.map((child) => (child.guardian_name ?? "").trim()).filter(Boolean))]
  if (guardianNames.length > 0) {
    return guardianNames[0]
  }

  const lastNames = [...new Set(children.map((child) => child.last_name).filter(Boolean))]
  if (lastNames.length === 1) {
    return `Familie ${lastNames[0]}`
  }

  return `Eltern ${children[0]?.last_name || children[0]?.name || "Boxzwerge"}`
}

const env = readEnvFile(".env.local")

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const { data: members, error: membersError } = await supabase
  .from("members")
  .select("id, first_name, last_name, name, birthdate, email, phone, guardian_name, base_group")
  .eq("base_group", "Boxzwerge")
  .order("last_name", { ascending: true })
  .order("first_name", { ascending: true })

if (membersError) {
  throw membersError
}

const groupedByEmail = new Map()

for (const member of members ?? []) {
  const email = (member.email ?? "").trim().toLowerCase()
  if (!email) continue

  const existing = groupedByEmail.get(email) ?? {
    email,
    phone: member.phone ?? null,
    children: [],
  }

  existing.children.push(member)

  if (!existing.phone && member.phone) {
    existing.phone = member.phone
  }

  groupedByEmail.set(email, existing)
}

const queuedParents = []

for (const group of Array.from(groupedByEmail.values()).sort((a, b) => a.email.localeCompare(b.email))) {
  const parentName = getParentName(group.children)
  const accessCodeHash = PARENT_SETUP_PENDING_HASH

  const { data: parentAccount, error: parentError } = await supabase
    .from("parent_accounts")
    .upsert(
      {
        parent_name: parentName,
        email: group.email,
        phone: group.phone,
        access_code_hash: accessCodeHash,
      },
      { onConflict: "email" }
    )
    .select("*")
    .single()

  if (parentError) {
    throw parentError
  }

  for (const child of group.children) {
    const { error: deleteError } = await supabase.from("parent_child_links").delete().eq("member_id", child.id)
    if (deleteError) {
      throw deleteError
    }

    const { error: linkError } = await supabase.from("parent_child_links").insert({
      parent_account_id: parentAccount.id,
      member_id: child.id,
    })
    if (linkError) {
      throw linkError
    }
  }

  const sortedChildren = [...group.children].sort((a, b) =>
    `${a.last_name ?? ""} ${a.first_name ?? ""}`.localeCompare(`${b.last_name ?? ""} ${b.first_name ?? ""}`)
  )

  queuedParents.push({
    parentId: parentAccount.id,
    parent: parentName,
    email: group.email,
    children: sortedChildren.map((child) => `${child.first_name ?? ""} ${child.last_name ?? ""}`.trim() || child.name || ""),
  })

  const firstChildId = sortedChildren[0]?.id || ""
  const link = `${"https://www.tsvboxgym.de"}/mein-bereich?${new URLSearchParams({
    view: "parent",
    email: group.email,
    child: firstChildId,
  }).toString()}#familienkonto`

  const childLines = sortedChildren
    .map((child, index) => `${index + 1}. ${[`${child.first_name ?? ""} ${child.last_name ?? ""}`.trim() || child.name || "", child.birthdate ?? null, child.base_group ?? null].filter(Boolean).join(" · ")}`)
    .join("\n")

  const subject =
    sortedChildren.length === 1
      ? `TSV BoxGym: Digitaler Zugang für ${(sortedChildren[0]?.first_name ?? sortedChildren[0]?.name ?? "euer Kind").trim()}`
      : "TSV BoxGym: Digitaler Zugang für eure Kinder"

  const body = `Liebe Eltern,

wir führen im TSV BoxGym künftig eine digitale Anwesenheitsliste. Dafür haben wir für euch bereits ein Elternkonto mit euren Kindern vorbereitet.

Für euer Elternkonto sind folgende Kinder angelegt:
${childLines}

Direktlink zum Elternbereich:
${link}

Hinweise:
- Bitte öffnet den Link und meldet euch mit eurer Eltern-E-Mail-Adresse an.
- Beim ersten Öffnen gebt bitte Vorname und Nachname des Elternteils an.
- Danach legt ihr euren eigenen Eltern-Zugangscode fest.
- Im Elternbereich seht ihr alle angelegten Kinder gemeinsam in einem Familienkonto.
- Falls sich eure Kontaktdaten geändert haben, gebt uns bitte kurz Bescheid.

Vielen Dank für eure Unterstützung.

Sportliche Grüße
TSV BoxGym`

  const encodedDraft = encodeManualParentDraft({
    parent_account_id: parentAccount.id,
    parent_name: parentName,
    parent_email: group.email,
    parent_phone: group.phone,
    subject,
    body,
    link,
    children: sortedChildren.map((child) => ({
      member_id: child.id,
      child_name: `${child.first_name ?? ""} ${child.last_name ?? ""}`.trim() || child.name || "",
      child_birthdate: child.birthdate ?? null,
      child_group: child.base_group ?? null,
    })),
  })

  const { data: existingDraftRows, error: existingDraftError } = await supabase
    .from("outgoing_mail_queue")
    .select("id")
    .eq("purpose", "competition_removed")
    .eq("email", group.email)
    .like("name", "manual_parent_mail:%")
    .limit(1)

  if (existingDraftError) {
    throw existingDraftError
  }

  if (existingDraftRows?.[0]?.id) {
    const { error } = await supabase
      .from("outgoing_mail_queue")
      .update({
        name: encodedDraft,
        sent_at: null,
        sent_batch_key: null,
      })
      .eq("id", existingDraftRows[0].id)

    if (error) {
      throw error
    }
  } else {
    const { error } = await supabase.from("outgoing_mail_queue").insert({
      purpose: "competition_removed",
      email: group.email,
      name: encodedDraft,
    })

    if (error) {
      throw error
    }
  }
}

console.log(JSON.stringify({ queued: queuedParents.length, parents: queuedParents }, null, 2))
