import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../utils/appError.js";
import { catchAsync } from "../utils/catchAsync.js";

interface IDecodedToken {
  id: string;
  email: string;
  role?: string;
}

export const authenticate = catchAsync(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Authentication token is required", 401);
    }

    const token = authHeader.split(" ")[1];

    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as IDecodedToken;

      req.user = {
        id: decoded.id,
        email: decoded.email,
      };

      next();
    } catch (err) {
      throw new AppError("Invalid or expired authentication token", 401);
    }
  }
);
