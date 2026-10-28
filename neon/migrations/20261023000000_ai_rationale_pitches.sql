CREATE TABLE IF NOT EXISTS public.ai_rationale_pitches (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    advisor_id  TEXT        NOT NULL CHECK (char_length(advisor_id) BETWEEN 1 AND 128),
    payload     JSONB       NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now()),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT date_trunc('milliseconds', now())
);

CREATE INDEX IF NOT EXISTS ai_rationale_pitches_advisor_updated_idx
    ON public.ai_rationale_pitches (advisor_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_rationale_pitch_audit (
    id           BIGSERIAL   PRIMARY KEY,
    pitch_id     UUID        NOT NULL REFERENCES public.ai_rationale_pitches(id) ON DELETE RESTRICT,
    advisor_id   TEXT        NOT NULL,
    action       TEXT        NOT NULL,
    before_state JSONB,
    after_state  JSONB       NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_rationale_pitch_audit_pitch_idx
    ON public.ai_rationale_pitch_audit (pitch_id, created_at DESC);
