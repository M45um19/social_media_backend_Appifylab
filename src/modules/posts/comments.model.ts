import mongoose, { Schema } from "mongoose";
import { ICommentDocument } from "./posts.interface.js";
import { uuidv7 } from "../../utils/uuid.js";

const commentSchema = new Schema<ICommentDocument>(
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
    content: {
      type: String,
      required: [true, "Comment content is required"],
      trim: true,
    },
    parentId: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Comment = mongoose.model<ICommentDocument>("Comment", commentSchema);
export default Comment;
