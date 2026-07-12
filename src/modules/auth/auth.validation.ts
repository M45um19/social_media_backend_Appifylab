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
