import { Response } from "express";

export const sendResponse = <T>(
  res: Response,
  payload: {
    statusCode: number;
    success: boolean;
    message: string;
    data?: T;
  }
): void => {
  res.status(payload.statusCode).json({
    success: payload.success,
    statusCode: payload.statusCode,
    message: payload.message,
    data: payload.data,
  });
};
