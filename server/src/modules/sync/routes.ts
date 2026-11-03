import { Router } from "express";
import { z } from "zod";
import type { Database } from "../../db/database.js";
import { authenticate } from "../auth/session.js";
import { writeSchema, dateSchema } from "./schema.js";
import { getState, saveState } from "./repository.js";
import { recordIntimacy } from "./intimacy.js";
import { sharedDetails, sharedSummary } from "../connections/service.js";
// @ts-ignore Shared timezone helper.
import { vietnamDay } from "../../../../shared/dates.js";
export function syncRoutes(db: Database) {
  const router = Router();
  router.use(authenticate(db));
  router.get("/", async (req, res) =>
    res.json(await getState(db, req.user!.id)),
  );
  router.put("/", async (req, res) => {
    const input = writeSchema.parse(req.body);
    res.json(await saveState(db, req.user!.id, input.state, input.revision));
  });
  router.get("/preview", async (req, res) => {
    const month = z
      .string()
      .regex(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/)
      .parse(req.query.month);
    const current = await getState(db, req.user!.id);
    const today = vietnamDay();
    res.json({
      shared: sharedDetails(current.state, today, month, current.revision),
      summary: sharedSummary(current.state, today),
      revision: current.revision,
      today,
    });
  });
  router.patch("/privacy", async (req, res) => {
    const input = z
      .object({
        revision: z.number().int().min(0).max(2147483646),
        privacy: z.object({
          cycle: z.boolean(),
          mood: z.boolean(),
          notes: z.boolean(),
          symptoms: z.boolean().optional(),
          paused: z.boolean().optional(),
          intimacy: z.boolean().optional(),
          intimacyEdit: z.boolean().optional(),
        }),
        hideExistingJournals: z.boolean().default(false),
      })
      .refine(
        (input) => !input.hideExistingJournals || !input.privacy.notes,
        "Chỉ ẩn nhật ký cũ khi tắt chia sẻ mặc định.",
      )
      .parse(req.body);
    const current = await getState(db, req.user!.id);
    const state = {
      ...current.state,
      privacy: { ...current.state.privacy, ...input.privacy },
      entries: input.hideExistingJournals
        ? Object.fromEntries(
            Object.entries(current.state.entries).map(([date, entry]) => [
              date,
              { ...entry, shared: false },
            ]),
          )
        : current.state.entries,
    };
    const result = await saveState(db, req.user!.id, state, input.revision, {
      allowPause: true,
    });
    res.json({
      state: {
        ...state,
        privacy: { ...state.privacy, ...result.intimacyPermissions },
        forecasts: result.forecasts,
      },
      revision: result.revision,
    });
  });
  router.patch("/intimacy/:date", async (req, res) => {
    const date = dateSchema.parse(req.params.date);
    const input = z
      .object({
        revision: z.number().int().min(0).max(2147483646),
        recorded: z.boolean(),
      })
      .parse(req.body);
    await recordIntimacy(
      db,
      req.user!.id,
      date,
      input.recorded,
      input.revision,
    );
    res.json(await getState(db, req.user!.id));
  });
  router.patch("/entries/:date/sharing", async (req, res) => {
    const date = dateSchema.parse(req.params.date);
    const input = z
      .object({ revision: z.number().int().min(0), shared: z.boolean() })
      .parse(req.body);
    const current = await getState(db, req.user!.id);
    if (!current.state.entries[date])
      return void res.status(404).json({
        error: { code: "NOT_FOUND", message: "Không tìm thấy nhật ký." },
      });
    const state = {
      ...current.state,
      entries: {
        ...current.state.entries,
        [date]: { ...current.state.entries[date], shared: input.shared },
      },
    };
    const result = await saveState(db, req.user!.id, state, input.revision);
    res.json({
      state: { ...state, forecasts: result.forecasts },
      revision: result.revision,
    });
  });
  return router;
}
