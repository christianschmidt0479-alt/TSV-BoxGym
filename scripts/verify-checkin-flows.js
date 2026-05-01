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

function b64u(s) {
  return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function sign(v) {
  return crypto
    .createHmac('sha256', process.env.TRAINER_SESSION_SECRET)
    .update(v)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function dayISO(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

async function createMember(supabase, kind, pin, opts = {}) {
  const email = `verify_${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`
  const memberPinHash = await bcrypt.hash(pin, 10)
  const payload = {
    name: `Verify ${kind}`,
    first_name: 'Verify',
    last_name: kind,
    birthdate: '1995-01-01',
    email,
    member_pin: memberPinHash,
    privacy_accepted_at: new Date().toISOString(),
    is_trial: Boolean(opts.is_trial),
    trial_count: opts.is_trial ? 1 : 0,
    is_approved: Boolean(opts.is_approved),
    email_verified: opts.email_verified !== false,
    base_group: opts.base_group || 'Basic U18',
    member_qr_token: crypto.randomUUID(),
    member_qr_active: true,
  }

  const { data, error } = await supabase.from('members').insert([payload]).select('id,email,base_group').single()
  if (error) throw new Error(`createMember(${kind}) failed: ${error.message}`)

  return {
    id: data.id,
    email: data.email,
    baseGroup: data.base_group,
    pin,
  }
}

async function seedCheckins(supabase, memberId, count, includeToday = false, groupName = 'Basic U18') {
  const rows = []
  for (let i = 0; i < count; i += 1) {
    const checkinDate = dayISO(i + 2)
    rows.push({
      member_id: memberId,
      group_name: groupName,
      checkin_mode: 'normal',
      date: checkinDate,
      time: '18:00',
      year: Number(checkinDate.slice(0, 4)),
      month_key: checkinDate.slice(0, 7),
      created_at: new Date(Date.now() - (i + 2) * 24 * 60 * 60 * 1000).toISOString(),
    })
  }

  if (includeToday) {
    const t = todayISO()
    rows.push({
      member_id: memberId,
      group_name: groupName,
      checkin_mode: 'normal',
      date: t,
      time: '18:30',
      year: Number(t.slice(0, 4)),
      month_key: t.slice(0, 7),
      created_at: new Date().toISOString(),
    })
  }

  if (rows.length) {
    const { error } = await supabase.from('checkins').insert(rows)
    if (error) throw new Error(`seedCheckins(${memberId}) failed: ${error.message}`)
  }
}

async function callCheckin(body, cookie) {
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

  const raw = await res.text()
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = { raw }
  }

  return {
    status: res.status,
    body: parsed,
  }
}

function mkRow(test, result, expectedStatus, expectedReason, okPredicate) {
  const status = result?.status ?? 'n/a'
  const ok = typeof result?.body?.ok === 'boolean' ? String(result.body.ok) : 'n/a'
  const reason = result?.body?.reason ?? ''
  const correct = okPredicate(result, expectedStatus, expectedReason) ? 'JA' : 'NEIN'
  return { test, status, ok, reason, correct }
}

function printTable(rows) {
  const headers = ['Test', 'Status', 'ok', 'reason', 'Ergebnis korrekt?']
  const data = rows.map((r) => [r.test, String(r.status), r.ok, r.reason, r.correct])
  const widths = headers.map((h, idx) => Math.max(h.length, ...data.map((d) => d[idx].length)))
  const line = (arr) => arr.map((v, i) => v.padEnd(widths[i])).join(' | ')

  console.log(line(headers))
  console.log(widths.map((w) => '-'.repeat(w)).join('-|-'))
  for (const row of data) console.log(line(row))
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const sessionPayload = {
    role: 'admin',
    accountRole: 'admin',
    linkedMemberId: null,
    accountEmail: 'verify@test.local',
    accountFirstName: 'Verify',
    accountLastName: 'Admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
  const encoded = b64u(JSON.stringify(sessionPayload))
  const trainerCookie = `trainer_session=${encoded}.${sign(encoded)}`

  const memberSuccess = await createMember(supabase, 'member_success', '1111', { is_trial: false, is_approved: true, email_verified: true })
  const memberWrongPin = await createMember(supabase, 'member_wrong_pin', '2222', { is_trial: false, is_approved: true, email_verified: true })
  const memberDuplicate = await createMember(supabase, 'member_duplicate', '3333', { is_trial: false, is_approved: true, email_verified: true })
  const trialLimit = await createMember(supabase, 'trial_limit', '4444', { is_trial: true, is_approved: false, email_verified: true })
  const memberLimit = await createMember(supabase, 'member_limit', '5555', { is_trial: false, is_approved: false, email_verified: true })
  const emailNotVerified = await createMember(supabase, 'email_not_verified', '6666', { is_trial: false, is_approved: false, email_verified: false })
  const trainerMember = await createMember(supabase, 'trainer_member', '7777', { is_trial: false, is_approved: true, email_verified: true })

  await seedCheckins(supabase, trialLimit.id, 3, false, trialLimit.baseGroup)
  await seedCheckins(supabase, memberLimit.id, 8, false, memberLimit.baseGroup)

  const t1 = await callCheckin({ email: memberSuccess.email, pin: memberSuccess.pin })
  const t2 = await callCheckin({ email: memberWrongPin.email, pin: '9999' })

  const d1 = await callCheckin({ email: memberDuplicate.email, pin: memberDuplicate.pin })
  const d2 = await callCheckin({ email: memberDuplicate.email, pin: memberDuplicate.pin })

  const t4 = await callCheckin({ email: trialLimit.email, pin: trialLimit.pin })
  const t5 = await callCheckin({ email: memberLimit.email, pin: memberLimit.pin })
  const t6 = await callCheckin({ email: emailNotVerified.email, pin: emailNotVerified.pin })
  const t7 = await callCheckin({ memberId: trainerMember.id, source: 'trainer' }, trainerCookie)

  const insertedCheckinIds = []
  if (t1.body?.checkinId) insertedCheckinIds.push(t1.body.checkinId)
  if (d1.body?.checkinId) insertedCheckinIds.push(d1.body.checkinId)
  if (t7.body?.checkinId) insertedCheckinIds.push(t7.body.checkinId)

  let groupNameCheck = { pass: false, details: '' }
  if (insertedCheckinIds.length > 0) {
    const { data, error } = await supabase
      .from('checkins')
      .select('id, member_id, group_name')
      .in('id', insertedCheckinIds)

    if (error) {
      groupNameCheck = { pass: false, details: `DB error: ${error.message}` }
    } else {
      const nullRows = (data || []).filter((row) => !row.group_name)
      groupNameCheck = {
        pass: nullRows.length === 0,
        details: nullRows.length === 0 ? `alle ${data.length} Inserts mit group_name gesetzt` : `${nullRows.length} Rows ohne group_name`,
      }
    }
  } else {
    groupNameCheck = { pass: false, details: 'keine erfolgreichen Checkin-Inserts zum Prüfen' }
  }

  const rows = []
  rows.push(
    mkRow('1) MEMBER LOGIN Erfolg', t1, 200, '', (r, s) => r.status === s && r.body?.ok === true && !!r.body?.checkinId)
  )
  rows.push(
    mkRow('2) MEMBER LOGIN falscher PIN', t2, 401, '', (r, s) => r.status === s && r.body?.ok === false)
  )
  rows.push(
    mkRow('3) DUPLICATE (2. Versuch)', d2, 400, 'DUPLICATE', (r, s, reason) => r.status === s && r.body?.ok === false && r.body?.reason === reason)
  )
  rows.push(
    mkRow('4) TRIAL LIMIT (4. Versuch)', t4, 400, 'LIMIT_TRIAL', (r, s, reason) => r.status === s && r.body?.ok === false && r.body?.reason === reason)
  )
  rows.push(
    mkRow('5) MEMBER LIMIT (9. Versuch)', t5, 400, 'LIMIT_MEMBER', (r, s, reason) => r.status === s && r.body?.ok === false && r.body?.reason === reason)
  )
  rows.push(
    mkRow('6) EMAIL NOT VERIFIED', t6, 400, 'EMAIL_NOT_VERIFIED', (r, s, reason) => r.status === s && r.body?.ok === false && r.body?.reason === reason)
  )
  rows.push(
    mkRow('7) TRAINER CHECK-IN', t7, 200, '', (r, s) => r.status === s && r.body?.ok === true && !!r.body?.checkinId)
  )

  rows.push({
    test: '8) GROUP_NAME != null',
    status: groupNameCheck.pass ? '200' : '500',
    ok: groupNameCheck.pass ? 'true' : 'false',
    reason: groupNameCheck.details,
    correct: groupNameCheck.pass ? 'JA' : 'NEIN',
  })

  printTable(rows)

  console.log('\n--- Raw Responses ---')
  console.log('T1', JSON.stringify(t1.body))
  console.log('T2', JSON.stringify(t2.body))
  console.log('D1', JSON.stringify(d1.body))
  console.log('D2', JSON.stringify(d2.body))
  console.log('T4', JSON.stringify(t4.body))
  console.log('T5', JSON.stringify(t5.body))
  console.log('T6', JSON.stringify(t6.body))
  console.log('T7', JSON.stringify(t7.body))
}

main().catch((e) => {
  console.error('VERIFY_SCRIPT_ERROR', e)
  process.exit(1)
})
