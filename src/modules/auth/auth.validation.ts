import { z } from "zod";

export const registerSchema = z.object({
  body: z.object({
    firstName: z.string({
      message: "First name is required",
    }).min(1, "First name cannot be empty").max(50, "First name cannot exceed 50 characters"),
    lastName: z.string({
      message: "Last name is required",
    }).min(1, "Last name cannot be empty").max(50, "Last name cannot exceed 50 characters"),
    email: z.string({
      message: "Email is required",
    }).email("Invalid email format"),
    password: z.string({
      message: "Password is required",
    }).min(6, "Password must be at least 6 characters"),
  }),
});

export type RegisterSchemaType = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  body: z.object({
    email: z.string({
      message: "Email is required",
    }).email("Invalid email format"),
    password: z.string({
      message: "Password is required",
    }).min(1, "Password cannot be empty"),
  }),
});

export type LoginSchemaType = z.infer<typeof loginSchema>;

export const logoutSchema = z.object({
  body: z.object({
    deviceId: z.string({
      message: "Device ID is required",
    }).uuid("Invalid Device ID format"),
  }),
});

export type LogoutSchemaType = z.infer<typeof logoutSchema>;

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string({
      message: "Refresh token is required",
    }),
    deviceId: z.string({
      message: "Device ID is required",
    }).uuid("Invalid Device ID format"),
  }),
});

export type RefreshTokenSchemaType = z.infer<typeof refreshTokenSchema>;
