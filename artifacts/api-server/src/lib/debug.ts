import { db } from "@workspace/db";
import { logger } from "./logger";
import { testAiConnection } from "./ai-intent";
import * as fs from "fs/promises";

const SESSION_FILE = "/tmp/ok_session.json";

export interface HealthStatus {
  status: "ok" | "warning" | "error";
  details: Record<string, { status: "ok" | "error" | "missing"; message?: string }>;
}

export interface DebugInfo {
  timestamp: string;
  environment: {
    nodeEnv: string;
    port: string | undefined;
    vkToken: "set" | "missing";
    vkConfirmationCode: "set" | "missing";
    vkSecret: "set" | "missing";
    apiRouteAi: "set" | "missing";
    model: string | undefined;
    phone: "set" | "missing";
    password: "set" | "missing";
  };
  services: {
    database: { status: "ok" | "error"; message?: string };
    ai: { status: "ok" | "error"; message?: string; model?: string };
    okSession: { status: "ok" | "missing"; cookiesCount?: number };
  };
  uptime: {
    seconds: number;
    formatted: string;
  };
  memory: {
    rss: string;
    heapUsed: string;
    heapTotal: string;
    external: string;
  };
}

/**
 * Проверка здоровья всех сервисов
 */
export async function checkHealth(): Promise<HealthStatus> {
  const details: Record<string, { status: "ok" | "error" | "missing"; message?: string }> = {};
  let overallStatus: "ok" | "warning" | "error" = "ok";

  // Database
  try {
    await db.execute("SELECT 1");
    details.database = { status: "ok", message: "Connected" };
  } catch (err) {
    details.database = { status: "error", message: err instanceof Error ? err.message : String(err) };
    overallStatus = "error";
  }

  // VK Token
  const vkToken = process.env.VK_TOKEN;
  if (!vkToken) {
    details.vkToken = { status: "missing", message: "VK_TOKEN not set" };
    if (overallStatus === "ok") overallStatus = "warning";
  } else {
    details.vkToken = { status: "ok" };
  }

  // VK Confirmation Code
  const vkConfirmCode = process.env.VK_CONFIRMATION_CODE;
  if (!vkConfirmCode) {
    details.vkConfirmationCode = { status: "missing", message: "VK_CONFIRMATION_CODE not set" };
    if (overallStatus === "ok") overallStatus = "warning";
  } else {
    details.vkConfirmationCode = { status: "ok" };
  }

  // AI
  const aiKey = process.env.API_ROUTRE_AI;
  if (!aiKey) {
    details.ai = { status: "missing", message: "API_ROUTRE_AI not set (AI intent detection disabled)" };
    if (overallStatus === "ok") overallStatus = "warning";
  } else {
    const aiTest = await testAiConnection();
    if (aiTest.ok) {
      details.ai = { status: "ok", message: `Model: ${aiTest.model}` };
    } else {
      details.ai = { status: "error", message: aiTest.error };
      overallStatus = "error";
    }
  }

  // OK.ru credentials
  if (!process.env.PHONE || !process.env.PASSWORD) {
    details.okRu = { status: "missing", message: "PHONE/PASSWORD not set (OK notifications disabled)" };
    if (overallStatus === "ok") overallStatus = "warning";
  } else {
    details.okRu = { status: "ok" };
  }

  return { status: overallStatus, details };
}

/**
 * Полная отладочная информация
 */
export async function getDebugInfo(): Promise<DebugInfo> {
  // Database
  let dbStatus: { status: "ok" | "error"; message?: string } = { status: "error" };
  try {
    await db.execute("SELECT 1");
    dbStatus = { status: "ok" };
  } catch (err) {
    dbStatus = { status: "error", message: err instanceof Error ? err.message : String(err) };
    logger.error({ err }, "Debug: database connection check failed");
  }

  // AI
  let aiStatus: { status: "ok" | "error"; message?: string; model?: string } = { status: "error" };
  const aiKey = process.env.API_ROUTRE_AI;
  if (aiKey) {
    const aiTest = await testAiConnection();
    aiStatus = {
      status: aiTest.ok ? "ok" : "error",
      message: aiTest.ok ? aiTest.response : aiTest.error,
      model: aiTest.model,
    };
  } else {
    aiStatus = { status: "error", message: "API_ROUTRE_AI not set" };
  }

  // OK Session
  let okSessionStatus: { status: "ok" | "missing"; cookiesCount?: number } = { status: "missing" };
  try {
    const raw = await fs.readFile(SESSION_FILE, "utf-8");
    const cookies = JSON.parse(raw);
    if (Array.isArray(cookies) && cookies.length > 0) {
      const now = Math.floor(Date.now() / 1000);
      const valid = cookies.filter((c: any) => !c.expires || c.expires === -1 || c.expires > now);
      okSessionStatus = { status: "ok", cookiesCount: valid.length };
    }
  } catch {
    okSessionStatus = { status: "missing" };
  }

  // Uptime
  const uptimeSeconds = process.uptime();
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);

  // Memory
  const mem = process.memoryUsage();
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return {
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV || "not set",
      port: process.env.PORT,
      vkToken: process.env.VK_TOKEN ? "set" : "missing",
      vkConfirmationCode: process.env.VK_CONFIRMATION_CODE ? "set" : "missing",
      vkSecret: process.env.VK_SECRET ? "set" : "missing",
      apiRouteAi: aiKey ? "set" : "missing",
      model: process.env.MODEL,
      phone: process.env.PHONE ? "set" : "missing",
      password: process.env.PASSWORD ? "set" : "missing",
    },
    services: {
      database: dbStatus,
      ai: aiStatus,
      okSession: okSessionStatus,
    },
    uptime: {
      seconds: Math.floor(uptimeSeconds),
      formatted: `${hours}h ${minutes}m ${seconds}s`,
    },
    memory: {
      rss: formatBytes(mem.rss),
      heapUsed: formatBytes(mem.heapUsed),
      heapTotal: formatBytes(mem.heapTotal),
      external: formatBytes(mem.external),
    },
  };
}
