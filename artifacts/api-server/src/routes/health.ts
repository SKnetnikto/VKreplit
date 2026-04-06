import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { testAiConnection } from "../lib/ai-intent";
import { checkHealth, getDebugInfo } from "../lib/debug";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/test-ai", async (_req, res): Promise<void> => {
  const result = await testAiConnection();
  res.json(result);
});

/**
 * GET /api/health — полная проверка всех сервисов
 */
router.get("/health", async (_req, res): Promise<void> => {
  try {
    const health = await checkHealth();
    const statusCode = health.status === "error" ? 503 : health.status === "warning" ? 299 : 200;
    res.status(statusCode).json(health);
  } catch (err) {
    logger.error({ err }, "Health check failed");
    res.status(500).json({
      status: "error",
      details: { healthCheck: { status: "error", message: err instanceof Error ? err.message : String(err) } },
    });
  }
});

/**
 * GET /api/debug — полная отладочная информация (только для разработки)
 */
router.get("/debug", async (_req, res): Promise<void> => {
  try {
    const debug = await getDebugInfo();
    res.json(debug);
  } catch (err) {
    logger.error({ err }, "Debug endpoint failed");
    res.status(500).json({
      error: "Debug check failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
