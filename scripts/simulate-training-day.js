const fs = require('fs')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const { createClient } = require('@supabase/supabase-js')

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#')) continue
  const i = line.indexOf('=')
  if (i < 0) continue
  const k = line.slice(0, i).trim()
  let v = line.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  process.env[k] = v
}

const BASE_URL = 'http://localhost:3000'
const ORIGIN = 'http://localhost:3000'
const RUN_ID = Date.now().toString(36)

function b64u(s) {
  return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function sign(v) {
  return crypto.createHmac('sha256', process.env.TRAINER_SESSION_SECRET).update(v).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function makeAdminCookie() {
  const payload = {
    role: 'admin',
    accountRole: 'admin',
    linkedMemberId: null,
    accountEmail: 'simulation@test.local',
    accountFirstName: 'Sim',
    accountLastName: 'Admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
  const enc = b64u(JSON.stringify(payload))
  return `trainer_session=${enc}.${sign(enc)}`
}

function berlinDateParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  return {
    y: parts.year,
    m: parts.month,
    d: parts.day,
    hh: parts.hour || '00',
    mm: parts.minute || '00',
  }
}

function isoDateBerlin(date = new Date()) {
  const p = berlinDateParts(date)
  return `${p.y}-${p.m}-${p.d}`
}

function monthKey(date = new Date()) {
  return isoDateBerlin(date).slice(0, 7)
}

async function createMember(supabase, kind, opts) {
  const now = Date.now()
  const pin = opts.pin
  const memberPin = await bcrypt.hash(pin, 10)
  const email = `simday_${kind}_${RUN_ID}_${now}_${Math.random().toString(36).slice(2, 7)}@example.com`.toLowerCase()
  const displayKind = `${kind}_${RUN_ID}`
  const payload = {
    name: `SIM ${displayKind}`,
    first_name: 'SIM',
    last_name: displayKind,
    birthdate: '1992-01-01',
    email,
    member_pin: memberPin,
    privacy_accepted_at: new Date().toISOString(),
    is_trial: Boolean(opts.is_trial),
    trial_count: opts.is_trial ? 1 : 0,
    is_approved: Boolean(opts.is_approved),
    email_verified: opts.email_verified !== false,
    base_group: opts.base_group,
    member_qr_token: crypto.randomUUID(),
    member_qr_active: true,
  }
  const { data, error } = await supabase
    .from('members')
    .insert([payload])
    .select('id,email,first_name,last_name,name,is_trial,is_approved,email_verified,base_group,office_list_group')
    .single()
  if (error) throw new Error(`createMember ${kind}: ${error.message}`)
  return { ...data, pin }
}

async function seedHistoricalCheckins(supabase, member, count) {
  if (!count) return
  const rows = []
  for (let i = 0; i < count; i += 1) {
    const date = new Date(Date.now() - (i + 2) * 24 * 60 * 60 * 1000)
    const d = isoDateBerlin(date)
    rows.push({
      member_id: member.id,
      group_name: member.base_group || 'Basic U18',
      checkin_mode: 'normal',
      date: d,
      time: '18:00',
      year: Number(d.slice(0, 4)),
      month_key: d.slice(0, 7),
      created_at: date.toISOString(),
    })
  }
  const { error } = await supabase.from('checkins').insert(rows)
  if (error) throw new Error(`seedHistoricalCheckins ${member.id}: ${error.message}`)
}

async function callMemberCheckin(body, cookie) {
  const headers = {
    'content-type': 'application/json',
    origin: ORIGIN,
  }
  if (cookie) headers.cookie = cookie
  const res = await fetch(`${BASE_URL}/api/public/member-checkin`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }
  return { status: res.status, data }
}

async function callAdminGetMembers(cookie, pageSize = 500) {
  const res = await fetch(`${BASE_URL}/api/admin/get-members`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
    },
    body: JSON.stringify({ page: 1, pageSize }),
  })
  const data = await res.json()
  return { status: res.status, data }
}

async function callAdminApprove(cookie, memberId, baseGroup) {
  const res = await fetch(`${BASE_URL}/api/admin/member-action`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      cookie,
    },
    body: JSON.stringify({ action: 'approve', memberId, baseGroup }),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text }
  }
  return { status: res.status, data }
}

async function fetchTrainerHeuteHtml(cookie) {
  const res = await fetch(`${BASE_URL}/trainer/heute`, {
    headers: { cookie },
  })
  const html = await res.text()
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  return { status: res.status, html, visible }
}

function checkTrainerOrder(html, names) {
  const positions = names.map((n) => ({ name: n, pos: html.indexOf(n) }))
  return positions
}

function snippetAroundMember(visibleHtml, memberName) {
  const idx = visibleHtml.indexOf(memberName)
  if (idx < 0) return ''
  return visibleHtml.slice(Math.max(0, idx - 250), idx + 700)
}

function sortBucketForTrainer(member) {
  if (!member.is_approved && (member.checkinCount || 0) >= 7) return 1
  if (!member.is_approved) return 2
  return 3
}

function sortBucketForAdmin(member) {
  const count = member.checkinCount || 0
  if (member.checkedInToday && count >= 7) return 1
  if (member.checkedInToday && !member.is_approved) return 2
  if (member.checkedInToday) return 3
  if (!member.is_approved) return 4
  return 5
}

function memberLabel(member) {
  return (member.name || `${member.first_name || ''} ${member.last_name || ''}`).trim()
}

function computeAdminDerived(members) {
  const sorted = [...members].sort((a, b) => {
    const bucketDiff = sortBucketForAdmin(a) - sortBucketForAdmin(b)
    if (bucketDiff !== 0) return bucketDiff
    const countDiff = (b.checkinCount || 0) - (a.checkinCount || 0)
    if (countDiff !== 0) return countDiff
    return memberLabel(a).localeCompare(memberLabel(b), 'de')
  })

  return {
    totalToday: members.filter((m) => Boolean(m.checkedInToday)).length,
    totalCritical: members.filter((m) => (m.checkinCount || 0) >= 7).length,
    totalOpen: members.filter((m) => !m.is_approved).length,
    sorted,
  }
}

function yesNo(v) {
  return v ? 'JA' : 'NEIN'
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const cookie = makeAdminCookie()

  const members = {}
  members.A = await createMember(supabase, 'A_normal', { pin: '1111', email_verified: true, is_approved: true, is_trial: false, base_group: 'Basic U18' })
  members.B = await createMember(supabase, 'B_unverified', { pin: '2222', email_verified: false, is_approved: true, is_trial: false, base_group: 'Basic U18' })
  members.C = await createMember(supabase, 'C_critical7', { pin: '3333', email_verified: true, is_approved: false, is_trial: false, base_group: 'Basic U18' })
  members.D = await createMember(supabase, 'D_trial3', { pin: '4444', email_verified: true, is_approved: false, is_trial: true, base_group: 'Basic U18' })
  members.E = await createMember(supabase, 'E_no_group', { pin: '5555', email_verified: true, is_approved: true, is_trial: false, base_group: null })

  await seedHistoricalCheckins(supabase, members.C, 7)
  await seedHistoricalCheckins(supabase, members.D, 3)

  const observations = []
  const issues = []

  const trainerBefore = await fetchTrainerHeuteHtml(cookie)
  const trainerBeforeNames = Object.values(members).map((m) => memberLabel(m))
  const trainerBeforePresence = trainerBeforeNames.map((n) => ({ name: n, shown: trainerBefore.visible.includes(n) }))
  observations.push(`Trainer vor Check-ins: ${trainerBeforePresence.filter((x) => x.shown).length}/5 Testmitglieder sichtbar`)

  const resA = await callMemberCheckin({ email: members.A.email, pin: members.A.pin })
  const resB = await callMemberCheckin({ email: members.B.email, pin: members.B.pin })
  const resC1 = await callMemberCheckin({ email: members.C.email, pin: members.C.pin })
  const resC2 = await callMemberCheckin({ email: members.C.email, pin: members.C.pin })
  const resD = await callMemberCheckin({ email: members.D.email, pin: members.D.pin })
  const resE = await callMemberCheckin({ email: members.E.email, pin: members.E.pin })

  const trainerDouble1 = await callMemberCheckin({ memberId: members.A.id, source: 'trainer' }, cookie)
  const trainerDouble2 = await callMemberCheckin({ memberId: members.A.id, source: 'trainer' }, cookie)

  observations.push(`A Check-in: ${resA.status}`)
  observations.push(`B Check-in: ${resB.status} / reason=${resB.data.reason || '-'}`)
  observations.push(`C Check-in1: ${resC1.status}, Check-in2: ${resC2.status} / reason2=${resC2.data.reason || '-'}`)
  observations.push(`D Check-in: ${resD.status} / reason=${resD.data.reason || '-'}`)
  observations.push(`E Check-in: ${resE.status} / reason=${resE.data.reason || '-'}`)
  observations.push(`Edge Trainer doppelt: ${trainerDouble1.status} dann ${trainerDouble2.status} / reason2=${trainerDouble2.data.reason || '-'}`)

  const trainerAfter = await fetchTrainerHeuteHtml(cookie)
  const orderPositions = checkTrainerOrder(trainerAfter.visible, [memberLabel(members.C), memberLabel(members.D), memberLabel(members.A), memberLabel(members.B), memberLabel(members.E)])

  const hasCWarning = trainerAfter.visible.includes('🔴 heute letzter Check vor Sperre')
  const hasCheckRequired = trainerAfter.visible.includes('⚠ Prüfung durch Geschäftsstelle erforderlich')
  const hasEmailNotVerified = trainerAfter.visible.includes('❌ E-Mail nicht bestätigt')
  const hasNoGroup = trainerAfter.visible.includes('❌ Keine Trainingsgruppe zugewiesen')
  const hasHeuteDa = trainerAfter.visible.includes('✔ HEUTE DA')

  observations.push(`Trainer nach Check-ins: Warnungen gefunden -> letzterCheck=${yesNo(hasCWarning)}, pruefung=${yesNo(hasCheckRequired)}, email=${yesNo(hasEmailNotVerified)}, keineGruppe=${yesNo(hasNoGroup)}, heuteDa=${yesNo(hasHeuteDa)}`)

  const adminListBeforeApprove = await callAdminGetMembers(cookie, 500)
  const adminRows = (adminListBeforeApprove.data?.data || [])
  const testRows = adminRows.filter((row) => Object.values(members).some((m) => m.id === row.id))
  const adminDerived = computeAdminDerived(testRows)

  observations.push(`Admin Kennzahlen (nur Testmitglieder): heute=${adminDerived.totalToday}, kritisch=${adminDerived.totalCritical}, offen=${adminDerived.totalOpen}`)

  const cRowBefore = testRows.find((r) => r.id === members.C.id)
  const dRowBefore = testRows.find((r) => r.id === members.D.id)
  const eRowBefore = testRows.find((r) => r.id === members.E.id)
  const bRowBefore = testRows.find((r) => r.id === members.B.id)

  const cRecommendation = Boolean(cRowBefore && cRowBefore.email_verified && !cRowBefore.is_approved && (cRowBefore.checkinCount || 0) >= 5)
  const dRecommendation = Boolean(dRowBefore && dRowBefore.email_verified && !dRowBefore.is_approved && (dRowBefore.checkinCount || 0) >= 5)
  const groupDeviationVisible = Boolean(testRows.some((r) => r.base_group && r.office_list_group && r.base_group !== r.office_list_group))
  const newMemberVisible = Boolean(bRowBefore && !bRowBefore.email_verified)

  observations.push(`Admin Anzeige: Empfehlung C=${yesNo(cRecommendation)}, Empfehlung D=${yesNo(dRecommendation)}, Gruppenabweichung=${yesNo(groupDeviationVisible)}, neueMitglieder(B)=${yesNo(newMemberVisible)}`)

  const approveC = await callAdminApprove(cookie, members.C.id, 'Basic Ü18')
  const adminListAfterApprove = await callAdminGetMembers(cookie, 500)
  const testRowsAfter = (adminListAfterApprove.data?.data || []).filter((row) => Object.values(members).some((m) => m.id === row.id))
  const cRowAfter = testRowsAfter.find((r) => r.id === members.C.id)

  const cTrainerPostApprove = await callMemberCheckin({ memberId: members.C.id, source: 'trainer' }, cookie)
  observations.push(`Admin Freigabe C: status=${approveC.status}, is_approved_nachher=${String(Boolean(cRowAfter?.is_approved))}, trainerCheckC_nachher=${cTrainerPostApprove.status}`)

  const trainerAfterApprove = await fetchTrainerHeuteHtml(cookie)
  const cAfterApproveSnippet = snippetAroundMember(trainerAfterApprove.visible, memberLabel(members.C))
  const cStillHasWarning = /letzter Check vor Sperre|Prüfung durch Geschäftsstelle erforderlich/.test(cAfterApproveSnippet)
  observations.push(`Trainer nach Admin-Aktion: C Warnhinweis weg=${yesNo(!cStillHasWarning)}`)

  const checks = [
    { name: 'A Erfolg 200', ok: resA.status === 200 && resA.data?.ok === true },
    { name: 'B blockiert EMAIL_NOT_VERIFIED', ok: resB.status === 400 && resB.data?.reason === 'EMAIL_NOT_VERIFIED' },
    { name: 'C Erfolg (7/8)', ok: resC1.status === 200 && resC1.data?.ok === true },
    { name: 'C erneut DUPLICATE', ok: resC2.status === 400 && resC2.data?.reason === 'DUPLICATE' },
    { name: 'D Trial-Limit', ok: resD.status === 400 && resD.data?.reason === 'LIMIT_TRIAL' },
    { name: 'E no_group blockiert', ok: resE.status === 400 && resE.data?.reason === 'NO_GROUP' },
    { name: 'Trainer doppelt -> DUPLICATE', ok: trainerDouble2.status === 400 && trainerDouble2.data?.reason === 'DUPLICATE' },
    { name: 'Admin gibt C frei', ok: approveC.status === 200 && Boolean(cRowAfter?.is_approved) },
  ]

  if (!trainerBeforePresence.every((x) => x.shown)) {
    issues.push({ severity: 'mittel', text: 'Trainer-Ansicht zeigt nicht alle 5 Testmitglieder. Seite listet nur bereits heute eingecheckte Personen.' })
  }

  const trainerSortedExpected = [memberLabel(members.C), memberLabel(members.D), memberLabel(members.A), memberLabel(members.B), memberLabel(members.E)]
  const presentPositions = trainerSortedExpected
    .map((name) => ({ name, pos: trainerAfter.visible.indexOf(name) }))
    .filter((x) => x.pos >= 0)
  const isOrdered = presentPositions.every((x, idx) => idx === 0 || x.pos > presentPositions[idx - 1].pos)
  if (!isOrdered) {
    issues.push({ severity: 'mittel', text: 'Trainer-Reihenfolge entspricht nicht vollständig der erwarteten Bucket-Logik aus dem Szenario.' })
  }

  if (!hasEmailNotVerified || !hasNoGroup) {
    issues.push({ severity: 'kosmetisch', text: 'Trainer-Badges für E-Mail nicht bestätigt oder keine Gruppe fehlen in der Tagesansicht, wenn betroffene Mitglieder nicht eingecheckt sind.' })
  }

  if (!checks.every((c) => c.ok)) {
    issues.push({ severity: 'kritisch', text: 'Mindestens ein Kern-Check-in-Flow verhält sich nicht wie erwartet.' })
  }

  const overall = checks.every((c) => c.ok) && issues.filter((i) => i.severity === 'kritisch').length === 0

  console.log('=== Beobachtungen ===')
  observations.forEach((o, i) => console.log(`${i + 1}. ${o}`))

  console.log('\n=== Checks ===')
  checks.forEach((c, i) => console.log(`${i + 1}. ${c.name}: ${yesNo(c.ok)}`))

  console.log('\n=== Trainer Reihenfolge-Positionen (nach Check-ins) ===')
  orderPositions.forEach((o) => console.log(`${o.name}: ${o.pos}`))

  console.log('\n=== Alles korrekt? ===')
  console.log(overall ? 'JA' : 'NEIN')

  const bySeverity = {
    kritisch: issues.filter((i) => i.severity === 'kritisch'),
    mittel: issues.filter((i) => i.severity === 'mittel'),
    kosmetisch: issues.filter((i) => i.severity === 'kosmetisch'),
  }

  console.log('\n=== Fehler nach Priorität ===')
  console.log(`kritisch: ${bySeverity.kritisch.length}`)
  bySeverity.kritisch.forEach((x) => console.log(`- ${x.text}`))
  console.log(`mittel: ${bySeverity.mittel.length}`)
  bySeverity.mittel.forEach((x) => console.log(`- ${x.text}`))
  console.log(`kosmetisch: ${bySeverity.kosmetisch.length}`)
  bySeverity.kosmetisch.forEach((x) => console.log(`- ${x.text}`))

  console.log('\n=== Rohdaten ===')
  console.log(JSON.stringify({
    members,
    responses: { resA, resB, resC1, resC2, resD, resE, trainerDouble1, trainerDouble2, approveC, cTrainerPostApprove },
  }, null, 2))
}

main().catch((e) => {
  console.error('SIMULATION_ERROR', e)
  process.exit(1)
})
