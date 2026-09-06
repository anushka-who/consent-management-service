# Consent Management Service — Short Plan

## Database tables

### 1. purposes
Stores the stable purposes for which consent can be requested.

Main fields:
- purpose_id
- code
- description
- status
- created_at
- updated_at

### 2. notices
Stores versioned consent notices belonging to purposes.

Main fields:
- notice_id
- purpose_id
- version
- body
- status
- created_by
- approved_by
- published_at

### 3. consent_events
Stores the history of consent grants and withdrawals.

Main fields:
- event_id
- principal_ref
- purpose_id
- notice_id
- event_type
- occurred_at
- idempotency_key

The consent log will be append-only.

---

## API endpoints

### Purposes
- POST /purposes
- GET /purposes
- PATCH /purposes/:id
- POST /purposes/:id/retire

### Notices
- POST /purposes/:id/notices
- POST /notices/:id/publish
- GET /purposes/:id/notices
- GET /purposes/:id/notices/:version

### Consent
- POST /consent/grants
- POST /consent/withdrawals
- GET /consent/check
- GET /principals/:ref/history

---

## Things I don't understand yet

- PostgreSQL triggers
- PostgreSQL permissions
- How to prevent UPDATE/DELETE on the consent log
- How to calculate current consent status from event history
- Transactions
- Idempotency
- How to test database-level immutability