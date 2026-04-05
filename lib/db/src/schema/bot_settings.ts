import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botSettingsTable = pgTable("bot_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBotSettingSchema = createInsertSchema(botSettingsTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertBotSetting = z.infer<typeof insertBotSettingSchema>;
export type BotSetting = typeof botSettingsTable.$inferSelect;
