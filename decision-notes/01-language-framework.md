# Decision Note 1 — Language and Framework

## Decision

Choose the language and framework for the consent management service.

## Choice

Node.js with Express.

## Why

I already have some exposure to Node.js and Express, so this allows me to spend more of my learning time on the new concepts required by this project, particularly PostgreSQL, SQL, database triggers, permissions, migrations, and append-only data design.

## Alternatives considered

Java with Spring Boot and Go.

## Consequences

I can move faster on the HTTP/API side because I already have some familiarity with Node.js and Express.

The tradeoff is that I will need to deliberately learn the PostgreSQL and database-level concepts rather than relying on framework abstractions.