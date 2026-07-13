import { Request, Response } from "express";
import { postsService } from "./posts.service.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { IPresignedUrlResponse, IPost } from "./posts.interface.js";
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
    const result = await postsService.getFeed(req.query);

    sendResponse<{ posts: IPost[]; nextCursor: string | null }>(res, {
      statusCode: 200,
      success: true,
      message: "Global feed retrieved successfully",
      data: result,
    });
  }
);
