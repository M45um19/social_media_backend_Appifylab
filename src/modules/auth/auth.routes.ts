import { Router } from "express";
import * as authController from "./auth.controller.js";
import { validateRequest } from "../../middlewares/validation.middleware.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { registerSchema, loginSchema, logoutSchema, refreshTokenSchema } from "./auth.validation.js";

const router = Router();

router.post("/register", validateRequest(registerSchema), authController.register);
router.post("/login", validateRequest(loginSchema), authController.login);
router.post("/logout", authenticate, validateRequest(logoutSchema), authController.logout);
router.post("/refresh-token", validateRequest(refreshTokenSchema), authController.refreshToken);

export const authRouter = router;
export default authRouter;
