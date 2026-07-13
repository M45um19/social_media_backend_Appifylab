import mongoose, { Schema } from "mongoose";
import { ILikeDocument } from "./posts.interface.js";
import { uuidv7 } from "../../utils/uuid.js";

const likeSchema = new Schema<ILikeDocument>(
  {
    _id: {
      type: String,
      default: () => uuidv7(),
    },
    postId: {
      type: String,
      required: [true, "Post ID is required"],
      index: true,
    },
    userId: {
      type: String,
      required: [true, "User ID is required"],
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure a user can only like a post once
likeSchema.index({ postId: 1, userId: 1 }, { unique: true });

export const Like = mongoose.model<ILikeDocument>("Like", likeSchema);
export default Like;
