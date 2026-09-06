exports.up = (pgm) => {
    pgm.sql(`
        CREATE OR REPLACE FUNCTION prevent_consent_event_mutation()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'Consent events are append-only';
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
    `);

    pgm.sql(`
        CREATE TRIGGER consent_events_no_update
        BEFORE UPDATE ON consent_events
        FOR EACH ROW
        EXECUTE FUNCTION prevent_consent_event_mutation();
    `);

    pgm.sql(`
        CREATE TRIGGER consent_events_no_delete
        BEFORE DELETE ON consent_events
        FOR EACH ROW
        EXECUTE FUNCTION prevent_consent_event_mutation();
    `);
};

exports.down = (pgm) => {
    pgm.sql(`
        DROP TRIGGER IF EXISTS consent_events_no_update
        ON consent_events;
    `);

    pgm.sql(`
        DROP TRIGGER IF EXISTS consent_events_no_delete
        ON consent_events;
    `);

    pgm.sql(`
        DROP FUNCTION IF EXISTS prevent_consent_event_mutation();
    `);
};