require("dotenv").config();

exports.up = (pgm) => {
    const appPassword = process.env.APP_DB_PASSWORD;

    if (!appPassword) {
        throw new Error("APP_DB_PASSWORD is required");
    }

    const escapedPassword = appPassword.replace(/'/g, "''");

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
                    PASSWORD '${escapedPassword}';
            END IF;
        END
        $$;
    `);

    pgm.sql(`
        GRANT USAGE ON SCHEMA public
        TO consent_app;
    `);

    pgm.sql(`
        GRANT SELECT, INSERT, UPDATE
        ON TABLE purposes
        TO consent_app;
    `);

    pgm.sql(`
        GRANT SELECT, INSERT, UPDATE
        ON TABLE notices
        TO consent_app;
    `);

    pgm.sql(`
        GRANT SELECT, INSERT
        ON TABLE consent_events
        TO consent_app;
    `);

    pgm.sql(`
        REVOKE UPDATE, DELETE
        ON TABLE consent_events
        FROM consent_app;
    `);

    pgm.sql(`
        GRANT USAGE, SELECT
        ON SEQUENCE purposes_purpose_id_seq
        TO consent_app;
    `);

    pgm.sql(`
        GRANT USAGE, SELECT
        ON SEQUENCE notices_notice_id_seq
        TO consent_app;
    `);

    pgm.sql(`
        GRANT USAGE, SELECT
        ON SEQUENCE consent_events_event_id_seq
        TO consent_app;
    `);
};

exports.down = (pgm) => {
    pgm.sql(`
        REVOKE ALL PRIVILEGES
        ON TABLE purposes, notices, consent_events
        FROM consent_app;
    `);

    pgm.sql(`
        REVOKE ALL PRIVILEGES
        ON SEQUENCE
            purposes_purpose_id_seq,
            notices_notice_id_seq,
            consent_events_event_id_seq
        FROM consent_app;
    `);

    pgm.sql(`
        REVOKE USAGE
        ON SCHEMA public
        FROM consent_app;
    `);
};