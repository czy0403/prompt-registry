CREATE OR REPLACE FUNCTION prevent_prompt_version_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'prompt versions are immutable'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prompt_version_immutable ON prompt_version;
CREATE TRIGGER prompt_version_immutable
BEFORE UPDATE OR DELETE ON prompt_version
FOR EACH ROW EXECUTE FUNCTION prevent_prompt_version_mutation();
