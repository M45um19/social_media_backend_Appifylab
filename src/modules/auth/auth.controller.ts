import { Request, Response } from "express";
import { authService } from "./auth.service.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { IAuthResponse } from "./auth.interface.js";
import { AppError } from "../../utils/appError.js";

export const register = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const deviceInfo = {
    userAgent: req.headers["user-agent"],
    ip: req.ip || req.socket.remoteAddress,
  };

  const result: IAuthResponse = await authService.register(req.body, deviceInfo);
  
  sendResponse<IAuthResponse>(res, {
    statusCode: 201,
    success: true,
    message: "User registered successfully",
    data: result,
  });
});

export const login = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const deviceInfo = {
    userAgent: req.headers["user-agent"],
    ip: req.ip || req.socket.remoteAddress,
  };

  const result: IAuthResponse = await authService.login(req.body, deviceInfo);

  sendResponse<IAuthResponse>(res, {
    statusCode: 200,
    success: true,
    message: "User logged in successfully",
    data: result,
  });
});

export const logout = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const deviceId = req.body.deviceId || req.headers["x-device-id"];
  
  if (!deviceId) {
    throw new AppError("Device ID is required", 400);
  }

  const userId = req.user?.id;
  if (!userId) {
    throw new AppError("Unauthorized", 401);
  }

  await authService.logout(userId, deviceId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Logged out successfully",
  });
});

export const refreshToken = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const deviceInfo = {
    userAgent: req.headers["user-agent"],
    ip: req.ip || req.socket.remoteAddress,
  };

  const result = await authService.refreshToken(req.body, deviceInfo);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Tokens refreshed successfully",
    data: result,
  });
});
