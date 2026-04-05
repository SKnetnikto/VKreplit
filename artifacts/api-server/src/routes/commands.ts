import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, commandsTable } from "@workspace/db";
import {
  CreateCommandBody,
  UpdateCommandBody,
  GetCommandParams,
  UpdateCommandParams,
  DeleteCommandParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/commands", async (req, res): Promise<void> => {
  const commands = await db
    .select()
    .from(commandsTable)
    .orderBy(desc(commandsTable.createdAt));
  res.json(commands);
});

router.post("/commands", async (req, res): Promise<void> => {
  const parsed = CreateCommandBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [command] = await db
    .insert(commandsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(command);
});

router.get("/commands/:id", async (req, res): Promise<void> => {
  const params = GetCommandParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [command] = await db
    .select()
    .from(commandsTable)
    .where(eq(commandsTable.id, params.data.id));

  if (!command) {
    res.status(404).json({ error: "Command not found" });
    return;
  }

  res.json(command);
});

router.patch("/commands/:id", async (req, res): Promise<void> => {
  const params = UpdateCommandParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCommandBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [command] = await db
    .update(commandsTable)
    .set(parsed.data)
    .where(eq(commandsTable.id, params.data.id))
    .returning();

  if (!command) {
    res.status(404).json({ error: "Command not found" });
    return;
  }

  res.json(command);
});

router.delete("/commands/:id", async (req, res): Promise<void> => {
  const params = DeleteCommandParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [command] = await db
    .delete(commandsTable)
    .where(eq(commandsTable.id, params.data.id))
    .returning();

  if (!command) {
    res.status(404).json({ error: "Command not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
