# AI Trade Opportunity Generator: Iteration 1

This iteration follows the agreed approach. The "why" boxes are calculated from
the client profile and live rates, so they are factual. The advisor chooses the
product bucket (conservative, balanced or dynamic). The AI only pre-fills the
deal for the advisor to adjust. This is all new code; the Rationale Studio (`/`)
is unchanged.

## Screens

| Path | Purpose |
| --- | --- |
| `/clients` | Full client and prospect profiles: contact, industry, region, risk profile, leverage, permitted products, hedging policy (min/max cover, max tenor), and FX exposures with budget rates, hedged amounts, horizon and next settlement date. Clients can be amended or archived. |
| `/dashboard` | AI Trade Opportunities at the top: client name plus up to 3 "why" boxes (hover for the numbers), and an **AI Generate** button. Users set how many opportunities to generate per day, the run hour (8am by default) and their timezone. |
| `/deal-builder` | Pick a client, then **AI Generate**. The popup shows Conservative / Balanced / Dynamic with the AI's pick highlighted. The user can override it. The deal is then pre-filled to adjust, and **Build sales rationale** creates a Rationale Studio draft. |

## Why boxes (deterministic, `lib/opportunity-engine.ts`)

- **Budget rate**: spot above or below the exposure's budget rate, taking into account which currency the client buys.
- **Hedge policy**: current cover vs the policy minimum or maximum, including the amount needed to reach policy.
- **52-week range**: spot in the top or bottom 20% of its 52-week range (Twelve Data).
- **Settlement due**: next settlement within 45 days and not fully covered.
- **Average hedge rate higher** (hedge portfolio tactic): spot is better than the average rate of existing hedges, so topping up would improve the blended rate. Needs "avg rate of existing hedges" on the exposure.
- **Product opp** (e.g. "Protect product opp", "Dynamic product opp"): the suggested starting bucket and why.

Spot comes from Twelve Data. If that fails, it falls back to the `spot` column of
the Supabase vol surface. As in the mock-up, each client row shows up to 3 boxes:
the two strongest factual reasons plus the product-opp box. Clients are ranked by
the total score of their top 3 factual reasons. The panel can be collapsed, and
the settings icon holds the per-day count, run hour and timezone.

In the deal builder, clients flagged on today's dashboard are listed first and
marked ★. Maturity is always pre-filled as a date: the next settlement date, or
today plus the horizon capped at the policy's maximum tenor. The learning history
records the bucket, product, notional, dates, strike and product inputs the
advisor actually used.

## Deal pre-fill

- Candidate products are drawn from the catalog by bucket: Conservative = Protect, Balanced = Participation, Dynamic = Enhanced. They are filtered by the client's region, leverage permission and permitted product list.
- The AI chooses one product per bucket and nominates a lead bucket. Its choices are validated against the candidates.
- The numbers are calculated, not generated:
  - notional = the gap to the policy cover target
  - maturity = the next settlement date, or the horizon capped at the maximum tenor
  - strike = the budget rate
  - pricing inputs are left blank.
- Learning: the advisor's final bucket, product and variables (including whether they overrode the AI) are saved. They are fed back as history in later suggestions.
- Privacy: the client name and contact details are **not** sent to OpenAI.

## Setup

1. Apply `neon/migrations/20261112000000_ai_trade_opportunities.sql` to the Neon database. Without `DATABASE_URL`, data is stored in `.local-data/opportunities.json`.
2. 8am per-user scheduling: set `CRON_SECRET` and call
   `POST /api/v1/opportunities/run-due` with `Authorization: Bearer $CRON_SECRET`
   every 15 minutes (e.g. a Render Cron Job). It generates a run for each user
   whose local run hour has passed today. If no scheduler is configured, the
   dashboard generates the day's run the first time it is opened after the run hour.
3. Optional: `DEFAULT_TIMEZONE` (IANA name) is used before a user saves their own timezone.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET/POST | `/api/v1/clients` | List / create client profiles |
| GET/PUT | `/api/v1/clients/{id}` | Read / replace a profile (send `updated_at` to prevent overwrites) |
| POST | `/api/v1/clients/{id}/deal-suggestions` | AI Generate: `{ "exposure_id"? }` returns the 3 bucket options and the AI pick |
| POST | `/api/v1/deal-suggestions/{id}/accept` | `{ bucket, product, parameters, create_rationale? }` records the choice and optionally creates a Rationale Studio draft |
| GET/POST | `/api/v1/opportunities?tz=` | Today's run (generated if due) / regenerate now |
| GET/PUT | `/api/v1/opportunity-settings` | `{ timezone, daily_count, generation_hour }` |
| POST | `/api/v1/opportunities/run-due` | Scheduler hook (requires `CRON_SECRET`) |
| GET | `/api/v1/catalog` | Products with input schema, and regions |

Every insert and update is written to `ai_opportunity_audit`.

## Not in this iteration

- Data governance (capture, storage, use, access control, client data ownership and custodian model). To be agreed with Lucas and Hannah.
- Authentication and per-user identity. Everything still uses the shared workspace advisor ID, like the rest of the app.
- Pricing (QuantLib) to fill rate inputs.
- Integration into the Foundry portal's real Dashboard, Trade Builder and Clients tab. These endpoints are designed to be called from there.
