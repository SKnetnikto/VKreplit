import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { checkHealth } from "./lib/debug";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer() {
  // Check database connection before starting
  logger.info("Checking database connection...");
  try {
    await db.execute("SELECT 1");
    logger.info("Database connection OK");
  } catch (err) {
    logger.error(
      { err },
      "Database connection failed! Server will not start properly."
    );
    logger.error("Make sure DATABASE_URL environment variable is set correctly");
    process.exit(1);
  }

  // Log startup info
  logger.info(
    {
      nodeEnv: process.env.NODE_ENV || "not set",
      nodeVersion: process.version,
      pid: process.pid,
    },
    "Starting server..."
  );

  // Log environment status (without sensitive values)
  logger.info(
    {
      VK_TOKEN: process.env.VK_TOKEN ? "set" : "MISSING",
      VK_CONFIRMATION_CODE: process.env.VK_CONFIRMATION_CODE ? "set" : "MISSING",
      VK_SECRET: process.env.VK_SECRET ? "set" : "not set",
      API_ROUTRE_AI: process.env.API_ROUTRE_AI ? "set" : "MISSING",
      MODEL: process.env.MODEL || "not set (will use default)",
      PHONE: process.env.PHONE ? "set" : "MISSING",
      LOG_LEVEL: process.env.LOG_LEVEL || "info",
    },
    "Environment variables status"
  );

  // Quick health check
  const health = await checkHealth();
  if (health.status === "error") {
    logger.warn({ details: health.details }, "Some services are not healthy");
  } else if (health.status === "warning") {
    logger.info({ details: health.details }, "Some services have warnings");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    logger.info(`Health check: GET /api/health`);
    logger.info(`Debug info: GET /api/debug`);
  });
}

startServer().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
