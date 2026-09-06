const pool = require("../db");

async function getCurrentConsentStatus(principalRef, purposeId) {
    const result = await pool.query(
        `SELECT
            event_type,
            event_at,
            notice_id
         FROM consent_events
         WHERE principal_ref = $1
           AND purpose_id = $2
         ORDER BY event_at DESC, event_id DESC
         LIMIT 1`,
        [principalRef, purposeId]
    );

    if (result.rows.length === 0) {
        return {
            status: "not_granted",
            latestEvent: null
        };
    }

    const latestEvent = result.rows[0];

    return {
        status:
            latestEvent.event_type === "grant"
                ? "granted"
                : "withdrawn",

        latestEvent: latestEvent
    };
}

module.exports = {
    getCurrentConsentStatus
};