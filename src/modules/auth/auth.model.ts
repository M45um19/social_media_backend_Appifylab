import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
import { IUserDocument } from "./auth.interface.js";
import { uuidv7 } from "../../utils/uuid.js";

const userSchema = new Schema<IUserDocument>(
  {
    _id: {
      type: String,
      default: () => uuidv7(),
    },
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      select: false,
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
        delete (result as any).password;
        delete (result as any)._id;
        delete (result as any).__v;
        return result;
      },
    },
  }
);

// Hash the password pre-save
userSchema.pre("save", async function (this: IUserDocument) {
  if (!this.isModified("password")) {
    return;
  }
  
  if (this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
});

export const User = mongoose.model<IUserDocument>("User", userSchema);
export default User;
