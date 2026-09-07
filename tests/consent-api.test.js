const request = require("supertest");
const app = require("../index");
const pool = require("../db");

const testRunId = Date.now();

describe("Consent API", () => {
    let purposeId;
    let noticeId;

    beforeAll(async () => {
        const purpose = await pool.query(
            `INSERT INTO purposes (code, description)
             VALUES ($1, $2)
             RETURNING purpose_id`,
            [
                `consent_api_${testRunId}`,
                "Consent API test purpose"
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
                "Consent API test notice",
                "alice"
            ]
        );

        noticeId = notice.rows[0].notice_id;

        await pool.query(
            `UPDATE notices
             SET status = 'published',
                 approved_by = 'bob',
                 published_at = CURRENT_TIMESTAMP
             WHERE notice_id = $1`,
            [noticeId]
        );
    });

    afterAll(async () => {
        await pool.end();
    });

    test("grants consent", async () => {
        const response = await request(app)
            .post("/consent/grants")
            .send({
                principal_ref: `api_test_user_${testRunId}`,
                purpose_id: purposeId,
                notice_id: noticeId,
                idempotency_key: `api-grant-${testRunId}-001`
            });

        expect(response.statusCode).toBe(201);
        expect(response.body.event_type).toBe("grant");
    });

    test("does not create duplicate grant on retry", async () => {
        const response = await request(app)
            .post("/consent/grants")
            .send({
                principal_ref: `api_test_user_${testRunId}`,
                purpose_id: purposeId,
                notice_id: noticeId,
                idempotency_key: `api-grant-${testRunId}-001`
            });

        expect(response.statusCode).toBe(200);
        expect(response.body.event_type).toBe("grant");
    });

    test("checks current granted status", async () => {
        const response = await request(app)
            .get(
                `/consent/check?principal_ref=api_test_user_${testRunId}&purpose_id=${purposeId}`
            );

        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe("granted");
    });

    test("withdraws consent", async () => {
        const response = await request(app)
            .post("/consent/withdrawals")
            .send({
                principal_ref: `api_test_user_${testRunId}`,
                purpose_id: purposeId,
                notice_id: noticeId,
                idempotency_key: `api-withdrawal-${testRunId}-001`
            });

        expect(response.statusCode).toBe(201);
        expect(response.body.event_type).toBe("withdrawal");
    });

    test("checks current withdrawn status", async () => {
        const response = await request(app)
            .get(
                `/consent/check?principal_ref=api_test_user_${testRunId}&purpose_id=${purposeId}`
            );

        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe("withdrawn");
    });

    test("rejects withdrawal when consent was never granted", async () => {
        const response = await request(app)
            .post("/consent/withdrawals")
            .send({
                principal_ref: `never_granted_user_${testRunId}`,
                purpose_id: purposeId,
                notice_id: noticeId,
                idempotency_key: `api-invalid-withdrawal-${testRunId}-001`
            });

        expect(response.statusCode).toBe(409);
    });

    test("returns complete consent history", async () => {
        const response = await request(app)
            .get(
                `/consent/principals/api_test_user_${testRunId}/history`
            );

        expect(response.statusCode).toBe(200);
        expect(response.body.length).toBe(2);
        expect(response.body[0].event_type).toBe("grant");
        expect(response.body[1].event_type).toBe("withdrawal");
    });

    test("unseen principal has no consent", async () => {
        const response = await request(app)
            .get(
                `/consent/check?principal_ref=unknown_user_${testRunId}&purpose_id=${purposeId}`
            );

        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe("not_granted");
    });

    test("cannot retire a purpose after consent has been recorded", async () => {
      const purpose = await pool.query(
        `INSERT INTO purposes (code, description)
         VALUES ($1, $2)
         RETURNING purpose_id`,
        [
          `retire-test-${testRunId}`,
          "Purpose used to test retirement after consent",
        ],
      );

      const purposeId = purpose.rows[0].purpose_id;

      const notice = await pool.query(
        `INSERT INTO notices
            (purpose_id, version, content, status, created_by)
         VALUES
            ($1, 1, $2, 'published', $3)
         RETURNING notice_id`,
        [purposeId, "Published notice for retirement test", "creator@test.com"],
      );

      const noticeId = notice.rows[0].notice_id;

      await request(app)
        .post("/consent/grants")
        .send({
          principal_ref: `retire-principal-${testRunId}`,
          purpose_id: purposeId,
          notice_id: noticeId,
          idempotency_key: `retire-grant-${testRunId}`,
        })
        .expect(201);

      const response = await request(app)
        .post(`/purposes/${purposeId}/retire`)
        .expect(409);

      expect(response.body.error).toBe(
        "Purpose cannot be retired because consent has already been recorded",
      );
    });

    test("supports grant → withdrawal → grant lifecycle", async () => {
        const principal = `lifecycle_user_${testRunId}`;

        const firstGrant = await request(app)
            .post("/consent/grants")
            .send({
                principal_ref: principal,
                purpose_id: purposeId,
                notice_id: noticeId,
                idempotency_key: `lifecycle-grant-${testRunId}-001`
            });

        expect(firstGrant.statusCode).toBe(201);
        expect(firstGrant.body.event_type).toBe("grant");

        const withdrawal = await request(app)
            .post("/consent/withdrawals")
            .send({
                principal_ref: principal,
                purpose_id: purposeId,
                notice_id: noticeId,
                idempotency_key: `lifecycle-withdrawal-${testRunId}-001`
            });

        expect(withdrawal.statusCode).toBe(201);
        expect(withdrawal.body.event_type).toBe("withdrawal");

        const secondGrant = await request(app)
            .post("/consent/grants")
            .send({
                principal_ref: principal,
                purpose_id: purposeId,
                notice_id: noticeId,
                idempotency_key: `lifecycle-grant-${testRunId}-002`
            });

        expect(secondGrant.statusCode).toBe(201);
        expect(secondGrant.body.event_type).toBe("grant");

        const check = await request(app)
            .get(
                `/consent/check?principal_ref=${principal}&purpose_id=${purposeId}`
            );

        expect(check.statusCode).toBe(200);
        expect(check.body.status).toBe("granted");

        const history = await request(app)
            .get(`/consent/principals/${principal}/history`);

        expect(history.statusCode).toBe(200);
        expect(history.body.length).toBe(3);
        expect(history.body[0].event_type).toBe("grant");
        expect(history.body[1].event_type).toBe("withdrawal");
        expect(history.body[2].event_type).toBe("grant");
    });
});