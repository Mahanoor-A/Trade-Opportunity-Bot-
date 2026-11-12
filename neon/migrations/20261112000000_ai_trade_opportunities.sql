-- AI Trade Opportunity Generator, iteration 1.
-- Client profiles, per-advisor generation settings, daily opportunity runs and
-- AI deal suggestions (with the advisor's final choice, used as learning history).
-- Every insert/update is written to ai_opportunity_audit.

CREATE TABLE IF NOT EXISTS public.ai_clients (
    id          TEXT        NOT NULL,
    advisor_id  TEXT        NOT NULL CHECK (char_length(advisor_id) BETWEEN 1 AND 128),
    payload     JSONB       NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now()),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now()),
    PRIMARY KEY (advisor_id, id)
);

CREATE TABLE IF NOT EXISTS public.ai_opportunity_settings (
    id          TEXT        NOT NULL,
    advisor_id  TEXT        NOT NULL CHECK (char_length(advisor_id) BETWEEN 1 AND 128),
    payload     JSONB       NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now()),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now()),
    PRIMARY KEY (advisor_id, id)
);

CREATE TABLE IF NOT EXISTS public.ai_opportunity_runs (
    id          TEXT        NOT NULL,
    advisor_id  TEXT        NOT NULL CHECK (char_length(advisor_id) BETWEEN 1 AND 128),
    payload     JSONB       NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now()),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now()),
    PRIMARY KEY (advisor_id, id)
);

CREATE INDEX IF NOT EXISTS ai_opportunity_runs_advisor_updated_idx
    ON public.ai_opportunity_runs (advisor_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_deal_suggestions (
    id          TEXT        NOT NULL,
    advisor_id  TEXT        NOT NULL CHECK (char_length(advisor_id) BETWEEN 1 AND 128),
    payload     JSONB       NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now()),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now()),
    PRIMARY KEY (advisor_id, id)
);

CREATE INDEX IF NOT EXISTS ai_deal_suggestions_client_idx
    ON public.ai_deal_suggestions (advisor_id, (payload->>'client_id'), updated_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_opportunity_audit (
    id           BIGSERIAL   PRIMARY KEY,
    kind         TEXT        NOT NULL,
    record_id    TEXT        NOT NULL,
    advisor_id   TEXT        NOT NULL,
    action       TEXT        NOT NULL,
    before_state JSONB,
    after_state  JSONB       NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_opportunity_audit_record_idx
    ON public.ai_opportunity_audit (kind, record_id, created_at DESC);
