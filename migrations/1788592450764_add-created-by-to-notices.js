exports.up = (pgm) => {
    pgm.addColumn("notices", {
        created_by: {
            type: "varchar(100)",
            notNull: true,
            default: "system"
        }
    });
};

exports.down = (pgm) => {
    pgm.dropColumn("notices", "created_by");
};