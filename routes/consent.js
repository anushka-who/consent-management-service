const express = require("express");
const { z } = require("zod");
const pool = require("../db");

const {
    getCurrentConsentStatus
} = require("../services/consent-services");

const router = express.Router();

const grantSchema = z.object({
  principal_ref: z.string().min(1).max(100),
  purpose_id: z.number().int().positive(),
  notice_id: z.number().int().positive(),
  idempotency_key: z.string().min(1).max(255),
});

router.post("/grants", async (req, res, next) => {
  try {
    const data = grantSchema.parse(req.body);

    const purposeResult = await pool.query(
      `SELECT *
             FROM purposes
             WHERE purpose_id = $1`,
      [data.purpose_id],
    );

    if (purposeResult.rows.length === 0) {
      return res.status(404).json({
        error: "Purpose not found",
      });
    }

    if (purposeResult.rows[0].status !== "active") {
      return res.status(409).json({
        error: "Cannot grant consent for a retired purpose",
      });
    }

    const noticeResult = await pool.query(
      `SELECT *
             FROM notices
             WHERE notice_id = $1
               AND purpose_id = $2`,
      [data.notice_id, data.purpose_id],
    );

    if (noticeResult.rows.length === 0) {
      return res.status(404).json({
        error: "Notice not found for this purpose",
      });
    }

    if (noticeResult.rows[0].status !== "published") {
      return res.status(409).json({
        error: "Consent can only be granted against a published notice",
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
     ON CONFLICT (
        principal_ref,
        purpose_id,
        idempotency_key
     )
     DO NOTHING
     RETURNING *`,
      [
        data.principal_ref,
        data.purpose_id,
        data.notice_id,
        data.idempotency_key,
      ],
    );

    if (result.rows.length === 0) {
      const existing = await pool.query(
        `SELECT *
         FROM consent_events
         WHERE principal_ref = $1
           AND purpose_id = $2
           AND idempotency_key = $3`,
        [data.principal_ref, data.purpose_id, data.idempotency_key],
      );

      if (existing.rows.length === 0) {
        return res.status(500).json({
          error: "Unable to resolve idempotency conflict",
        });
      }

      const existingEvent = existing.rows[0];

      if (
        existingEvent.event_type !== "grant" ||
        existingEvent.notice_id !== data.notice_id
      ) {
        return res.status(409).json({
          error: "Idempotency key was already used with different request data",
        });
      }

      return res.status(200).json(existingEvent);
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
  idempotency_key: z.string().min(1).max(255),
});

router.post("/withdrawals", async (req, res, next) => {
    try {
        const data = withdrawalSchema.parse(req.body);

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            await client.query(
                `SELECT pg_advisory_xact_lock(
                    hashtext($1),
                    $2
                )`,
                [
                    data.principal_ref,
                    data.purpose_id
                ]
            );

            const existingEvent = await client.query(
                `SELECT *
                 FROM consent_events
                 WHERE principal_ref = $1
                   AND purpose_id = $2
                   AND idempotency_key = $3`,
                [
                    data.principal_ref,
                    data.purpose_id,
                    data.idempotency_key
                ]
            );

            if (existingEvent.rows.length > 0) {
                const event = existingEvent.rows[0];

                if (
                    event.event_type !== "withdrawal" ||
                    event.notice_id !== data.notice_id
                ) {
                    await client.query("ROLLBACK");

                    return res.status(409).json({
                        error: "Idempotency key was already used with different request data"
                    });
                }

                await client.query("COMMIT");

                return res.status(200).json(event);
            }

            const purposeResult = await client.query(
                `SELECT purpose_id
                 FROM purposes
                 WHERE purpose_id = $1`,
                [data.purpose_id]
            );

            if (purposeResult.rows.length === 0) {
                await client.query("ROLLBACK");

                return res.status(404).json({
                    error: "Purpose not found"
                });
            }

            const noticeResult = await client.query(
                `SELECT notice_id
                 FROM notices
                 WHERE notice_id = $1
                   AND purpose_id = $2`,
                [
                    data.notice_id,
                    data.purpose_id
                ]
            );

            if (noticeResult.rows.length === 0) {
                await client.query("ROLLBACK");

                return res.status(404).json({
                    error: "Notice not found for this purpose"
                });
            }

            const consentResult = await client.query(
                `SELECT event_type
                 FROM consent_events
                 WHERE principal_ref = $1
                   AND purpose_id = $2
                 ORDER BY event_at DESC, event_id DESC
                 LIMIT 1`,
                [
                    data.principal_ref,
                    data.purpose_id
                ]
            );

            if (
                consentResult.rows.length === 0 ||
                consentResult.rows[0].event_type !== "grant"
            ) {
                await client.query("ROLLBACK");

                return res.status(409).json({
                    error: "Consent has not been granted or is already withdrawn"
                });
            }

            const result = await client.query(
                `INSERT INTO consent_events
                    (
                        principal_ref,
                        purpose_id,
                        notice_id,
                        event_type,
                        idempotency_key
                    )
                 VALUES
                    ($1, $2, $3, 'withdrawal', $4)
                 ON CONFLICT (
                    principal_ref,
                    purpose_id,
                    idempotency_key
                 )
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
                const conflict = await client.query(
                    `SELECT *
                     FROM consent_events
                     WHERE principal_ref = $1
                       AND purpose_id = $2
                       AND idempotency_key = $3`,
                    [
                        data.principal_ref,
                        data.purpose_id,
                        data.idempotency_key
                    ]
                );

                if (conflict.rows.length === 0) {
                    await client.query("ROLLBACK");

                    return res.status(500).json({
                        error: "Unable to resolve idempotency conflict"
                    });
                }

                const event = conflict.rows[0];

                if (
                    event.event_type !== "withdrawal" ||
                    event.notice_id !== data.notice_id
                ) {
                    await client.query("ROLLBACK");

                    return res.status(409).json({
                        error: "Idempotency key was already used with different request data"
                    });
                }

                await client.query("COMMIT");

                return res.status(200).json(event);
            }

            await client.query("COMMIT");

            return res.status(201).json(result.rows[0]);
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
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

        const consent = await getCurrentConsentStatus(
            principalRef,
            purposeId
        );

        res.json({
            principal_ref: principalRef,
            purpose_id: purposeId,
            status: consent.status,
            latest_event: consent.latestEvent
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
      [principalRef],
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
