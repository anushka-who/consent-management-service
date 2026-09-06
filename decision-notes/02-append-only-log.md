# Decision Note #2 — Preventing Consent Log Edits

## Decision

Consent events will be protected at the database level using both PostgreSQL permissions and database triggers.

The application database role is not allowed to UPDATE or DELETE rows in `consent_events`.

Database triggers also reject UPDATE and DELETE attempts on `consent_events`.

## Choice

Use two layers of protection:

1. Revoke UPDATE and DELETE permissions from the application role.
2. Add database triggers that reject UPDATE and DELETE operations.

INSERT remains allowed because new consent actions must be recorded as new events.

## Alternatives

### Application-only protection

The Express application could simply avoid exposing UPDATE and DELETE endpoints.

This is insufficient because a database user could still modify the table directly.

### Trigger-only protection

A database trigger can reject UPDATE and DELETE operations.

This protects the table even from privileged application queries, but permissions provide an additional layer of protection.

### Permissions-only protection

The application role can be denied UPDATE and DELETE permissions.

This is strong for the application role, but a privileged database role could still modify the table unless a trigger also prevents it.

## Consequences

The consent log is append-only.

Historical consent events cannot be modified or deleted by the application.

The database becomes responsible for enforcing this invariant rather than relying only on application code.

Testing requires care because test records cannot simply be deleted after each test. Tests therefore use unique principals and idempotency keys.