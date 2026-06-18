CREATE OR REPLACE FUNCTION prevent_prompt_version_mutation()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE'
       AND current_setting('prompt_registry.allow_prompt_version_delete', true) = 'on' THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION 'prompt versions are immutable'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
