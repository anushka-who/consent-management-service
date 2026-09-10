# Decision Note 04 — What We Are Not Building

## Decision

Keep the consent service intentionally limited to its core backend responsibilities.

The project will manage consent purposes, versioned notices, consent grants, withdrawals, current consent status, and consent history.

Functionality outside those responsibilities will not be implemented.

## Choice

The following are explicitly out of scope:

- Client SDKs
- Customer-facing consent screens
- Admin console
- External consent-management interface
- Notifications to other services after withdrawal
- Age checks
- Consent reports
- Importing historical consent records

The service is a backend consent-management component rather than a complete customer-facing consent platform.

## Alternatives

### Build everything into this project

This would create a broader platform including UI, SDKs, reporting, integrations, and additional business functionality.

### Add external integrations

The service could notify other systems or integrate with an external consent-management platform.

### Add additional compliance functionality

The service could include features such as age verification, reporting, and historical-data imports.

## Consequences

### Positive

- Smaller and more focused codebase
- Easier testing and maintenance
- Clear ownership of consent-management responsibilities
- Lower implementation complexity
- Easier handover to another engineer
- Less risk of implementing functionality that is outside the project requirements

### Negative

- The service does not provide a complete customer-facing consent platform
- Other systems would need to implement or integrate the excluded functionality separately
- Additional functionality would require future design and implementation work

### Authentication and authorization

We are not implementing authentication or authorization in this UAT service.

The service assumes identity has already been established by an upstream trusted system or gateway.

This is intentionally outside the current project scope. A production deployment would need an explicit authentication and authorization design.