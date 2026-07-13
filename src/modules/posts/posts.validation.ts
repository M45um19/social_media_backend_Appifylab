import { z } from "zod";

export const presignedUrlSchema = z.object({
  body: z.object({
    resourceType: z.enum(["image", "video"] as const, {
      message: "resourceType is required and must be either 'image' or 'video'",
    }),
    size: z.number({
      message: "size in bytes is required",
    }).positive("size must be positive"),
    format: z.string({
      message: "format is required",
    }),
  })
  .refine((data) => {
    const format = data.format.toLowerCase();
    if (data.resourceType === "image") {
      return ["jpeg", "jpg", "png", "webp"].includes(format);
    }
    if (data.resourceType === "video") {
      return ["mp4", "mkv"].includes(format);
    }
    return false;
  }, {
    message: "Invalid file format. Allowed formats: image: jpeg, jpg, png, webp; video: mp4, mkv",
    path: ["format"]
  })
  .refine((data) => {
    if (data.resourceType === "image") {
      return data.size <= 10 * 1024 * 1024; // 10MB
    }
    if (data.resourceType === "video") {
      return data.size <= 50 * 1024 * 1024; // 50MB
    }
    return false;
  }, {
    message: "File size exceeds limit. Max 10MB for images, 50MB for videos",
    path: ["size"]
  }),
});

export type PresignedUrlSchemaType = z.infer<typeof presignedUrlSchema>;

export const createPostSchema = z.object({
  body: z.object({
    content: z.string().max(1000, "Content cannot exceed 1000 characters").optional(),
    mediaUrls: z.array(z.string().url("Invalid media URL")).optional(),
  })
  .refine((data) => {
    const hasContent = data.content && data.content.trim().length > 0;
    const hasMedia = data.mediaUrls && data.mediaUrls.length > 0;
    return hasContent || hasMedia;
  }, {
    message: "Post must contain either text content or at least one media URL",
    path: ["content"]
  }),
});

export type CreatePostSchemaType = z.infer<typeof createPostSchema>;

export const getPostsSchema = z.object({
  query: z.object({
    limit: z.preprocess(
      (val) => (val ? Number(val) : undefined),
      z.number().int().positive().max(100).optional()
    ),
    cursor: z.string().optional(),
  }),
});

export type GetPostsSchemaType = z.infer<typeof getPostsSchema>;

export const addCommentSchema = z.object({
  body: z.object({
    content: z.string({
      message: "Comment content is required",
    })
      .trim()
      .min(1, "Comment content cannot be empty")
      .max(1000, "Comment content cannot exceed 1000 characters"),
    parentId: z.string().optional(),
  }),
});

export type AddCommentSchemaType = z.infer<typeof addCommentSchema>;
