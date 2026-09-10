exports.up = (pgm) => {
    pgm.sql(`
        CREATE TRIGGER consent_events_no_truncate
        BEFORE TRUNCATE ON consent_events
        FOR EACH STATEMENT
        EXECUTE FUNCTION prevent_consent_event_mutation();
    `);
};

exports.down = (pgm) => {
    pgm.sql(`
        DROP TRIGGER IF EXISTS consent_events_no_truncate
        ON consent_events;
    `);
};