import { Router } from "express";
import * as postsController from "./posts.controller.js";
import { validateRequest } from "../../middlewares/validation.middleware.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import {
  presignedUrlSchema,
  createPostSchema,
  getPostsSchema,
  addCommentSchema,
} from "./posts.validation.js";

const router = Router();

// Endpoint: Generate upload signature for a single file
router.post(
  "/presigned-url",
  authenticate,
  validateRequest(presignedUrlSchema),
  postsController.generatePresignedUrl
);

// Endpoint: Create a new post
router.post(
  "/",
  authenticate,
  validateRequest(createPostSchema),
  postsController.createPost
);

// Endpoint: Toggle like status on a post
router.post(
  "/:postId/like",
  authenticate,
  postsController.toggleLike
);

// Endpoint: Add comment or reply to a post
router.post(
  "/:postId/comments",
  authenticate,
  validateRequest(addCommentSchema),
  postsController.addComment
);

// Endpoint: Retrieve the paginated global feed
router.get(
  "/",
  validateRequest(getPostsSchema),
  postsController.getFeed
);

export const postsRouter = router;
export default postsRouter;
