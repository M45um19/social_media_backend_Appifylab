import { Request, Response } from "express";
import { authService } from "./auth.service.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { IAuthResponse } from "./auth.interface.js";

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
