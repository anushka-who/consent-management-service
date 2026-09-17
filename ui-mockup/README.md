# Consent Console — admin UI

An internal admin console for `consent-service` (Pice's DPDP consent
management backend), styled after Pice's own product (piceapp.com): the
blue→purple gradient, rounded cards, pastel status badges, and
Poppins/Libre Franklin type.

**This is outside the project's original scope** — the internship brief
explicitly leaves "the customer-facing screens, the admin console" for
later — but it's wired to the real, finished backend rather than being a
static mock, so it doubles as a way to exercise the API by hand.

It's served by the Express app itself (`app.use(express.static(...))` in
[`../index.js`](../index.js)), so every request in `app.js` is same-origin —
no CORS setup needed. Open it at `http://localhost:3000` once the server
is running.

## What's actually live vs. session-only

- **Purposes, Notices** — fully live: list/create/retire purposes,
  draft/publish notices, against the real `/purposes` and `/notices`
  routes. Publishing enforces the real rule that the approver can't be
  the drafter (the API rejects it; the UI just shows the error).
- **Principal Lookup, API Playground** — fully live: `/consent/check`,
  `/consent/grants`, `/consent/withdrawals`,
  `/consent/principals/:ref/history` are real calls against Postgres.
- **Dashboard and Consent Log** — the purpose counts are live, but the
  event stats/chart/feed only reflect actions taken *from this console
  during the current browser session*. The API has no "list all consent
  events" endpoint (the brief deliberately doesn't include a reporting
  endpoint), so there's no way to show a global feed without inventing
  a route that wasn't part of the spec.

## Running it

```bash
npm install       # from the project root, if you haven't already
npm run migrate   # if your database isn't already migrated
npm start         # or: npm run dev
```

Then open `http://localhost:3000`.
