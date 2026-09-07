exports.up = (pgm) => {
    pgm.sql(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_roles
                WHERE rolname = 'consent_app'
            ) THEN
                CREATE ROLE consent_app
                WITH
                    NOSUPERUSER
                    NOCREATEDB
                    NOCREATEROLE
                    INHERIT
                    LOGIN
                    NOREPLICATION
                    PASSWORD 'consent_app_password';
            END IF;
        END
        $$;
    `);

    pgm.sql(`
        GRANT USAGE ON SCHEMA public TO consent_app;

        GRANT SELECT, INSERT, UPDATE
        ON purposes
        TO consent_app;

        GRANT USAGE, SELECT
        ON SEQUENCE purposes_purpose_id_seq
        TO consent_app;

        GRANT SELECT, INSERT, UPDATE
        ON notices
        TO consent_app;

        GRANT USAGE, SELECT
        ON SEQUENCE notices_notice_id_seq
        TO consent_app;

        GRANT SELECT, INSERT
        ON consent_events
        TO consent_app;

        GRANT USAGE, SELECT
        ON SEQUENCE consent_events_event_id_seq
        TO consent_app;

        REVOKE UPDATE, DELETE
        ON consent_events
        FROM consent_app;
    `);
};

exports.down = (pgm) => {
    pgm.sql(`
        REVOKE ALL PRIVILEGES
        ON purposes, notices, consent_events
        FROM consent_app;

        REVOKE ALL PRIVILEGES
        ON SEQUENCE
            purposes_purpose_id_seq,
            notices_notice_id_seq,
            consent_events_event_id_seq
        FROM consent_app;

        REVOKE USAGE
        ON SCHEMA public
        FROM consent_app;
    `);

    pgm.dropRole("consent_app");
};