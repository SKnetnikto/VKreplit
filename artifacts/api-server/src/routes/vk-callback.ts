import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, commandsTable, messageLogsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { getSettings } from "./bot-settings";
import { detectIntent } from "../lib/ai-intent";
import { transcribeAudio } from "../lib/ai-intent";
import { getOkUnreadNotifications, clearOkSession } from "../lib/ok-parser";

const router: IRouter = Router();

async function sendVkMessage(userId: number, message: string, groupToken: string): Promise<void> {
  const randomId = Math.floor(Math.random() * 2147483647);
  const params = new URLSearchParams({
    user_id: String(userId),
    message,
    random_id: String(randomId),
    access_token: groupToken,
    v: "5.131",
  });

  const response = await fetch(`https://api.vk.com/method/messages.send?${params.toString()}`, {
    method: "POST",
  });

  const data = await response.json() as { error?: { error_msg: string } };
  if (data.error) {
    logger.error({ error: data.error.error_msg }, "VK API error sending message");
  }
}

async function getVkAudioMessage(
  attachments: Array<{
    type: string;
    audio_message?: { link_mp3?: string; link_ogg?: string };
    doc?: { url?: string; ext?: string };
  }>,
  groupToken: string
): Promise<Buffer | null> {
  for (const att of attachments) {
    let audioUrl: string | null = null;

    if (att.type === "audio_message" && att.audio_message) {
      audioUrl = att.audio_message.link_ogg ?? att.audio_message.link_mp3 ?? null;
    } else if (att.type === "doc" && att.doc) {
      const ext = att.doc.ext?.toLowerCase();
      if (ext === "ogg" || ext === "mp3" || ext === "wav") {
        audioUrl = att.doc.url ?? null;
      }
    }

    if (audioUrl) {
      const resp = await fetch(audioUrl, {
        headers: { Authorization: `Bearer ${groupToken}` },
      });
      const arrBuf = await resp.arrayBuffer();
      return Buffer.from(arrBuf);
    }
  }
  return null;
}

async function buildHelpText(settings: Record<string, string>): Promise<string> {
  const commands = await db
    .select()
    .from(commandsTable)
    .where(eq(commandsTable.isActive, true));

  const builtInCommands = [
    `• help — список всех команд`,
    `• ок уведомления — количество непрочитанных уведомлений в Одноклассниках`,
    `• ок сессия сброс — сбросить сохранённую сессию ОК`,
  ];

  const customCommands = commands.map(
    (c) => `• ${settings.commandPrefix}${c.trigger}${c.description ? ` — ${c.description}` : ""}`
  );

  const allCommands = [...builtInCommands, ...customCommands];
  return `Доступные команды:\n${allCommands.join("\n")}\n\nМожно также писать свободным текстом — я пойму что вам нужно.`;
}

async function findCommand(
  text: string,
  prefix: string
): Promise<{ trigger: string; response: string; id: number } | null> {
  const normalized = text.toLowerCase().trim();
  const withoutPrefix = prefix
    ? normalized.replace(new RegExp(`^${prefix.toLowerCase()}`), "").trim()
    : normalized;

  const commands = await db
    .select()
    .from(commandsTable)
    .where(eq(commandsTable.isActive, true));

  for (const cmd of commands) {
    if (
      withoutPrefix === cmd.trigger.toLowerCase() ||
      normalized === cmd.trigger.toLowerCase()
    ) {
      return cmd;
    }
  }
  return null;
}

async function handleTextMessage(
  text: string,
  userId: number,
  vkToken: string,
  settings: Record<string, string>
): Promise<{ responseSent: string; commandTrigger: string | null }> {
  const normalized = text.toLowerCase().trim();

  // 1. Hard-coded command check first (fastest, no DB/AI needed)
  if (normalized === "help" || normalized === "/help" || normalized === "помощь" || normalized === "/помощь") {
    const helpText = await buildHelpText(settings);
    await sendVkMessage(userId, helpText, vkToken);
    return { responseSent: helpText, commandTrigger: "help" };
  }

  if (normalized === "ок уведомления" || normalized === "ok уведомления") {
    return await handleOkNotifications(userId, vkToken);
  }

  if (normalized === "ок сессия сброс" || normalized === "ok сессия сброс") {
    await clearOkSession();
    const msg = "Сессия Одноклассников сброшена. При следующем запросе произойдёт повторная авторизация.";
    await sendVkMessage(userId, msg, vkToken);
    return { responseSent: msg, commandTrigger: "ок сессия сброс" };
  }

  // 2. Check custom DB commands
  const command = await findCommand(text, settings.commandPrefix);
  if (command) {
    await db
      .update(commandsTable)
      .set({ usageCount: sql`usage_count + 1` })
      .where(eq(commandsTable.id, command.id));
    await sendVkMessage(userId, command.response, vkToken);
    return { responseSent: command.response, commandTrigger: command.trigger };
  }

  // 3. AI intent detection for free-form text
  const hasAiKey = !!process.env.API_ROUTRE_AI;
  if (hasAiKey) {
    const { intent, confidence } = await detectIntent(text);
    logger.info({ intent, confidence, text }, "AI intent detected");

    if (confidence >= 0.6) {
      if (intent === "ok_notifications") {
        return await handleOkNotifications(userId, vkToken);
      }
      if (intent === "help") {
        const helpText = await buildHelpText(settings);
        await sendVkMessage(userId, helpText, vkToken);
        return { responseSent: helpText, commandTrigger: "help" };
      }
      if (intent === "ok_login_reset") {
        await clearOkSession();
        const msg = "Сессия Одноклассников сброшена.";
        await sendVkMessage(userId, msg, vkToken);
        return { responseSent: msg, commandTrigger: "ок сессия сброс" };
      }
    }
  }

  // 4. Unknown
  await sendVkMessage(userId, settings.unknownCommandMessage, vkToken);
  return { responseSent: settings.unknownCommandMessage, commandTrigger: null };
}

async function handleOkNotifications(
  userId: number,
  vkToken: string
): Promise<{ responseSent: string; commandTrigger: string }> {
  const loadingMsg = "Проверяю уведомления в Одноклассниках... Подождите несколько секунд.";
  await sendVkMessage(userId, loadingMsg, vkToken);

  try {
    const data = await getOkUnreadNotifications();
    const msg =
      data.unreadCount === 0
        ? "В Одноклассниках нет непрочитанных уведомлений."
        : `В Одноклассниках ${data.unreadCount} непрочитанных уведомлений.`;
    await sendVkMessage(userId, msg, vkToken);
    return { responseSent: msg, commandTrigger: "ок уведомления" };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Неизвестная ошибка";
    const reply = `Не удалось получить уведомления: ${errMsg}`;
    await sendVkMessage(userId, reply, vkToken);
    return { responseSent: reply, commandTrigger: "ок уведомления" };
  }
}

router.post("/vk/callback", async (req, res): Promise<void> => {
  const event = req.body as {
    type: string;
    object?: {
      message?: {
        from_id?: number;
        text?: string;
        peer_id?: number;
        attachments?: Array<{
          type: string;
          audio_message?: { link_mp3?: string; link_ogg?: string };
          doc?: { url?: string; ext?: string };
        }>;
      };
    };
    group_id?: number;
    secret?: string;
  };

  const vkToken = process.env.VK_TOKEN;
  const vkConfirmCode = process.env.VK_CONFIRMATION_CODE;
  const vkSecret = process.env.VK_SECRET;

  if (vkSecret && event.secret !== vkSecret) {
    req.log.warn("VK callback: invalid secret");
    res.status(403).send("forbidden");
    return;
  }

  if (event.type === "confirmation") {
    if (!vkConfirmCode) {
      req.log.error("VK_CONFIRMATION_CODE is not set");
      res.status(500).send("ok");
      return;
    }
    res.send(vkConfirmCode);
    return;
  }

  // Respond immediately so VK doesn't retry
  res.send("ok");

  if (event.type !== "message_new") return;

  const msg = event.object?.message;
  if (!msg || !msg.from_id) return;

  if (!vkToken) {
    logger.warn("VK_TOKEN is not set, cannot respond");
    return;
  }

  const settings = await getSettings();
  if (settings.isActive !== "true") return;

  const userId = msg.from_id;
  let text = msg.text ?? "";
  const attachments = msg.attachments ?? [];

  // Handle voice message: transcribe first
  if (!text && attachments.length > 0) {
    const hasVoice = attachments.some(
      (a) => a.type === "audio_message" || (a.type === "doc" && ["ogg", "mp3", "wav"].includes(a.doc?.ext?.toLowerCase() ?? ""))
    );

    if (hasVoice) {
      const audioBuffer = await getVkAudioMessage(attachments, vkToken);
      if (audioBuffer) {
        try {
          text = await transcribeAudio(audioBuffer, "audio/ogg");
          logger.info({ text, userId }, "Voice message transcribed");
          // Send transcription back so user knows what was understood
          await sendVkMessage(userId, `Голосовое: "${text}"`, vkToken);
        } catch (err) {
          logger.error({ err }, "Voice transcription failed");
          await sendVkMessage(userId, "Не удалось расшифровать голосовое сообщение. Попробуй написать текстом.", vkToken);
          return;
        }
      }
    }
  }

  if (!text) return;

  const { responseSent, commandTrigger } = await handleTextMessage(text, userId, vkToken, settings);

  await db.insert(messageLogsTable).values({
    userId: String(userId),
    message: text,
    commandTrigger,
    responseSent,
  });
});

export default router;
