CREATE TABLE project (
    id              uuid PRIMARY KEY,
    name            varchar(128) NOT NULL,
    description     text NOT NULL DEFAULT '',
    archived_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_updated_idx
    ON project (updated_at DESC, id);

CREATE TABLE project_api_token (
    id              uuid PRIMARY KEY,
    project_id      uuid NOT NULL REFERENCES project(id),
    name            varchar(128) NOT NULL,
    token_hash      varchar(64) NOT NULL UNIQUE,
    token_prefix    varchar(32) NOT NULL,
    last_used_at    timestamptz,
    revoked_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_api_token_project_created_idx
    ON project_api_token (project_id, created_at DESC);

ALTER TABLE prompt
    ADD CONSTRAINT prompt_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES project(id);
