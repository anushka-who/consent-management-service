exports.up = (pgm) => {
    pgm.createTable("purposes", {
        purpose_id: {
            type: "serial",
            primaryKey: true
        },

        code: {
            type: "varchar(100)",
            notNull: true,
            unique: true
        },

        description: {
            type: "text",
            notNull: true
        },

        status: {
            type: "varchar(20)",
            notNull: true,
            default: "active"
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
};

exports.down = (pgm) => {
    pgm.dropTable("purposes");
};