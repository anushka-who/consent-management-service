exports.up = (pgm) => {
    pgm.sql(`
        CREATE OR REPLACE FUNCTION prevent_published_notice_edit()
        RETURNS TRIGGER AS $$
        BEGIN
            IF OLD.status = 'published' THEN
                RAISE EXCEPTION 'Published notices cannot be modified';
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `);

    pgm.sql(`
        CREATE TRIGGER notices_immutable_after_publish
        BEFORE UPDATE ON notices
        FOR EACH ROW
        EXECUTE FUNCTION prevent_published_notice_edit();
    `);
};

exports.down = (pgm) => {
    pgm.sql(`
        DROP TRIGGER IF EXISTS notices_immutable_after_publish
        ON notices;
    `);

    pgm.sql(`
        DROP FUNCTION IF EXISTS prevent_published_notice_edit();
    `);
};