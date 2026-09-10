# Decision Note 05 — Notice Version Semantics

## Decision

Consent remains valid when a newer notice version is published.

The consent event records the specific notice version that the principal consented to, and the current consent check returns that notice reference.

Publishing a newer notice does not automatically invalidate existing consent or require re-consent.

## Choice

A consent event stores `notice_id`.

The current consent status is still derived from the latest consent event for the principal and purpose.

If the latest event is a grant, the response remains `granted` and identifies the notice associated with that grant.

If the latest event is a withdrawal, the response remains `withdrawn` and identifies the notice associated with that withdrawal.

## Alternatives considered

### Automatically require re-consent

Publishing a newer notice could make existing consent no longer sufficient until the principal grants consent against the new notice.

We did not choose this because the project brief does not require automatic re-consent semantics, and implementing it would introduce additional business rules that are outside the current project scope.

### Store only the current notice version

The system could ignore the notice version associated with the original consent and only expose the newest published notice.

We did not choose this because it would weaken the audit trail. The consent event should continue to identify the notice that was actually associated with that consent action.

## Consequences

Existing consent is not automatically invalidated by publishing a new notice.

The consent history preserves the exact notice associated with each grant or withdrawal.

Consumers of the API can determine which notice version the latest consent event references.

If future requirements introduce mandatory re-consent after notice changes, that behavior can be added explicitly rather than being inferred from notice publication.