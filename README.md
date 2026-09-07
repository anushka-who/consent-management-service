# Consent Management Service

A backend consent-management service built with Node.js, Express, and PostgreSQL.

The service manages consent purposes, versioned privacy notices, and an append-only consent event history.

## Tech Stack

- Node.js
- Express
- PostgreSQL
- node-pg-migrate
- Zod
- Jest
- Supertest
- Docker

---

# Project Structure

```text
health-server/
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
├── tests/
│   ├── purposes.test.js
│   ├── notices.test.js
│   ├── consent-events.test.js
│   └── consent-api.test.js
│
├── migrations/
│   ├── 1788457535295_create-purposes.js
│   ├── 1788548455614_notices.js
│   ├── 1788590127629_prevent-published-notice-edit.js
│   ├── 1788592450764_add-created-by-to-notices.js
│   ├── 1788676942315_create-consent-events.js
│   ├── 1788677708193_protect-consent-events.js
│   ├── 1788720678159_setup-app-db-role.js
│   └── 1789000000000_seed-purposes.js
│
├── decision-notes/
│   ├── 01-language-framework.md
│   ├── 02-append-only-log.md
│   ├── 03-current-status.md
│   └── 04-not-building.md
│
├── db.js
├── index.js
├── package.json
├── package-lock.json
├── .env
└── .gitignore