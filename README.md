# Foundry FX AI Rationale Bot

Standalone, open-access advisor-drafting app and API that can later be
integrated with the Foundry portal. The standalone UI can generate, review,
edit, and save drafts. The app never creates or books a trade.

## Run locally

1. Copy `.env.example` to `.env` if a local `.env` has not already been created.
2. Set `OPENAI_API_KEY` (and `OPENAI_MODEL` if desired). The workspace advisor
   ID defaults to `public`.
3. Run `npm install`, then `npm run dev`.
4. Open `http://localhost:3000`.

`DATABASE_URL` and `OPENAI_API_KEY` are server-only secrets. Never send either
one to a browser or portal popup. Do not commit `.env`.
`TWELVE_DATA_API_KEY` is also server-only; configure it to include a
Twelve Data spot quote in newly generated and refreshed Market Conditions drafts.
Quote availability and delay depend on the Twelve Data plan.
`SUPABASE_MARKET_DATA_URL` and `SUPABASE_MARKET_DATA_KEY` are one shared,
server-only connection for reading both existing FxTradeFlow tables:
`market_rates` and `vol_surface_points`. Use a key with read-only policies for
these tables; do not put credentials in browser code.

There is no standalone UI password, API key, login session, or generation rate
limit. Anyone who can reach this app can generate text and read or edit drafts
in the shared workspace. This is intended for local development until portal
authentication is added.

When `DATABASE_URL` is set, pitch records and audit snapshots persist in Neon.
Apply `neon/migrations/20261023000000_ai_rationale_pitches.sql` to that Neon
database before using the app. If `DATABASE_URL` is absent, records persist
locally in the ignored `.local-data/pitches.json` file for development.

## Portal API

Base path: `/api/v1`

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/pitches` | Extract scenario, generate the three rationale sections, and save the draft |
| `GET` | `/pitches` | List all drafts in the shared workspace |
| `GET` | `/pitches/{id}` | Load one draft |
| `PATCH` | `/pitches/{id}` | Update parameters and/or section cards |
| `POST` | `/pitches/{id}/sections/{section}/regenerate` | Regenerate only one named section |

The section names are `market_conditions`, `client_why`, and `product_why`.
The create request body is `{"scenario":"..."}`. The regenerate request body
may include `{"steering":"..."}`. A parameter patch must include the complete
parameter object, including `product_inputs` for product-specific rates and
any required target/leverage values. The UI derives those editable fields from
the selected product's Trade Builder input schema. A section patch may include
any subset of the three section keys, each with at most three
`{ "title", "body" }` cards. JSON request bodies use
`Content-Type: application/json`. All routes are currently open and use the
shared workspace advisor ID.

Before public deployment or portal integration, the other developer should
connect the API to the portal's verified advisor identity and add appropriate
authentication and usage controls. Do not expose a live OpenAI-backed,
unauthenticated deployment to the public internet.

## Data and limitations

The local product catalog/schema files are snapshots from the supplied
Trade Builder archive; refresh them when its canonical catalog changes.
Products are validated against that catalog. Risk notices are deterministic
drafting aids based on catalog metadata and are not approved legal disclosures.

When the scenario yields a currency pair, the server reads up to 25 matching
rows from each Supabase market table and optionally fetches a Twelve Data spot
quote. The spot quote, interest rates, and volatility-surface observations are
passed as evidence only to the Market Conditions section and saved with the
draft. Regenerating that section refreshes the available observations. Values
are not executable prices or forecasts; verify source timestamps, tenor, and
units. If the Supabase key has no SELECT policy or the tables have no visible
rows, no rates/surface points are returned. QuantLib pricing and live news are
not connected. Numeric trade inputs are only copied from the scenario or
supplied by the advisor; missing strikes/barriers stay unset. Do not present
generated text as approved financial advice.

Neon is the hosted pitch/audit store. The server connects using `DATABASE_URL`
and scopes every read and update by the configured shared workspace ID.

Manage provider credentials as deployment secrets. OpenAI requests execute on
the server; the key is never sent to browser code.
