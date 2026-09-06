# Decision Note 3 — Current Consent Status

## Decision

How should the service determine whether a principal currently has consent?

## Choice

TODO — to be decided after implementing the consent history query.

## Alternatives considered

- Store a separate mutable consent_status value
- Calculate the current status from the consent event history

## Consequences

The final design should allow the service to determine the current status from the historical consent events while preserving the event log as the source of truth.

I will complete this decision note after implementing and testing the status query in Week 2.