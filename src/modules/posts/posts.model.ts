import mongoose, { Schema } from "mongoose";
import { IPostDocument } from "./posts.interface.js";
import { uuidv7 } from "../../utils/uuid.js";

const postSchema = new Schema<IPostDocument>(
  {
    _id: {
      type: String,
      default: () => uuidv7(),
    },
    userId: {
      type: String,
      required: [true, "User ID is required"],
      index: true,
    },
    content: {
      type: String,
      trim: true,
    },
    mediaUrls: {
      type: [String],
      default: [],
    },
    likesCount: {
      type: Number,
      default: 0,
    },
    commentsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        const result = {
          id: ret._id?.toString(),
          ...ret,
        };
        delete (result as any)._id;
        delete (result as any).__v;
        return result;
      },
    },
  }
);

export const Post = mongoose.model<IPostDocument>("Post", postSchema);
export default Post;
