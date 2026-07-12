import { Router } from "express";
import * as authController from "./auth.controller.js";
import { validateRequest } from "../../middlewares/validation.middleware.js";
import { registerSchema } from "./auth.validation.js";

const router = Router();

router.post("/register", validateRequest(registerSchema), authController.register);

export const authRouter = router;
export default authRouter;
