import { Router, type IRouter } from "express";
import healthRouter from "./health";
import commandsRouter from "./commands";
import botSettingsRouter from "./bot-settings";
import botStatsRouter from "./bot-stats";
import messageLogsRouter from "./message-logs";
import vkCallbackRouter from "./vk-callback";

const router: IRouter = Router();

router.use(healthRouter);
router.use(commandsRouter);
router.use(botSettingsRouter);
router.use(botStatsRouter);
router.use(messageLogsRouter);
router.use(vkCallbackRouter);

export default router;
