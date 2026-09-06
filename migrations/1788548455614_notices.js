exports.up = (pgm) => {
    pgm.createTable("notices", {
        notice_id: {
            type: "serial",
            primaryKey: true
        },

        purpose_id: {
            type: "integer",
            notNull: true,
            references: "purposes",
            onDelete: "RESTRICT"
        },

        version: {
            type: "integer",
            notNull: true
        },

        content: {
            type: "text",
            notNull: true
        },

        status: {
            type: "varchar(20)",
            notNull: true,
            default: "draft"
        },

        approved_by: {
            type: "varchar(100)"
        },

        published_at: {
            type: "timestamp"
        },

        created_at: {
            type: "timestamp",
            notNull: true,
            default: pgm.func("CURRENT_TIMESTAMP")
        },

        updated_at: {
            type: "timestamp",
            notNull: true,
            default: pgm.func("CURRENT_TIMESTAMP")
        }
    });

    pgm.addConstraint(
        "notices",
        "unique_purpose_version",
        {
            unique: ["purpose_id", "version"]
        }
    );
};

exports.down = (pgm) => {
    pgm.dropTable("notices");
};