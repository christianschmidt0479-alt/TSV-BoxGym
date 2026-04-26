# Recovery Architecture Plan (Controlled Rebuild)

## Scope
- Base branch/state: `recovered-midday-state`
- Keep stable core unchanged during migration:
  - Login behavior
  - Check-in behavior
  - Admin API behavior

## Current Risk Areas
- Parallel trainer login surface:
  - `app/api/trainer-login/route.ts`
  - `app/api/trainer-auth/route.ts`
- Legacy role/access paths:
  - `lib/useTrainerAccess.ts`
  - `lib/personRoles.ts`

## Target Architecture
- Exactly one login route (target: `app/api/trainer-auth/route.ts`)
- Exactly one session mechanism (target: `lib/authSession.ts` cookie + token helpers)
- Exactly one server user context (target: `lib/getUserContext.ts`)

## Migration Rules
1. Additive changes first.
2. No destructive removals until parity is proven.
3. Keep old paths running until replacement is validated.
4. Remove legacy paths only in a final cleanup phase.

## Step Plan
1. Freeze stable core
- No edits in `app/api/trainer-login`, `app/api/trainer-auth`, `app/api/checkin`, `app/api/admin` unless bugfix is mandatory.

2. Introduce/verify shared context
- `lib/getUserContext.ts` remains read-only integration over existing session.
- Use in selected server pages only.

3. Safe UI extension
- Extend trainer UI with self status block.
- Do not remove existing widgets/routes.

4. Optional check-in core prep
- Add structure only (no activation) for a future `handleCheckin` adapter.

5. Consolidation phase (later)
- Migrate all trainer/admin page auth reads to `getUserContext`.
- Decommission duplicate login route only after parity checks pass.
- Remove legacy hooks/role indirection after end-to-end verification.

## Required Test Gate (every step)
- Trainer login success + reject invalid credentials.
- Admin access allowed for admin role and blocked for trainer role.
- Member login success path.
- Check-in scenarios:
  - Normal
  - Duplicate
  - Trial limit
  - Member limit
  - Trainer check-in
- No new 500 errors in server logs.

## Exit Criteria
- Single active login route.
- Single active session path.
- Single active user context usage across protected pages.
- Legacy trainer access paths removed.
- Test gate green.
