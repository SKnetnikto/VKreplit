import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, botSettingsTable } from "@workspace/db";
import { UpdateBotSettingsBody } from "@workspace/api-zod";

const SETTINGS_KEYS = [
  "communityName",
  "welcomeMessage",
  "unknownCommandMessage",
  "commandPrefix",
  "isActive",
] as const;

type SettingsKey = (typeof SETTINGS_KEYS)[number];

const DEFAULT_SETTINGS: Record<SettingsKey, string> = {
  communityName: "Моё сообщество",
  welcomeMessage: "Добро пожаловать! Напишите 'помощь' для списка команд.",
  unknownCommandMessage: "Неизвестная команда. Напишите 'помощь' для списка доступных команд.",
  commandPrefix: "",
  isActive: "true",
};

async function getSettings(): Promise<Record<SettingsKey, string>> {
  const rows = await db.select().from(botSettingsTable);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  const result: Record<string, string> = {};
  for (const key of SETTINGS_KEYS) {
    result[key] = map[key] ?? DEFAULT_SETTINGS[key];
  }

  return result as Record<SettingsKey, string>;
}

const router: IRouter = Router();

router.get("/bot-settings", async (req, res): Promise<void> => {
  const settings = await getSettings();
  res.json({
    communityName: settings.communityName,
    welcomeMessage: settings.welcomeMessage,
    unknownCommandMessage: settings.unknownCommandMessage,
    commandPrefix: settings.commandPrefix,
    isActive: settings.isActive === "true",
  });
});

router.put("/bot-settings", async (req, res): Promise<void> => {
  const parsed = UpdateBotSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, string> = {
    communityName: parsed.data.communityName,
    welcomeMessage: parsed.data.welcomeMessage,
    unknownCommandMessage: parsed.data.unknownCommandMessage,
    commandPrefix: parsed.data.commandPrefix,
    isActive: parsed.data.isActive ? "true" : "false",
  };

  for (const [key, value] of Object.entries(updates)) {
    await db
      .insert(botSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: botSettingsTable.key, set: { value } });
  }

  const settings = await getSettings();
  res.json({
    communityName: settings.communityName,
    welcomeMessage: settings.welcomeMessage,
    unknownCommandMessage: settings.unknownCommandMessage,
    commandPrefix: settings.commandPrefix,
    isActive: settings.isActive === "true",
  });
});

export default router;
export { getSettings };
