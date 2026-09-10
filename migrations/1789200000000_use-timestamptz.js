exports.up = (pgm) => {
    pgm.sql(`
        ALTER TABLE purposes
        ALTER COLUMN created_at TYPE timestamptz
        USING created_at AT TIME ZONE 'UTC';
    `);

    pgm.sql(`
        ALTER TABLE purposes
        ALTER COLUMN updated_at TYPE timestamptz
        USING updated_at AT TIME ZONE 'UTC';
    `);

    pgm.sql(`
        ALTER TABLE notices
        ALTER COLUMN created_at TYPE timestamptz
        USING created_at AT TIME ZONE 'UTC';
    `);

    pgm.sql(`
        ALTER TABLE notices
        ALTER COLUMN updated_at TYPE timestamptz
        USING updated_at AT TIME ZONE 'UTC';
    `);

    pgm.sql(`
        ALTER TABLE notices
        ALTER COLUMN published_at TYPE timestamptz
        USING published_at AT TIME ZONE 'UTC';
    `);

    pgm.sql(`
        ALTER TABLE consent_events
        ALTER COLUMN event_at TYPE timestamptz
        USING event_at AT TIME ZONE 'UTC';
    `);

    pgm.sql(`
        ALTER TABLE consent_events
        ALTER COLUMN created_at TYPE timestamptz
        USING created_at AT TIME ZONE 'UTC';
    `);
};

exports.down = (pgm) => {
    pgm.sql(`
        ALTER TABLE purposes
        ALTER COLUMN created_at TYPE timestamp
        USING created_at AT TIME ZONE 'UTC';
    `);

    pgm.sql(`
        ALTER TABLE purposes
        ALTER COLUMN updated_at TYPE timestamp
        USING updated_at AT TIME ZONE 'UTC';
    `);

    pgm.sql(`
        ALTER TABLE notices
        ALTER COLUMN created_at TYPE timestamp
        USING created_at AT TIME ZONE 'UTC';
    `);

    pgm.sql(`
        ALTER TABLE notices
        ALTER COLUMN updated_at TYPE timestamp
        USING updated_at AT TIME ZONE 'UTC';
    `);

    pgm.sql(`
        ALTER TABLE notices
        ALTER COLUMN published_at TYPE timestamp
        USING published_at AT TIME ZONE 'UTC';
    `);

    pgm.sql(`
        ALTER TABLE consent_events
        ALTER COLUMN event_at TYPE timestamp
        USING event_at AT TIME ZONE 'UTC';
    `);

    pgm.sql(`
        ALTER TABLE consent_events
        ALTER COLUMN created_at TYPE timestamp
        USING created_at AT TIME ZONE 'UTC';
    `);
};