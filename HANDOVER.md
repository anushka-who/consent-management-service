# Consent Management Service — Handover

## 1. Purpose

This project is a backend consent-management service.

It provides APIs for:

- Managing consent purposes
- Managing versioned privacy notices
- Publishing notices with two-person approval
- Recording consent grants
- Recording consent withdrawals
- Checking current consent status
- Retrieving consent history

The service is built as a backend component and does not provide customer-facing UI.

---

# 2. Technology

The project uses:

- Node.js
- Express
- PostgreSQL
- node-pg-migrate
- Zod
- Jest
- Supertest
- Docker

---

# 3. Running the Project

## Install dependencies

```bash
npm install

---

## Authentication and identity assumptions

This UAT service does not implement authentication or identity verification.

Fields such as `principal_ref`, `created_by`, and `approved_by` are treated as trusted identifiers supplied by an authenticated upstream system or gateway.

The service enforces business rules that can be checked from those identifiers. For example, a notice cannot be approved by the same identifier that created it.

However, because the service does not authenticate those identifiers itself, the four-eyes approval rule is not a complete identity/security control at this layer.

A production deployment would require authentication and authorization to be provided by the service itself or by a trusted upstream identity layer.