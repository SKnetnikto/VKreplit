import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, messageLogsTable } from "@workspace/db";
import { ListMessageLogsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/message-logs", async (req, res): Promise<void> => {
  const parsed = ListMessageLogsQueryParams.safeParse(req.query);
  const limit = parsed.success && parsed.data.limit ? parsed.data.limit : 50;

  const logs = await db
    .select()
    .from(messageLogsTable)
    .orderBy(desc(messageLogsTable.createdAt))
    .limit(limit);

  res.json(logs);
});

export default router;
