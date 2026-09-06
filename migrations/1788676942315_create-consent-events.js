exports.up = (pgm) => {
    pgm.createTable("consent_events", {
        event_id: {
            type: "serial",
            primaryKey: true
        },

        principal_ref: {
            type: "varchar(100)",
            notNull: true
        },

        purpose_id: {
            type: "integer",
            notNull: true,
            references: "purposes(purpose_id)"
        },

        notice_id: {
            type: "integer",
            notNull: true,
            references: "notices(notice_id)"
        },

        event_type: {
            type: "varchar(20)",
            notNull: true
        },

        event_at: {
            type: "timestamp",
            notNull: true,
            default: pgm.func("CURRENT_TIMESTAMP")
        },

        idempotency_key: {
            type: "varchar(255)",
            notNull: true,
            unique: true
        },

        created_at: {
            type: "timestamp",
            notNull: true,
            default: pgm.func("CURRENT_TIMESTAMP")
        }
    });

    pgm.addConstraint("consent_events", "consent_events_event_type_check", {
        check: "event_type IN ('grant', 'withdrawal')"
    });
};

exports.down = (pgm) => {
    pgm.dropTable("consent_events");
};