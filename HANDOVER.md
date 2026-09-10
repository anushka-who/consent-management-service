# Handover — Consent Management Service

Written for the next engineer picking this up. The README covers what the service does and how to run it; this document covers what you need to know that isn't obvious from the code, what is deliberately unfinished, and where the sharp edges are.

**Status:** feature-complete for its defined scope. Not production-ready — see [Known issues](#known-issues) and [Not production-ready](#not-production-ready).

---

## Contents

- [What this service is for](#what-this-service-is-for)
- [Architecture in one page](#architecture-in-one-page)
- [Invariants you must not break](#invariants-you-must-not-break)
- [Setup gotchas](#setup-gotchas)
- [Known issues](#known-issues)
- [Not production-ready](#not-production-ready)
- [Where to start](#where-to-start)
- [Glossary](#glossary)

---

## What this service is for

It records, for each data subject and each processing purpose, whether they have consented — and preserves enough history to prove what they consented to and when.

The design constraint driving nearly every decision: **a consent record is evidence.** If it can be silently edited it is worthless as evidence. That is why the log is append-only at the database level rather than by convention, why current status is derived rather than stored, and why each consent event carries a reference to the exact notice version the principal saw.

If you change something and it makes consent history easier to modify, you have almost certainly made a mistake.

---

## Architecture in one page

```
purposes  ──1:N──>  notices  ──1:N──>  consent_events
   │                                        │
   └────────────────1:N─────────────────────┘
```

**Layering.** `index.js` mounts four routers. Routers hold both HTTP concerns and SQL — there is no repository layer. `services/consent-services.js` holds the one piece of logic used from more than one place (`getCurrentConsentStatus`). This is deliberate for a codebase this size; if it grows, extracting a data-access layer is the obvious next refactor.

**Router mounting is order-sensitive.** `index.js` mounts two routers on `/purposes`:

```js
app.use("/purposes", purposesRouter);        // /, /:id, /:id/retire
app.use("/purposes", purposeNoticesRouter);  // /:purposeId/notices
```

This works because no route in the first router matches a two-segment path ending in `/notices`. It is fragile. If you add a `/:id/:something` route to `purposesRouter`, check that you have not shadowed the notices routes.

**Status derivation.** There is no `current_status` column anywhere. `getCurrentConsentStatus` reads the single most recent event:

```sql
ORDER BY event_at DESC, event_id DESC LIMIT 1
```

The `event_id` tiebreaker matters — two events can share a timestamp, and without it ordering is non-deterministic. Keep it in any query that resolves current state.

**Concurrency control.** The withdrawal handler is the only endpoint that runs in a transaction. It takes a transaction-scoped advisory lock keyed on the principal and purpose:

```sql
SELECT pg_advisory_xact_lock(hashtext($1), $2)
```

There is no row to lock, because the table is append-only and the operation is an insert conditional on a read. The advisory lock serializes the read-check-insert sequence. It releases automatically on `COMMIT` or `ROLLBACK`.

**Read the lock caveat in [Known issues](#known-issues) before touching the grant handler.**

**Idempotency.** Both consent endpoints accept an `idempotency_key`, unique per `(principal_ref, purpose_id)`. On conflict the handler fetches the stored row and compares `event_type` and `notice_id`:

- Match → `200` with the original event (a genuine retry)
- Mismatch → `409` (the caller reused a key for a different operation, which is a client bug)

The scoping matters. An earlier version made the key globally unique, which meant two callers picking the same string would receive each other's consent records. Do not widen this constraint back out.

---

## Invariants you must not break

These are enforced in the database, not just in application code. Application-level checks exist too, but the database is the backstop.

| Invariant | Enforced by |
|---|---|
| Consent events cannot be updated | `consent_events_no_update` trigger + no `UPDATE` grant to `consent_app` |
| Consent events cannot be deleted | `consent_events_no_delete` trigger + no `DELETE` grant to `consent_app` |
| Consent events cannot be truncated | `consent_events_no_truncate` statement trigger |
| Published notices cannot be modified | `notices_immutable_after_publish` trigger |
| A notice version is unique per purpose | `unique_purpose_version` constraint |
| `event_type` is only `grant` or `withdrawal` | `consent_events_event_type_check` |
| An idempotency key maps to one operation | `consent_events_principal_purpose_idempotency_key_key` |
| A notice cannot be self-approved | `created_by <> $1` in the publish `UPDATE` |

The publish rule is the only one on this list enforced solely in SQL written by the application rather than by a constraint or trigger. It is also the weakest, because the identifiers are unauthenticated — see [Not production-ready](#not-production-ready).

---

## Setup gotchas

**Two database connections, not one.** This trips up everyone on first run.

- `node-pg-migrate` reads `DATABASE_URL` and must connect as an **owner or superuser**, because migration `1788720678159` creates a role and issues grants.
- The application reads `DB_HOST`, `DB_PORT`, `DB_NAME`, `APP_DB_USER`, `APP_DB_PASSWORD` in `db.js` and connects as the restricted `consent_app` role.

Both sets belong in `.env`. If the app connects as the owner instead of `consent_app`, everything still appears to work — but you have silently removed one of the two layers protecting the consent log, and only the triggers are stopping you. Verify with:

```sql
SELECT current_user;  -- should be consent_app when queried through the app
```

**`APP_DB_PASSWORD` must be set before the first migration run.** The role migration reads it from the environment and throws if it is missing. The password is interpolated into the `CREATE ROLE` statement with single quotes escaped; it is not a bound parameter, because `CREATE ROLE` does not accept them.

**The role migration is idempotent on the role itself** (`IF NOT EXISTS` on `pg_roles`) but the grants are not conditional. Re-running is safe; changing `APP_DB_PASSWORD` after the fact is not — the migration will not update an existing role's password. Change it with `ALTER ROLE consent_app PASSWORD '...'` directly.

**Tests write to your real database and leave data behind.** There is no test database and no teardown, because consent events cannot be deleted. Tests isolate with `Date.now()`-derived principal references and idempotency keys. Point `.env` at a throwaway database if that matters.

**`migrate down` is currently broken.** See [Known issues](#known-issues).

---

## Known issues

Ordered by how likely they are to bite you.

### 1. `.env.example` is incomplete

It lists only `PORT` and `DATABASE_URL`. The five variables `db.js` actually reads are absent, so following it produces a server that cannot connect. Fix the file; the full list is in the README.

### 2. The advisory lock is only taken by one of two writers

`POST /consent/withdrawals` takes the lock. `POST /consent/grants` does not, and runs no transaction. A grant can therefore land between a withdrawal's state check and its insert:

1. Withdrawal acquires the lock, reads latest event → `grant`, passes validation
2. Grant request (unlocked) inserts a new `grant` event
3. Withdrawal inserts its `withdrawal`, which now sorts last

The grant from step 2 is silently nullified by a withdrawal decided before it existed. A lock only serializes writers that all take it. Adding the same `pg_advisory_xact_lock` to the grant handler closes this.

### 3. `migrate down` fails on the index migration

`1789300000000_add-consent-event-indexes.js` calls:

```js
pgm.dropIndex("consent_events", "consent_events_current_status_idx");
```

`dropIndex`'s second argument is *columns*, not a name. With no `options.name`, node-pg-migrate derives the index name from the columns and emits `DROP INDEX "consent_events_consent_events_current_status_idx_index"`, which does not exist. Use:

```js
pgm.dropIndex("consent_events", [], { name: "consent_events_current_status_idx" });
```

### 4. Notice version assignment has a race

`routes/notices.js` reads `COALESCE(MAX(version), 0) + 1` and inserts in a separate statement. Concurrent creates for one purpose compute the same version; the second violates `unique_purpose_version` and returns `409`. The error is handled cleanly, but the operation fails when it should succeed. Fix with a single statement:

```sql
INSERT INTO notices (purpose_id, version, content, created_by)
SELECT $1, COALESCE(MAX(version), 0) + 1, $2, $3
FROM notices WHERE purpose_id = $1
RETURNING *
```

or take an advisory lock on `purpose_id`.

### 5. The timestamptz migration reinterpreted existing rows as UTC

`1789200000000` converts with `USING event_at AT TIME ZONE 'UTC'`. Rows written before that migration were produced by `CURRENT_TIMESTAMP` in the writing session's local timezone, so any such row is now off by that session's offset from UTC.

This only affects pre-migration development data. It is called out here because on an append-only log there is no way to correct it after the fact — worth remembering if this pattern is ever repeated on real data.

### 6. `/consent/check` returns `notice_id` but not the version

Decision note 05 states that consumers can determine which notice version a consent event references. In practice they cannot, cleanly: the response carries a `notice_id`, there is no `GET /notices/:id` endpoint, and the only way to resolve it is to fetch every notice for the purpose and search. Join the version into the status query:

```sql
SELECT ce.event_type, ce.event_at, ce.notice_id, n.version AS notice_version
FROM consent_events ce
JOIN notices n ON n.notice_id = ce.notice_id
WHERE ce.principal_ref = $1 AND ce.purpose_id = $2
ORDER BY ce.event_at DESC, ce.event_id DESC
LIMIT 1
```

Returning the current published version alongside it would let callers implement re-consent themselves, which is the extension point note 05 leaves open.

### 7. Smaller items

- `index.js` hardcodes port 3000 and ignores `PORT`.
- `package.json` is still named `health-server`, left over from the initial scaffold.
- `database.json` is an empty, unused file — it is `db-migrate` config, and this project uses `node-pg-migrate`. Delete it.
- `consent_events.event_at` and `created_at` are redundant: both default to `CURRENT_TIMESTAMP`, neither is caller-supplied, so they are always identical. The useful split would be `occurred_at` (when the principal acted, supplied by the caller) versus `recorded_at` (when the row was written).
- Withdrawals require a `notice_id` that is validated as belonging to the purpose but is not checked against the original grant. Its semantics are undecided.
- `POST /notices/:id/publish` returns `404` for three different situations: notice missing, already published, and self-approval. Self-approval should arguably be `403` and already-published `409`.
- `GET /purposes/:id/notices/:version` appears in `PLAN.md` but was never implemented.
- The withdrawal handler's inner `catch` calls `await client.query("ROLLBACK")` unguarded. If the connection is already broken this throws and masks the original error.
- Untested branches: granting against a `draft` notice, and granting against a `retired` purpose. Both checks exist in `routes/consent.js`; nothing exercises them.

---

## Not production-ready

Beyond the issues above, three things would need resolving before this handles real personal data.

**No authentication or authorization.** Any caller can grant or withdraw consent on behalf of any `principal_ref`, and can read anyone's full history via `GET /consent/principals/:ref/history`. The service assumes an upstream gateway has authenticated the caller and asserted the principal's identity. That assumption is documented in decision note 04 but is not enforced anywhere.

Because identifiers are unauthenticated, the two-person approval rule on notice publication is a business control, not a security one. The service can confirm two strings differ; it cannot confirm either is genuine.

**No operational hardening.** No rate limiting, no request logging, no security headers, no request ID propagation, no readiness probe distinct from `/health`, no graceful shutdown closing the pool. The 500 handler logs to `console.error`.

**Trigger protection is not absolute.** The triggers on `consent_events` stop the application and any ordinary role. A superuser can still `ALTER TABLE ... DISABLE TRIGGER`. That is a deliberate limit — it is not possible to protect a table from its own database owner — so a real deployment needs the audit story to extend to who holds superuser and whether their actions are logged elsewhere.

---

## Where to start

If you are picking this up cold:

1. Read `PLAN.md`, then the five files in `decision-notes/`, in order. They are short and they explain *why* the schema looks the way it does. Note 02 (append-only enforcement) and note 03 (derived status) are the two that matter most.
2. Get it running against a throwaway database and run `npm test`. The suite exercises most invariants and is the fastest way to build a mental model.
3. Read `routes/consent.js` end to end. It is the only genuinely intricate file — everything else is straightforward CRUD.
4. Fix `.env.example` first. It is a two-minute change and it unblocks the next person.

Suggested order for the open work: `.env.example` → grant handler lock (issue 2) → `dropIndex` (issue 3) → notice version race (issue 4) → notice version in `/check` (issue 6) → the small items.

---

## Glossary

| Term | Meaning |
|---|---|
| **Principal** | The data subject whose consent is being recorded. Referenced by `principal_ref`, an opaque identifier supplied by the caller. This service stores no personal data about them beyond that reference. |
| **Purpose** | A stable reason for processing data, e.g. `marketing`. Created once, retired rather than deleted. |
| **Notice** | A versioned privacy notice attached to a purpose. Consent is always granted against a specific notice version. |
| **Consent event** | An immutable record of a grant or withdrawal. |
| **Append-only** | Rows can be inserted but never updated, deleted, or truncated. Enforced by triggers and role permissions. |
| **Derived status** | Current consent state is computed from the latest event rather than stored in a column, so the event log is the single source of truth. |
| **Fails closed** | A principal with no recorded consent event is treated as `not_granted`, never as granted by default. |