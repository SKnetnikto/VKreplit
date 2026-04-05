import OpenAI from "openai";
import { logger } from "./logger";

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.API_ROUTRE_AI;
  if (!apiKey) {
    throw new Error("API_ROUTRE_AI env variable not set");
  }
  // OpenRouter is OpenAI-compatible but uses a different base URL
  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://vk-bot.replit.app",
      "X-Title": "VK Community Bot",
    },
  });
}

export type BotIntent =
  | "ok_notifications"
  | "help"
  | "command_not_found"
  | "ok_login_reset";

interface IntentResult {
  intent: BotIntent;
  confidence: number;
}

const INTENT_EXAMPLES = `
ok_notifications: "сколько уведомлений", "проверь уведомления в ок", "непрочитанные в одноклассниках", "уведомления ок", "что в одноклассниках"
help: "помощь", "что умеешь", "команды", "список команд", "help", "что ты можешь"
ok_login_reset: "сброс сессии", "войди заново", "перелогинься", "сбрось ок"
command_not_found: всё остальное
`.trim();

const SYSTEM_PROMPT = `Ты определяешь намерение пользователя. Возможные намерения:
${INTENT_EXAMPLES}

Отвечай ТОЛЬКО в таком формате (без лишнего текста):
INTENT: <намерение>
CONFIDENCE: <число от 0 до 1>`;

export async function detectIntent(text: string): Promise<IntentResult> {
  const model = process.env.MODEL ?? "openai/gpt-4o-mini";

  try {
    const openai = getOpenAiClient();
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      max_tokens: 50,
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content ?? "";
    logger.debug({ raw, text }, "Raw AI intent response");

    // Parse intent and confidence from the response
    const intentMatch = raw.match(/INTENT:\s*(\S+)/i);
    const confidenceMatch = raw.match(/CONFIDENCE:\s*([\d.]+)/i);

    const intent = (intentMatch?.[1]?.toLowerCase().trim() as BotIntent) ?? "command_not_found";
    const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0;

    const validIntents: BotIntent[] = ["ok_notifications", "help", "command_not_found", "ok_login_reset"];
    const finalIntent: BotIntent = validIntents.includes(intent) ? intent : "command_not_found";

    return { intent: finalIntent, confidence };
  } catch (err) {
    logger.error({ err }, "Failed to detect intent via AI");
    return { intent: "command_not_found", confidence: 0 };
  }
}

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  try {
    const openai = getOpenAiClient();

    const ext = mimeType.includes("ogg") ? "ogg"
      : mimeType.includes("mp3") ? "mp3"
      : mimeType.includes("wav") ? "wav"
      : mimeType.includes("mp4") ? "mp4"
      : "ogg";

    const file = new File([audioBuffer], `audio.${ext}`, { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "openai/whisper-large-v3",
      language: "ru",
      response_format: "json",
    });

    return transcription.text;
  } catch (err) {
    logger.error({ err }, "Failed to transcribe audio");
    throw new Error("Не удалось расшифровать голосовое сообщение");
  }
}

// Quick connectivity test - can be called from the test endpoint
export async function testAiConnection(): Promise<{ ok: boolean; model: string; response?: string; error?: string }> {
  const model = process.env.MODEL ?? "openai/gpt-4o-mini";
  try {
    const openai = getOpenAiClient();
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Ответь одним словом: работает" }],
      max_tokens: 10,
    });
    const text = response.choices[0]?.message?.content ?? "";
    return { ok: true, model, response: text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, model, error: msg };
  }
}
