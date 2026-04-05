import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { testAiConnection } from "../lib/ai-intent";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/test-ai", async (_req, res): Promise<void> => {
  const result = await testAiConnection();
  res.json(result);
});

export default router;
