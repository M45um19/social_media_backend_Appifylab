import { Post } from "./posts.model.js";
import { IPostDocument } from "./posts.interface.js";

export class PostsRepository {
  public async create(input: {
    userId: string;
    content?: string;
    mediaUrls?: string[];
  }): Promise<IPostDocument> {
    return await Post.create(input);
  }

  public async findById(id: string): Promise<IPostDocument | null> {
    return await Post.findById(id);
  }

  public async findByIds(ids: string[]): Promise<IPostDocument[]> {
    return await Post.find({ _id: { $in: ids } });
  }
}

export const postsRepository = new PostsRepository();
export default postsRepository;
