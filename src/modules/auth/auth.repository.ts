import { User } from "./auth.model.js";
import { IRegisterInput, IUserDocument } from "./auth.interface.js";

export class AuthRepository {
  public async create(input: IRegisterInput): Promise<IUserDocument> {
    return await User.create(input);
  }

  public async findByEmail(email: string): Promise<IUserDocument | null> {
    return await User.findOne({ email: email.toLowerCase() });
  }

  public async findByEmailWithPassword(email: string): Promise<IUserDocument | null> {
    return await User.findOne({ email: email.toLowerCase() }).select("+password");
  }

  public async findById(id: string): Promise<IUserDocument | null> {
    return await User.findById(id);
  }

  public async findByIds(ids: string[]): Promise<IUserDocument[]> {
    return await User.find({ _id: { $in: ids } });
  }
}

export const authRepository = new AuthRepository();
export default authRepository;
