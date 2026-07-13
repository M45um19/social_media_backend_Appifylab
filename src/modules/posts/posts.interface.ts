import { Document } from "mongoose";

export interface IPostUser {
  firstName: string;
  lastName: string;
  profilePicture?: string;
}

export interface IPostLiker {
  id: string;
  name: string;
  pic?: string;
}

export interface IPostRecentComment {
  userId: string;
  firstName: string;
  lastName: string;
  profilePicture?: string;
  text: string;
  reply?: {
    userId: string;
    firstName: string;
    lastName: string;
    profilePicture?: string;
    text: string;
  } | null;
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
  recentLikers?: IPostLiker[];
  recentComment?: IPostRecentComment | null;
  isLiked?: boolean;
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

export interface ILike {
  id: string;
  postId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILikeDocument extends Document<string> {
  _id: string;
  postId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IComment {
  id: string;
  postId: string;
  userId: string;
  content: string;
  parentId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICommentDocument extends Document<string> {
  _id: string;
  postId: string;
  userId: string;
  content: string;
  parentId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateCommentInput {
  content: string;
  parentId?: string;
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
