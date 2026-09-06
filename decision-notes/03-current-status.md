# Decision Note #3 — Deriving Current Consent Status

## Decision

Current consent status will be derived from the latest event in `consent_events`.

There will be no mutable `consent_status` column storing the current state.

## Choice

For a given principal and purpose:

1. Find the consent events for that principal and purpose.
2. Order them from newest to oldest.
3. Select the latest event.
4. Interpret `grant` as `granted`.
5. Interpret `withdrawal` as `withdrawn`.
6. If no event exists, return `not_granted`.

## Alternatives

### Store current status directly

A separate mutable status field could store values such as `granted` or `withdrawn`.

This would make reads simpler, but it creates two sources of truth: the event history and the current status field.

### Reconstruct status from all events

The application could process the entire event history to determine the final state.

This is conceptually correct but unnecessary for the current project because the latest event completely determines the current state.

## Consequences

The consent event history remains the source of truth.

A lifecycle such as:

grant → withdrawal → grant

correctly produces:

granted

The system can also reconstruct historical consent activity from the event log.

If no consent event exists for a principal and purpose, the system fails closed and treats the principal as not granted.