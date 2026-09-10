exports.up = (pgm) => {
    pgm.createIndex(
        "consent_events",
        ["principal_ref", "purpose_id", "event_at", "event_id"],
        {
            name: "consent_events_current_status_idx"
        }
    );

    pgm.createIndex(
        "consent_events",
        ["principal_ref", "event_at", "event_id"],
        {
            name: "consent_events_history_idx"
        }
    );
};

exports.down = (pgm) => {
    pgm.dropIndex(
        "consent_events",
        "consent_events_current_status_idx"
    );

    pgm.dropIndex(
        "consent_events",
        "consent_events_history_idx"
    );
};