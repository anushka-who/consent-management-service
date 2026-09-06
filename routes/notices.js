const express = require("express");
const { z } = require("zod");
const pool = require("../db");

const purposeNoticesRouter = express.Router();
const noticesRouter = express.Router();

const noticeSchema = z.object({
    content: z.string().min(1),
    created_by: z.string().min(1)
});

purposeNoticesRouter.post("/:purposeId/notices", async (req, res, next) => {
    try {
        const purposeId = Number(req.params.purposeId);

        const data = noticeSchema.parse(req.body);

        const purposeResult = await pool.query(
            `SELECT *
             FROM purposes
             WHERE purpose_id = $1`,
            [purposeId]
        );

        if (purposeResult.rows.length === 0) {
            return res.status(404).json({
                error: "Purpose not found"
            });
        }

        const versionResult = await pool.query(
            `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
             FROM notices
             WHERE purpose_id = $1`,
            [purposeId]
        );

        const nextVersion = versionResult.rows[0].next_version;

        const result = await pool.query(
            `INSERT INTO notices
                (purpose_id, version, content, created_by)
             VALUES
                ($1, $2, $3, $4)
            RETURNING *`,
             [purposeId, nextVersion, data.content, data.created_by]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

purposeNoticesRouter.get("/:purposeId/notices", async (req, res, next) => {
    try {
        const purposeId = Number(req.params.purposeId);

        const result = await pool.query(
            `SELECT *
             FROM notices
             WHERE purpose_id = $1
             ORDER BY version`,
            [purposeId]
        );

        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

noticesRouter.post("/:noticeId/publish", async (req, res, next) => {
    try {
        const noticeId = Number(req.params.noticeId);

        const approvalSchema = z.object({
            approved_by: z.string().min(1)
        });

        const data = approvalSchema.parse(req.body);

       const result = await pool.query(
            `UPDATE notices
            SET status = 'published',
                approved_by = $1,
                published_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE notice_id = $2
                AND status = 'draft'
                AND created_by <> $1
            RETURNING *`,
            [data.approved_by, noticeId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Draft notice not found"
            });
        }

        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

module.exports = {
    purposeNoticesRouter,
    noticesRouter
};