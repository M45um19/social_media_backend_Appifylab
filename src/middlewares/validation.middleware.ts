import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { catchAsync } from "../utils/catchAsync.js";

export const validateRequest = (schema: z.ZodObject<any>) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const validated = await schema.parseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (validated.body !== undefined) {
      req.body = validated.body;
    }
    if (validated.query !== undefined) {
      Object.assign(req.query, validated.query);
    }
    if (validated.params !== undefined) {
      Object.assign(req.params, validated.params);
    }

    next();
  });
};
