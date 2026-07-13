import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { postsService } from "./posts.service.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { IPresignedUrlResponse, IPost, IComment } from "./posts.interface.js";
import { AppError } from "../../utils/appError.js";

/**
 * Generates signature for a signed upload to Cloudinary.
 */
export const generatePresignedUrl = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const result: IPresignedUrlResponse = await postsService.generatePresignedUrl(
      req.body
    );

    sendResponse<IPresignedUrlResponse>(res, {
      statusCode: 200,
      success: true,
      message: "Cloudinary upload signature generated successfully",
      data: result,
    });
  }
);

/**
 * Handles creation of a new post.
 */
export const createPost = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("Unauthorized", 401);
    }

    const result: IPost = await postsService.createPost(userId, req.body);

    sendResponse<IPost>(res, {
      statusCode: 201,
      success: true,
      message: "Post created successfully",
      data: result,
    });
  }
);

/**
 * Handles fetching the paginated global feed.
 */
export const getFeed = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    let requestingUserId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as { id: string };
        requestingUserId = decoded.id;
      } catch {
        // Ignore invalid tokens for public feed access
      }
    }

    const result = await postsService.getFeed(req.query, requestingUserId);

    sendResponse<{ posts: IPost[]; nextCursor: string | null }>(res, {
      statusCode: 200,
      success: true,
      message: "Global feed retrieved successfully",
      data: result,
    });
  }
);

/**
 * Handles toggling a post like for the authenticated user.
 */
export const toggleLike = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("Unauthorized", 401);
    }
    const postId = req.params.postId as string;
    const result = await postsService.toggleLike(postId, userId, req.user?.firstName, req.user?.lastName);

    sendResponse<{ liked: boolean }>(res, {
      statusCode: 200,
      success: true,
      message: result.liked ? "Post liked successfully" : "Post unliked successfully",
      data: result,
    });
  }
);

/**
 * Handles adding a comment/reply to a post.
 */
export const addComment = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("Unauthorized", 401);
    }
    const postId = req.params.postId as string;
    const result = await postsService.addComment(postId, userId, req.body, req.user?.firstName, req.user?.lastName);

    sendResponse<IComment>(res, {
      statusCode: 201,
      success: true,
      message: "Comment added successfully",
      data: result,
    });
  }
);
