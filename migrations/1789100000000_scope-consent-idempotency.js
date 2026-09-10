exports.up = (pgm) => {
    pgm.dropConstraint(
        "consent_events",
        "consent_events_idempotency_key_key"
    );

    pgm.addConstraint(
        "consent_events",
        "consent_events_principal_purpose_idempotency_key_key",
        {
            unique: [
                "principal_ref",
                "purpose_id",
                "idempotency_key"
            ]
        }
    );
};

exports.down = (pgm) => {
    pgm.dropConstraint(
        "consent_events",
        "consent_events_principal_purpose_idempotency_key_key"
    );

    pgm.addConstraint(
        "consent_events",
        "consent_events_idempotency_key_key",
        {
            unique: ["idempotency_key"]
        }
    );
};