const express = require("express");
const { z } = require("zod");
const pool = require("../db");

const router = express.Router();

const purposeSchema = z.object({
    code: z.string().min(1).max(100),
    description: z.string().min(1)
});

router.post("/", async (req, res, next) => {
    try {
        const data = purposeSchema.parse(req.body);

        const result = await pool.query(
            `INSERT INTO purposes (code, description)
             VALUES ($1, $2)
             RETURNING *`,
            [data.code, data.description]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

router.get("/", async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT *
             FROM purposes
             ORDER BY purpose_id`
        );

        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

router.patch("/:id", async (req, res, next) => {
    try {
        const id = Number(req.params.id);

        const updateSchema = z.object({
            description: z.string().min(1)
        });

        const data = updateSchema.parse(req.body);

        const result = await pool.query(
            `UPDATE purposes
             SET description = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE purpose_id = $2
             RETURNING *`,
            [data.description, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Purpose not found"
            });
        }

        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

router.post("/:id/retire", async (req, res, next) => {
    try {
        const id = Number(req.params.id);

        const purposeResult = await pool.query(
            `SELECT *
             FROM purposes
             WHERE purpose_id = $1`,
            [id]
        );

        if (purposeResult.rows.length === 0) {
            return res.status(404).json({
                error: "Purpose not found"
            });
        }

        const consentResult = await pool.query(
            `SELECT 1
             FROM consent_events
             WHERE purpose_id = $1
             LIMIT 1`,
            [id]
        );

        if (consentResult.rows.length > 0) {
            return res.status(409).json({
                error: "Purpose cannot be retired because consent has already been recorded"
            });
        }

        const result = await pool.query(
            `UPDATE purposes
             SET status = 'retired',
                 updated_at = CURRENT_TIMESTAMP
             WHERE purpose_id = $1
             RETURNING *`,
            [id]
        );

        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

module.exports = router;