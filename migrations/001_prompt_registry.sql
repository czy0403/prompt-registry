CREATE TABLE IF NOT EXISTS schema_migration (
    version         varchar(255) PRIMARY KEY,
    applied_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prompt (
    id              uuid PRIMARY KEY,
    project_id      uuid NOT NULL,
    prompt_key      varchar(128) NOT NULL,
    name            varchar(128) NOT NULL,
    description     text NOT NULL DEFAULT '',
    type            varchar(32) NOT NULL,
    archived_at     timestamptz,
    created_by      uuid NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT prompt_key_format CHECK (prompt_key ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'),
    CONSTRAINT prompt_type_allowed CHECK (type IN ('text', 'chat')),
    UNIQUE (project_id, prompt_key)
);

CREATE INDEX prompt_project_updated_idx
    ON prompt (project_id, updated_at DESC);

CREATE TABLE prompt_version (
    id              uuid PRIMARY KEY,
    prompt_id       uuid NOT NULL REFERENCES prompt(id),
    version         integer NOT NULL CHECK (version > 0),
    content         jsonb NOT NULL,
    model_config    jsonb NOT NULL DEFAULT '{}',
    input_schema    jsonb,
    output_schema   jsonb,
    commit_message  text,
    created_by      uuid NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (prompt_id, version)
);

CREATE INDEX prompt_version_prompt_created_idx
    ON prompt_version (prompt_id, created_at DESC);

CREATE TABLE prompt_label (
    prompt_id       uuid NOT NULL REFERENCES prompt(id),
    label           varchar(64) NOT NULL,
    version_id      uuid NOT NULL REFERENCES prompt_version(id),
    revision        bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_by      uuid NOT NULL,
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT prompt_label_format CHECK (label ~ '^[a-z0-9][a-z0-9._-]*$'),
    PRIMARY KEY (prompt_id, label)
);

CREATE TABLE prompt_label_history (
    id                uuid PRIMARY KEY,
    prompt_id         uuid NOT NULL REFERENCES prompt(id),
    label             varchar(64) NOT NULL,
    from_version_id   uuid REFERENCES prompt_version(id),
    to_version_id     uuid NOT NULL REFERENCES prompt_version(id),
    action            varchar(32) NOT NULL,
    reason            text,
    created_by        uuid NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT prompt_label_history_action_allowed
        CHECK (action IN ('create', 'publish', 'rollback', 'move'))
);

CREATE INDEX prompt_label_history_lookup_idx
    ON prompt_label_history (prompt_id, label, created_at DESC);

-- Enforce that a label can only point to a version owned by the same prompt.
CREATE OR REPLACE FUNCTION enforce_prompt_label_version_owner()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM prompt_version
        WHERE id = NEW.version_id
          AND prompt_id = NEW.prompt_id
    ) THEN
        RAISE EXCEPTION 'label version does not belong to prompt'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prompt_label_version_owner ON prompt_label;
CREATE TRIGGER prompt_label_version_owner
BEFORE INSERT OR UPDATE ON prompt_label
FOR EACH ROW EXECUTE FUNCTION enforce_prompt_label_version_owner();
