const request = require("supertest");
const app = require("../index");
const pool = require("../db");

const uniqueCode = `test_${Date.now()}`;

describe("Purpose API", () => {

    test("creates a purpose", async () => {
        const response = await request(app)
            .post("/purposes")
            .send({
                code: uniqueCode,
                description: "Test purpose"
            });

        expect(response.statusCode).toBe(201);
        expect(response.body.code).toBe(uniqueCode);
        expect(response.body.description).toBe("Test purpose");
        expect(response.body.status).toBe("active");
    });

    test("rejects invalid purpose data", async () => {
        const response = await request(app)
            .post("/purposes")
            .send({
                code: "",
                description: ""
            });

        expect(response.statusCode).toBe(400);
    });

    test("lists purposes", async () => {
        const response = await request(app)
            .get("/purposes");

        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });

    test("updates a purpose description", async () => {
        const createResponse = await request(app)
            .post("/purposes")
            .send({
                code: `update_${Date.now()}`,
                description: "Original description"
            });

        const purposeId = createResponse.body.purpose_id;

        const response = await request(app)
            .patch(`/purposes/${purposeId}`)
            .send({
                description: "Updated description"
            });

        expect(response.statusCode).toBe(200);
        expect(response.body.description).toBe("Updated description");
    });

    test("returns 404 for nonexistent purpose", async () => {
        const response = await request(app)
            .patch("/purposes/999999")
            .send({
                description: "Updated description"
            });

        expect(response.statusCode).toBe(404);
    });

    test("retires an active purpose", async () => {
        const createResponse = await request(app)
            .post("/purposes")
            .send({
                code: `retire_${Date.now()}`,
                description: "Purpose to retire"
            });

        const purposeId = createResponse.body.purpose_id;

        const response = await request(app)
            .post(`/purposes/${purposeId}/retire`);

        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe("retired");
    });

    afterAll(async () => {
        await pool.end();
    });

});