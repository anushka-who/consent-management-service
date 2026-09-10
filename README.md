# Consent Management Service

A backend consent-management service built with Node.js, Express, and PostgreSQL.

The service manages consent purposes, versioned privacy notices, and an append-only log of consent grants and withdrawals. Current consent status is derived from that log rather than stored as mutable state, so the event history is always the single source of truth.

This is a backend component. It has no user interface and does not authenticate callers — see [Scope and assumptions](#scope-and-assumptions).

---

## Contents

- [Tech stack](#tech-stack)
- [How it works](#how-it-works)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Data model](#data-model)
- [Testing](#testing)
- [Design decisions](#design-decisions)
- [Scope and assumptions](#scope-and-assumptions)
- [Project structure](#project-structure)

---

## Tech stack

| Component | Choice |
|---|---|
| Runtime | Node.js |
| HTTP framework | Express 5 |
| Database | PostgreSQL |
| Migrations | node-pg-migrate |
| Validation | Zod 4 |
| Testing | Jest + Supertest |

---

## How it works

Three concepts, in order of dependency:

**Purposes** are the stable reasons you might process someone's data — `marketing`, `fraud_prevention`, `service_analytics`. They are created once and retired rather than deleted.

**Notices** are versioned privacy notices attached to a purpose. Version numbers are assigned automatically per purpose. A notice starts as a `draft` and must be published by someone other than its creator before consent can be recorded against it. Once published, a notice is immutable — enforced by a database trigger, not application code.

**Consent events** are an append-only log. Granting consent inserts a `grant` row; withdrawing inserts a `withdrawal` row. Nothing is ever updated or deleted. Current status is derived by reading the most recent event for a given principal and purpose:

```
no events        → not_granted
latest = grant   → granted
latest = withdrawal → withdrawn
```

A `grant → withdrawal → grant` sequence therefore resolves to `granted`, and the full history remains auditable.

---

## Getting started

### Prerequisites

- Node.js 18 or later
- PostgreSQL 13 or later, running locally
- A PostgreSQL superuser (or database owner) account for running migrations

### 1. Clone and install

```bash
git clone https://github.com/anushka-who/consent-management-service.git
cd consent-management-service
npm install
```

### 2. Create the database

```bash
createdb consent_db
```

### 3. Configure environment

Copy the example file and fill in real values:

```bash
cp .env.example .env
```

Two separate database connections are required, which is the part most people get wrong on first setup:

- **Migrations** connect as an owner/superuser via `DATABASE_URL`. They need this level of access because migration `1788720678159` creates a database role and grants privileges.
- **The application** connects as the restricted `consent_app` role via the `DB_*` and `APP_DB_*` variables. This role has no `UPDATE` or `DELETE` privilege on `consent_events`, which is one of the two layers protecting the append-only log.

See [Environment variables](#environment-variables) for the full list.

### 4. Run migrations

```bash
npm run migrate
```

This creates all three tables, installs the immutability triggers, creates the `consent_app` role using `APP_DB_PASSWORD`, and seeds twelve standard purposes.

`APP_DB_PASSWORD` must be set before this step — the role migration throws immediately if it is missing.

### 5. Start the server

```bash
npm start        # node index.js
npm run dev      # node --watch index.js
```

Verify it is running:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

---

## Environment variables

All variables live in `.env` (git-ignored). `.env.example` lists them with placeholder values.

| Variable | Used by | Description |
|---|---|---|
| `DATABASE_URL` | `node-pg-migrate` | Full connection string for an owner/superuser account. Required to run migrations. |
| `DB_HOST` | `db.js` | PostgreSQL host, e.g. `localhost` |
| `DB_PORT` | `db.js` | PostgreSQL port, e.g. `5432` |
| `DB_NAME` | `db.js` | Database name, e.g. `consent_db` |
| `APP_DB_USER` | `db.js` | Application role name — `consent_app` |
| `APP_DB_PASSWORD` | `db.js`, role migration | Password for `consent_app`. Read at migration time to create the role, and at runtime to connect as it. |
| `PORT` | `index.js` | HTTP port. Defaults to `3000`. |

Example `.env`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/consent_db

DB_HOST=localhost
DB_PORT=5432
DB_NAME=consent_db
APP_DB_USER=consent_app
APP_DB_PASSWORD=choose-a-strong-password

PORT=3000
```

---

## API reference

All request and response bodies are JSON.

### Health

#### `GET /health`

```json
{ "status": "ok" }
```

---

### Purposes

#### `POST /purposes`

Create a purpose.

```json
{
  "code": "marketing",
  "description": "Send promotional and marketing communications"
}
```

| Status | Meaning |
|---|---|
| `201` | Created |
| `400` | Validation failed — `details` contains the Zod issues |
| `409` | A purpose with that `code` already exists |

#### `GET /purposes`

Returns all purposes ordered by `purpose_id`.

#### `PATCH /purposes/:id`

Update a purpose's description. The `code` is immutable.

```json
{ "description": "Updated description" }
```

| Status | Meaning |
|---|---|
| `200` | Updated |
| `404` | Purpose not found |

#### `POST /purposes/:id/retire`

Mark a purpose as `retired`. Retired purposes reject new consent grants.

| Status | Meaning |
|---|---|
| `200` | Retired |
| `404` | Purpose not found |
| `409` | Consent has already been recorded for this purpose |

---

### Notices

#### `POST /purposes/:purposeId/notices`

Create a draft notice. The version number is assigned automatically as `MAX(version) + 1` for that purpose.

```json
{
  "content": "We use your data to ...",
  "created_by": "alice"
}
```

| Status | Meaning |
|---|---|
| `201` | Draft created with `status: "draft"` |
| `404` | Purpose not found |
| `409` | Version collision (concurrent create — retry) |

#### `GET /purposes/:purposeId/notices`

Returns all notices for a purpose, ordered by version.

#### `POST /notices/:noticeId/publish`

Publish a draft notice. Enforces two-person approval: the approver must differ from the creator.

```json
{ "approved_by": "bob" }
```

| Status | Meaning |
|---|---|
| `200` | Published, with `published_at` and `approved_by` set |
| `404` | No matching draft — the notice does not exist, is already published, or `approved_by` equals `created_by` |

Published notices cannot subsequently be modified. This is enforced by the `notices_immutable_after_publish` database trigger.

---

### Consent

Grant and withdrawal share the same request body:

```json
{
  "principal_ref": "user-1234",
  "purpose_id": 11,
  "notice_id": 4,
  "idempotency_key": "a-unique-key-per-operation"
}
```

`idempotency_key` is unique per `(principal_ref, purpose_id)`. Replaying the same key with the same payload returns the original event; replaying it with a different payload is rejected.

#### `POST /consent/grants`

| Status | Meaning |
|---|---|
| `201` | Consent event recorded |
| `200` | Replay — this exact request was already recorded, original event returned |
| `404` | Purpose not found, or notice does not belong to this purpose |
| `409` | Purpose is retired, notice is not published, or the idempotency key was used with different data |

#### `POST /consent/withdrawals`

Runs inside a transaction holding a per-principal advisory lock, so concurrent withdrawals cannot both succeed.

| Status | Meaning |
|---|---|
| `201` | Withdrawal recorded |
| `200` | Replay — original event returned |
| `404` | Purpose or notice not found |
| `409` | Consent was never granted, is already withdrawn, or the idempotency key was used with different data |

#### `GET /consent/check`

Query parameters: `principal_ref`, `purpose_id`.

```
GET /consent/check?principal_ref=user-1234&purpose_id=11
```

```json
{
  "principal_ref": "user-1234",
  "purpose_id": 11,
  "status": "granted",
  "latest_event": {
    "event_type": "grant",
    "event_at": "2026-09-08T10:14:22.481Z",
    "notice_id": 4
  }
}
```

`status` is one of `granted`, `withdrawn`, `not_granted`. The response fails closed: a principal with no recorded events is `not_granted`.

`latest_event.notice_id` identifies the notice version the principal actually consented to. Publishing a newer notice does not change this and does not invalidate existing consent — see decision note 05.

#### `GET /consent/principals/:ref/history`

Returns the complete consent history for a principal across all purposes, oldest first.

---

## Data model

### `purposes`

| Column | Type | Notes |
|---|---|---|
| `purpose_id` | serial | Primary key |
| `code` | varchar(100) | Unique |
| `description` | text | |
| `status` | varchar(20) | `active` (default) or `retired` |
| `created_at` / `updated_at` | timestamptz | |

Twelve purposes are seeded by migration `1789000000000`, including `marketing`, `fraud_prevention`, `legal_compliance`, and `service_analytics`.

### `notices`

| Column | Type | Notes |
|---|---|---|
| `notice_id` | serial | Primary key |
| `purpose_id` | integer | FK → `purposes`, `ON DELETE RESTRICT` |
| `version` | integer | Unique per purpose |
| `content` | text | |
| `status` | varchar(20) | `draft` (default) or `published` |
| `created_by` / `approved_by` | varchar(100) | Must differ for publication to succeed |
| `published_at` | timestamptz | Nullable until published |
| `created_at` / `updated_at` | timestamptz | |

### `consent_events`

| Column | Type | Notes |
|---|---|---|
| `event_id` | serial | Primary key |
| `principal_ref` | varchar(100) | |
| `purpose_id` | integer | FK → `purposes` |
| `notice_id` | integer | FK → `notices` — the version consented to |
| `event_type` | varchar(20) | `grant` or `withdrawal`, CHECK constrained |
| `event_at` | timestamptz | |
| `idempotency_key` | varchar(255) | Unique per `(principal_ref, purpose_id)` |
| `created_at` | timestamptz | |

Indexes: `consent_events_current_status_idx` on `(principal_ref, purpose_id, event_at, event_id)` serves the status lookup; `consent_events_history_idx` on `(principal_ref, event_at, event_id)` serves the history endpoint.

### Append-only enforcement

`consent_events` is protected by two independent layers:

1. **Role permissions** — `consent_app` is granted `SELECT` and `INSERT` only. It has no `UPDATE` or `DELETE` privilege on this table.
2. **Database triggers** — `consent_events_no_update`, `consent_events_no_delete`, and `consent_events_no_truncate` raise an exception on any such attempt, including from privileged roles.

Either layer alone would leave a gap. Together they mean the log cannot be rewritten from the application, and cannot be rewritten by a privileged operator without deliberately disabling a trigger. See decision note 02.

---

## Testing

```bash
npm test
```

Tests run against a **real PostgreSQL database** using the connection in `.env`. There is no separate test database configured, and no fixture teardown — because `consent_events` rows cannot be deleted, tests instead isolate themselves by generating unique principal references and idempotency keys per run.

Consequence: your development database accumulates test data permanently. Use a throwaway database if that matters to you.

Coverage includes the append-only triggers, the two-person approval rule, published-notice immutability, idempotency replay and collision handling, the `grant → withdrawal → grant` lifecycle, concurrent withdrawal serialization, and notice-version semantics.

---

## Design decisions

Each significant decision is written up in `decision-notes/`, in a decision / choice / alternatives / consequences format.

| Note | Subject |
|---|---|
| [01](decision-notes/01-language-framework.md) | Language and framework selection |
| [02](decision-notes/02-append-only-log.md) | Preventing consent log edits — triggers plus permissions |
| [03](decision-notes/03-current-status.md) | Deriving current status from event history |
| [04](decision-notes/04-not-building.md) | What is deliberately out of scope |
| [05](decision-notes/05-notice-version-semantics.md) | Notice versions and consent validity |

---

## Scope and assumptions

**This service does not authenticate anyone.** `principal_ref`, `created_by`, and `approved_by` are treated as trusted identifiers supplied by an authenticated upstream system or gateway.

This means the two-person approval rule on notice publication is a business rule, not a security control at this layer — the service can verify that two identifiers differ, but cannot verify that either identifier is genuine. A production deployment requires authentication and authorization to be provided upstream or added here explicitly.

Also out of scope, deliberately: client SDKs, consent UI, admin console, downstream notification on withdrawal, age verification, consent reporting, and historical data import. Decision note 04 covers the reasoning.

---

## Project structure

```text
consent-management-service/
│
├── routes/
│   ├── health.js
│   ├── purposes.js
│   ├── notices.js
│   └── consent.js
│
├── services/
│   └── consent-services.js
│
├── migrations/
│   ├── 1788457535295_create-purposes.js
│   ├── 1788548455614_notices.js
│   ├── 1788590127629_prevent-published-notice-edit.js
│   ├── 1788592450764_add-created-by-to-notices.js
│   ├── 1788676942315_create-consent-events.js
│   ├── 1788677708193_protect-consent-events.js
│   ├── 1788720678159_setup-app-db-role.js
│   ├── 1789000000000_seed-purposes.js
│   ├── 1789100000000_scope-consent-idempotency.js
│   ├── 1789200000000_use-timestamptz.js
│   ├── 1789300000000_add-consent-event-indexes.js
│   └── 1789400000000_protect-consent-events-truncate.js
│
├── tests/
│   ├── purposes.test.js
│   ├── notices.test.js
│   ├── consent-events.test.js
│   └── consent-api.test.js
│
├── decision-notes/
│   ├── 01-language-framework.md
│   ├── 02-append-only-log.md
│   ├── 03-current-status.md
│   ├── 04-not-building.md
│   └── 05-notice-version-semantics.md
│
├── db.js
├── index.js
├── PLAN.md
├── HANDOVER.md
└── README.md
```