const express = require("express");
const { z } = require("zod");
const pool = require("../db");

const router = express.Router();

const grantSchema = z.object({
    principal_ref: z.string().min(1).max(100),
    purpose_id: z.number().int().positive(),
    notice_id: z.number().int().positive(),
    idempotency_key: z.string().min(1).max(255)
});

router.post("/grants", async (req, res, next) => {
    try {
        const data = grantSchema.parse(req.body);

        const purposeResult = await pool.query(
            `SELECT *
             FROM purposes
             WHERE purpose_id = $1`,
            [data.purpose_id]
        );

        if (purposeResult.rows.length === 0) {
            return res.status(404).json({
                error: "Purpose not found"
            });
        }

        if (purposeResult.rows[0].status !== "active") {
            return res.status(409).json({
                error: "Cannot grant consent for a retired purpose"
            });
        }

        const noticeResult = await pool.query(
            `SELECT *
             FROM notices
             WHERE notice_id = $1
               AND purpose_id = $2`,
            [data.notice_id, data.purpose_id]
        );

        if (noticeResult.rows.length === 0) {
            return res.status(404).json({
                error: "Notice not found for this purpose"
            });
        }

        if (noticeResult.rows[0].status !== "published") {
            return res.status(409).json({
                error: "Consent can only be granted against a published notice"
            });
        }

        const result = await pool.query(
            `INSERT INTO consent_events
                (
                    principal_ref,
                    purpose_id,
                    notice_id,
                    event_type,
                    idempotency_key
                )
             VALUES
                ($1, $2, $3, 'grant', $4)
             ON CONFLICT (idempotency_key)
             DO NOTHING
             RETURNING *`,
            [
                data.principal_ref,
                data.purpose_id,
                data.notice_id,
                data.idempotency_key
            ]
        );

        if (result.rows.length === 0) {
            const existing = await pool.query(
                `SELECT *
                 FROM consent_events
                 WHERE idempotency_key = $1`,
                [data.idempotency_key]
            );

            return res.status(200).json(existing.rows[0]);
        }

        res.status(201).json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

const withdrawalSchema = z.object({
    principal_ref: z.string().min(1).max(100),
    purpose_id: z.number().int().positive(),
    notice_id: z.number().int().positive(),
    idempotency_key: z.string().min(1).max(255)
});

router.post("/withdrawals", async (req, res, next) => {
    try {
        const data = withdrawalSchema.parse(req.body);

        // 1. Check idempotency first
        const existingEvent = await pool.query(
            `SELECT *
             FROM consent_events
             WHERE idempotency_key = $1`,
            [data.idempotency_key]
        );

        if (existingEvent.rows.length > 0) {
            return res.status(200).json(existingEvent.rows[0]);
        }

        const purposeResult = await pool.query(
            `SELECT purpose_id
             FROM purposes
             WHERE purpose_id = $1`,
            [data.purpose_id]
        );

        if (purposeResult.rows.length === 0) {
            return res.status(404).json({
                error: "Purpose not found"
            });
        }

        const noticeResult = await pool.query(
            `SELECT notice_id
             FROM notices
             WHERE notice_id = $1
               AND purpose_id = $2`,
            [data.notice_id, data.purpose_id]
        );

        if (noticeResult.rows.length === 0) {
            return res.status(404).json({
                error: "Notice not found for this purpose"
            });
        }

        const consentResult = await pool.query(
            `SELECT event_type
             FROM consent_events
             WHERE principal_ref = $1
               AND purpose_id = $2
             ORDER BY event_at DESC, event_id DESC
             LIMIT 1`,
            [data.principal_ref, data.purpose_id]
        );

        if (
            consentResult.rows.length === 0 ||
            consentResult.rows[0].event_type !== "grant"
        ) {
            return res.status(409).json({
                error: "Consent has not been granted or is already withdrawn"
            });
        }

        const result = await pool.query(
            `INSERT INTO consent_events
                (
                    principal_ref,
                    purpose_id,
                    notice_id,
                    event_type,
                    idempotency_key
                )
             VALUES ($1, $2, $3, 'withdrawal', $4)
             RETURNING *`,
            [
                data.principal_ref,
                data.purpose_id,
                data.notice_id,
                data.idempotency_key
            ]
        );

        return res.status(201).json(result.rows[0]);

    } catch (err) {
        next(err);
    }
});

router.get("/check", async (req, res, next) => {
    try {
        const principalRef = req.query.principal_ref;
        const purposeId = Number(req.query.purpose_id);

        if (!principalRef || !purposeId) {
            return res.status(400).json({
                error: "principal_ref and purpose_id are required"
            });
        }

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
            return res.json({
                principal_ref: principalRef,
                purpose_id: purposeId,
                status: "not_granted",
                latest_event: null
            });
        }

        const latestEvent = result.rows[0];

        res.json({
            principal_ref: principalRef,
            purpose_id: purposeId,
            status:
                latestEvent.event_type === "grant"
                    ? "granted"
                    : "withdrawn",
            latest_event: latestEvent
        });

    } catch (err) {
        next(err);
    }
});

router.get("/principals/:ref/history", async (req, res, next) => {
    try {
        const principalRef = req.params.ref;

        const result = await pool.query(
            `SELECT
                event_id,
                principal_ref,
                purpose_id,
                notice_id,
                event_type,
                event_at,
                idempotency_key,
                created_at
             FROM consent_events
             WHERE principal_ref = $1
             ORDER BY event_at ASC, event_id ASC`,
            [principalRef]
        );

        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

module.exports = router;

