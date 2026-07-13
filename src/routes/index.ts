import { Router } from "express";
import { authRouter } from "../modules/auth/auth.routes.js";
import { postsRouter } from "../modules/posts/posts.routes.js";

const router = Router();

router.use("/auth", authRouter);
router.use("/posts", postsRouter);

export default router;
