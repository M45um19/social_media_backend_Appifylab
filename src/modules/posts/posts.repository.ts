import { Post } from "./posts.model.js";
import { Like } from "./likes.model.js";
import { Comment } from "./comments.model.js";
import { IPostDocument, ILikeDocument, ICommentDocument } from "./posts.interface.js";

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

  public async exists(id: string): Promise<boolean> {
    const doc = await Post.findOne({ _id: id }).select("_id");
    return doc !== null;
  }

  // --- Likes Repository Methods ---

  public async hasUserLiked(postId: string, userId: string): Promise<boolean> {
    const exists = await Like.findOne({ postId, userId });
    return exists !== null;
  }

  public async getLikedPostIds(userId: string, postIds: string[]): Promise<string[]> {
    const likes = await Like.find({ userId, postId: { $in: postIds } }).select("postId");
    return likes.map((l) => l.postId);
  }

  public async findRecentLikes(postId: string, limit: number): Promise<ILikeDocument[]> {
    return await Like.find({ postId }).sort({ createdAt: -1 }).limit(limit);
  }

  public async findRecentLikesForPosts(postIds: string[], limit: number): Promise<Record<string, ILikeDocument[]>> {
    const results = await Like.aggregate([
      { $match: { postId: { $in: postIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$postId",
          likes: { $push: "$$ROOT" },
        },
      },
      {
        $project: {
          likes: { $slice: ["$likes", limit] },
        },
      },
    ]);

    const map: Record<string, ILikeDocument[]> = {};
    for (const item of results) {
      map[item._id] = item.likes;
    }
    return map;
  }

  // --- Comments Repository Methods ---

  public async createComment(input: {
    postId: string;
    userId: string;
    content: string;
    parentId?: string | null;
  }): Promise<ICommentDocument> {
    return await Comment.create(input);
  }

  public async findLatestComment(postId: string): Promise<ICommentDocument | null> {
    return await Comment.findOne({ postId }).sort({ createdAt: -1 });
  }

  public async findLatestCommentsForPosts(postIds: string[]): Promise<Record<string, ICommentDocument>> {
    const results = await Comment.aggregate([
      { $match: { postId: { $in: postIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$postId",
          latestComment: { $first: "$$ROOT" },
        },
      },
    ]);

    const map: Record<string, ICommentDocument> = {};
    for (const item of results) {
      map[item._id] = item.latestComment;
    }
    return map;
  }
}

export const postsRepository = new PostsRepository();
export default postsRepository;
