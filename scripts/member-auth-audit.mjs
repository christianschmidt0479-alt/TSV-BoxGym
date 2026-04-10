#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

// ENV-Check
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Fehlende ENV-Variablen: NEXT_PUBLIC_SUPABASE_URL und/oder SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const OUTDIR = path.resolve("/tmp/member-auth-audit");

async function main() {
  await fs.mkdir(OUTDIR, { recursive: true });

  // Mitglieder laden (ohne Boxzwerge)
  const { data: members, error } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, auth_user_id, email_verified, is_approved, member_pin, privacy_accepted_at, member_qr_token, created_at, base_group, is_boxzwerg")
    .neq("is_boxzwerg", true);
  if (error) throw error;

  // Hilfsfunktionen
  const isValidEmail = (email) => typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isValidPin = (pin) => typeof pin === "string" && pin.length >= 8 && pin.length <= 64 && !/\s/.test(pin);

  // Doppelte E-Mails
  const emailMap = new Map();
  for (const m of members) {
    if (!m.email) continue;
    const key = m.email.trim().toLowerCase();
    if (!emailMap.has(key)) emailMap.set(key, []);
    emailMap.get(key).push(m);
  }
  const duplicateEmails = Array.from(emailMap.entries()).filter(([_, arr]) => arr.length > 1);

  // Kategorien
  const blockers = [];
  const info = [];
  const duplicates = new Set();

  for (const m of members) {
    const reason = [];
    if (!m.email || m.email.trim() === "") reason.push("email_missing");
    else if (!isValidEmail(m.email)) reason.push("email_invalid");
    if (emailMap.get(m.email?.trim().toLowerCase() || "").length > 1) {
      reason.push("email_duplicate");
      duplicates.add(m.email.trim().toLowerCase());
    }
    if (!m.member_pin || m.member_pin.trim() === "") reason.push("pin_missing");
    else if (!isValidPin(m.member_pin)) reason.push("pin_invalid");
    if (!m.auth_user_id) reason.push("auth_user_id_missing");
    // Inkonsistenzen (z.B. mehrere Blocker)
    if (reason.length > 1) reason.push("inconsistent");
    // Info-Felder
    if (m.email_verified === false) info.push({ ...m, reason: "email_verified_false" });
    if (m.is_approved === false) info.push({ ...m, reason: "is_approved_false" });
    if (!m.privacy_accepted_at) info.push({ ...m, reason: "privacy_accepted_at_missing" });
    if (!m.member_qr_token) info.push({ ...m, reason: "member_qr_token_missing" });
    if (reason.length > 0) blockers.push({ ...m, reason: reason.join(",") });
  }

  // Zusammenfassung
  const summary = {
    total_members: members.length,
    total_blockers: blockers.length,
    total_info: info.length,
    total_duplicates: duplicateEmails.length,
    total_ok: members.length - blockers.length,
    blockers_by_reason: blockers.reduce((acc, m) => {
      for (const r of m.reason.split(",")) acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {}),
  };

  // Ausgaben
  await fs.writeFile(path.join(OUTDIR, "member-auth-audit.json"), JSON.stringify({ blockers, info, summary, duplicateEmails }, null, 2));
  await fs.writeFile(path.join(OUTDIR, "login-blockers.csv"), stringify(blockers, { header: true }));
  await fs.writeFile(path.join(OUTDIR, "member-auth-audit.csv"), stringify([...blockers, ...info], { header: true }));
  await fs.writeFile(path.join(OUTDIR, "duplicate-emails.csv"), stringify(
    duplicateEmails.flatMap(([email, arr]) => arr.map(m => ({ email, ...m }))),
    { header: true }
  ));

  // Konsole
  console.log("=== Member Auth Audit Summary ===");
  console.table(summary);
  console.log(`Blocker: ${blockers.length}, Info: ${info.length}, Doppelte E-Mails: ${duplicateEmails.length}`);
  console.log(`Reports unter: ${OUTDIR}`);
}

main().catch((err) => {
  console.error("Fehler im Audit:", err);
  process.exit(1);
});
