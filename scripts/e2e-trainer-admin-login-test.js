const fs = require('fs')
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

const EMAIL = 'christian.schmidt@tsv-falkensee.de'
const TEST_PASSWORD = 'TEST_PASSWORT'
const BASE = 'http://localhost:3000'

function parseTrainerSessionFromSetCookie(setCookieHeader) {
  if (!setCookieHeader) return null
  const first = setCookieHeader.split(',')[0]
  const m = first.match(/trainer_session=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

function decodePayload(token) {
  const [payload] = String(token || '').split('.')
  if (!payload) return null
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4)
  try {
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: existing, error: readErr } = await supabase
    .from('trainer_accounts')
    .select('id,email,role,email_verified,is_approved')
    .eq('email', EMAIL)
    .order('created_at', { ascending: false })
    .limit(1)

  if (readErr) throw new Error(`trainer lookup failed: ${readErr.message}`)
  const trainer = existing?.[0]
  if (!trainer) throw new Error('trainer account not found for test email')

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)

  const { error: ensureAdminErr } = await supabase
    .from('trainer_accounts')
    .update({
      password_hash: passwordHash,
      role: 'admin',
      email_verified: true,
      is_approved: true,
    })
    .eq('id', trainer.id)

  if (ensureAdminErr) throw new Error(`ensure admin setup failed: ${ensureAdminErr.message}`)

  console.log('PREP: trainer row ready (admin + known bcrypt password)')

  const loginAdmin = await fetch(`${BASE}/api/trainer-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: TEST_PASSWORD }),
  })
  const loginAdminBodyText = await loginAdmin.text()
  let loginAdminBody = null
  try {
    loginAdminBody = JSON.parse(loginAdminBodyText)
  } catch {
    loginAdminBody = { raw: loginAdminBodyText }
  }

  const setCookieAdmin = loginAdmin.headers.get('set-cookie')
  const trainerSessionAdmin = parseTrainerSessionFromSetCookie(setCookieAdmin)

  console.log('\nTEST 1 - LOGIN REQUEST')
  console.log('status', loginAdmin.status)
  console.log('ok', Boolean(loginAdminBody?.ok))
  console.log('set-cookie contains trainer_session', Boolean(trainerSessionAdmin))
  if (loginAdminBody?.ok) console.log('TRAINER LOGIN SUCCESS')
  if (trainerSessionAdmin) console.log('SESSION TOKEN CREATED', trainerSessionAdmin.length)

  const payloadAdmin = decodePayload(trainerSessionAdmin)
  console.log('ROLE FROM TOKEN', payloadAdmin?.role || null)

  const trainerPage = await fetch(`${BASE}/trainer`, {
    headers: { cookie: `trainer_session=${encodeURIComponent(trainerSessionAdmin || '')}` },
    redirect: 'manual',
  })

  console.log('\nTEST 2 - COOKIE VALIDIEREN (/trainer)')
  console.log('status', trainerPage.status)
  console.log('location', trainerPage.headers.get('location') || '-')

  const verwaltungAdmin = await fetch(`${BASE}/verwaltung-neu`, {
    headers: { cookie: `trainer_session=${encodeURIComponent(trainerSessionAdmin || '')}` },
    redirect: 'manual',
  })

  console.log('\nTEST 3 - ADMIN ZUGRIFF (/verwaltung-neu)')
  console.log('status', verwaltungAdmin.status)
  console.log('location', verwaltungAdmin.headers.get('location') || '-')

  const { error: roleTrainerErr } = await supabase
    .from('trainer_accounts')
    .update({ role: 'trainer' })
    .eq('id', trainer.id)
  if (roleTrainerErr) throw new Error(`set trainer role failed: ${roleTrainerErr.message}`)

  const loginTrainer = await fetch(`${BASE}/api/trainer-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: TEST_PASSWORD }),
  })
  const setCookieTrainer = loginTrainer.headers.get('set-cookie')
  const trainerSessionTrainer = parseTrainerSessionFromSetCookie(setCookieTrainer)
  const payloadTrainer = decodePayload(trainerSessionTrainer)

  const verwaltungTrainer = await fetch(`${BASE}/verwaltung-neu`, {
    headers: { cookie: `trainer_session=${encodeURIComponent(trainerSessionTrainer || '')}` },
    redirect: 'manual',
  })

  console.log('\nTEST 4 - NEGATIVTEST (trainer role)')
  console.log('login status', loginTrainer.status)
  console.log('ROLE FROM TOKEN', payloadTrainer?.role || null)
  console.log('/verwaltung-neu status', verwaltungTrainer.status)
  console.log('/verwaltung-neu location', verwaltungTrainer.headers.get('location') || '-')

  const { error: restoreErr } = await supabase
    .from('trainer_accounts')
    .update({ role: 'admin' })
    .eq('id', trainer.id)
  if (restoreErr) throw new Error(`restore admin role failed: ${restoreErr.message}`)

  const noCookieTrainer = await fetch(`${BASE}/trainer`, { redirect: 'manual' })

  console.log('\nTEST 5 - INVALID COOKIE (ohne Cookie)')
  console.log('status', noCookieTrainer.status)
  console.log('location', noCookieTrainer.headers.get('location') || '-')

  console.log('\nDONE')
}

main().catch((e) => {
  console.error('E2E_TEST_ERROR', e)
  process.exit(1)
})
