import { Router } from "express";
import { z } from "zod";
import type { Database } from "../../db/database.js";
import { authenticate } from "../auth/session.js";
import { writeSchema } from "./schema.js";
import { getState, saveState } from "./repository.js";
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
  router.patch("/privacy", async (req, res) => {
    const input = z
      .object({
        revision: z.number().int().min(0).max(2147483646),
        privacy: z.object({
          cycle: z.boolean(),
          mood: z.boolean(),
          notes: z.boolean(),
        }),
      })
      .parse(req.body);
    const current = await getState(db, req.user!.id);
    const state = { ...current.state, privacy: input.privacy };
    const result = await saveState(db, req.user!.id, state, input.revision);
    res.json({ state, revision: result.revision });
  });
  return router;
}
