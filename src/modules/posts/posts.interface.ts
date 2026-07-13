import { Document } from "mongoose";

export interface IPostUser {
  firstName: string;
  lastName: string;
  profilePicture?: string;
}

export interface IPost {
  id: string;
  userId: string;
  content?: string;
  mediaUrls?: string[];
  likesCount: number;
  commentsCount: number;
  createdAt: Date;
  updatedAt: Date;
  user?: IPostUser;
}

export interface IPostDocument extends Document<string> {
  _id: string;
  userId: string;
  content?: string;
  mediaUrls?: string[];
  likesCount: number;
  commentsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreatePostInput {
  content?: string;
  mediaUrls?: string[];
}

export interface IGetPostsQuery {
  limit?: string | number;
  cursor?: string;
}

export interface IPresignedUrlInput {
  resourceType: "image" | "video";
  size: number;
  format: string;
}

export interface IPresignedUrlResponse {
  signature: string;
  timestamp: number;
  folder: string;
  publicId: string;
  resourceType: "image" | "video";
  apiKey: string;
  cloudName: string;
}
