import { Router, type IRouter } from "express";
import healthRouter from "./health";
import menuRouter from "./menu";
import ttsRouter from "./tts";
import chatRouter from "./chat";
import geminiRouter from "./gemini";
import historyRouter from "./history";
import riskRouter from "./risk";

const router: IRouter = Router();

router.use(healthRouter);
router.use(menuRouter);
router.use(ttsRouter);
router.use(chatRouter);
router.use(geminiRouter);
router.use(historyRouter);
router.use(riskRouter);

export default router;
