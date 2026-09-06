# Decision Note 2 — Preventing Consent Log Edits

## Decision

How should the consent event log be protected from UPDATE and DELETE operations?

## Choice

TODO — to be decided after implementing and testing the database protections.

## Alternatives considered

- Database permissions
- PostgreSQL trigger
- Both permissions and trigger

## Consequences

The final choice should ensure that the application cannot modify or delete historical consent events.

I will complete this decision note after building and testing the database-level protection in Week 2.