import { Router, type IRouter } from "express";
import { sql, desc } from "drizzle-orm";
import { db, commandsTable, messageLogsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/bot-stats", async (req, res): Promise<void> => {
  const [totalMsgsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messageLogsTable);

  const [commandsUsedResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messageLogsTable)
    .where(sql`command_trigger is not null`);

  const [activeCommandsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(commandsTable)
    .where(sql`is_active = true`);

  const [totalCommandsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(commandsTable);

  const topCommands = await db
    .select({ trigger: commandsTable.trigger, usageCount: commandsTable.usageCount })
    .from(commandsTable)
    .where(sql`usage_count > 0`)
    .orderBy(desc(commandsTable.usageCount))
    .limit(5);

  res.json({
    totalMessages: totalMsgsResult?.count ?? 0,
    commandsUsed: commandsUsedResult?.count ?? 0,
    activeCommands: activeCommandsResult?.count ?? 0,
    totalCommands: totalCommandsResult?.count ?? 0,
    topCommands,
  });
});

export default router;
