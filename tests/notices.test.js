const request = require("supertest");
const app = require("../index");
const pool = require("../db");

describe("Notice API", () => {

    let purposeId;

    beforeAll(async () => {
        const purpose = await pool.query(
            `INSERT INTO purposes (code, description)
             VALUES ($1, $2)
             RETURNING purpose_id`,
            [`notice_test_${Date.now()}`, "Notice test purpose"]
        );

        purposeId = purpose.rows[0].purpose_id;
    });

    afterAll(async () => {
        await pool.end();
    });

    test("creates a draft notice", async () => {
        const response = await request(app)
            .post(`/purposes/${purposeId}/notices`)
            .send({
                content: "This is a test privacy notice.",
                created_by: "alice"
            });

        expect(response.statusCode).toBe(201);
        expect(response.body.status).toBe("draft");
        expect(response.body.created_by).toBe("alice");
    });

    test("creator cannot approve their own notice", async () => {
        const createResponse = await request(app)
            .post(`/purposes/${purposeId}/notices`)
            .send({
                content: "Self approval test notice.",
                created_by: "alice"
            });

        const noticeId = createResponse.body.notice_id;

        const publishResponse = await request(app)
            .post(`/notices/${noticeId}/publish`)
            .send({
                approved_by: "alice"
            });

        expect(publishResponse.statusCode).toBe(404);
    });

    test("different person can approve a notice", async () => {
        const createResponse = await request(app)
            .post(`/purposes/${purposeId}/notices`)
            .send({
                content: "Two person approval test.",
                created_by: "alice"
            });

        const noticeId = createResponse.body.notice_id;

        const publishResponse = await request(app)
            .post(`/notices/${noticeId}/publish`)
            .send({
                approved_by: "bob"
            });

        expect(publishResponse.statusCode).toBe(200);
        expect(publishResponse.body.status).toBe("published");
        expect(publishResponse.body.approved_by).toBe("bob");
    });

    test("published notice cannot be modified", async () => {
        const createResponse = await request(app)
            .post(`/purposes/${purposeId}/notices`)
            .send({
                content: "Immutable notice test.",
                created_by: "alice"
            });

        const noticeId = createResponse.body.notice_id;

        await request(app)
            .post(`/notices/${noticeId}/publish`)
            .send({
                approved_by: "bob"
            });

        await expect(
            pool.query(
                `UPDATE notices
                 SET content = $1
                 WHERE notice_id = $2`,
                ["Modified content", noticeId]
            )
        ).rejects.toThrow("Published notices cannot be modified");
    });

});