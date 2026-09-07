const pool = require("../db");
const { Pool } = require("pg");

const {
    getCurrentConsentStatus
} = require("../services/consent-services");

const testRunId = Date.now();

let purposeId;
let noticeId;

beforeAll(async () => {
    const purpose = await pool.query(
        `INSERT INTO purposes (code, description)
         VALUES ($1, $2)
         RETURNING purpose_id`,
        [
            `consent_events_test_${testRunId}`,
            "Consent events test purpose"
        ]
    );

    purposeId = purpose.rows[0].purpose_id;

    const notice = await pool.query(
        `INSERT INTO notices
            (purpose_id, version, content, created_by)
         VALUES
            ($1, $2, $3, $4)
         RETURNING notice_id`,
        [
            purposeId,
            1,
            "Consent events test notice",
            "test_user"
        ]
    );

    noticeId = notice.rows[0].notice_id;
});

const ownerPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});


describe("Consent events", () => {

    const purposeId = 1;
    const noticeId = 1;


    test("current status changes grant → withdrawal → grant", async () => {

        const principalRef = "stage4-lifecycle-user";


        // GRANT

        await pool.query(
            `INSERT INTO consent_events
                (principal_ref, purpose_id, notice_id, event_type, idempotency_key)
             VALUES
                ($1, $2, $3, 'grant', $4)`,
            [
                principalRef,
                purposeId,
                noticeId,
                `${testRunId}-stage4-grant-1`
            ]
        );


        let result = await getCurrentConsentStatus(
            principalRef,
            purposeId
        );

        expect(result.status).toBe("granted");


        // WITHDRAWAL

        await pool.query(
            `INSERT INTO consent_events
                (principal_ref, purpose_id, notice_id, event_type, idempotency_key)
             VALUES
                ($1, $2, $3, 'withdrawal', $4)`,
            [
                principalRef,
                purposeId,
                noticeId,
                `${testRunId}-stage4-withdrawal-1`
            ]
        );


        result = await getCurrentConsentStatus(
            principalRef,
            purposeId
        );

        expect(result.status).toBe("withdrawn");


        // GRANT AGAIN

        await pool.query(
            `INSERT INTO consent_events
                (principal_ref, purpose_id, notice_id, event_type, idempotency_key)
             VALUES
                ($1, $2, $3, 'grant', $4)`,
            [
                principalRef,
                purposeId,
                noticeId,
                `${testRunId}-stage4-grant-2`
            ]
        );


        result = await getCurrentConsentStatus(
            principalRef,
            purposeId
        );

        expect(result.status).toBe("granted");
    });


    test("consent events cannot be updated", async () => {

        const principalRef = "stage4-update-user";


        const insertResult = await pool.query(
            `INSERT INTO consent_events
                (principal_ref, purpose_id, notice_id, event_type, idempotency_key)
             VALUES
                ($1, $2, $3, 'grant', $4)
             RETURNING event_id`,
            [
                principalRef,
                purposeId,
                noticeId,
                `${testRunId}-stage4-update-test`
            ]
        );


        const eventId = insertResult.rows[0].event_id;


        await expect(
            pool.query(
                `UPDATE consent_events
                SET event_type = 'withdrawal'
                WHERE event_id = $1`,
                [eventId]
            )
        ).rejects.toThrow("permission denied");
    });


    test("consent events cannot be deleted", async () => {

        const principalRef = "stage4-delete-user";


        const insertResult = await pool.query(
            `INSERT INTO consent_events
                (principal_ref, purpose_id, notice_id, event_type, idempotency_key)
             VALUES
                ($1, $2, $3, 'grant', $4)
             RETURNING event_id`,
            [
                principalRef,
                purposeId,
                noticeId,
                `${testRunId}-stage4-delete-test`
            ]
        );


        const eventId = insertResult.rows[0].event_id;


        await expect(
            pool.query(
                `DELETE FROM consent_events
                WHERE event_id = $1`,
                [eventId]
            )
        ).rejects.toThrow("permission denied");
    });

    test("database trigger prevents consent event updates", async () => {

        const principalRef = `stage4-trigger-user-${testRunId}`;

        const insertResult = await ownerPool.query(
            `INSERT INTO consent_events
                (principal_ref, purpose_id, notice_id, event_type, idempotency_key)
            VALUES
                ($1, $2, $3, 'grant', $4)
            RETURNING event_id`,
            [
                principalRef,
                purposeId,
                noticeId,
                `${testRunId}-stage4-trigger-test`
            ]
        );

        const eventId = insertResult.rows[0].event_id;

        await expect(
            ownerPool.query(
                `UPDATE consent_events
                SET event_type = 'withdrawal'
                WHERE event_id = $1`,
                [eventId]
            )
        ).rejects.toThrow("Consent events are append-only");
    });


    test("unseen principal has no consent", async () => {

        const result = await getCurrentConsentStatus(
            "brand-new-stage4-user",
            purposeId
        );


        expect(result.status).toBe("not_granted");
    });

});


afterAll(async () => {
    await pool.end();
    await ownerPool.end();
});