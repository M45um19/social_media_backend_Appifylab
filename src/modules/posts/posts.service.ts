import crypto from "crypto";
import { env } from "../../config/env.js";
import { getRedisClient } from "../../config/redis.js";
import { postsRepository } from "./posts.repository.js";
import { postsEvents } from "./posts.events.js";
import { POSTS_CONSTANTS } from "./posts.constants.js";
import { AppError } from "../../utils/appError.js";
import { authService } from "../auth/auth.service.js";
import {
  IPost,
  ICreatePostInput,
  IGetPostsQuery,
  IPresignedUrlInput,
  IPresignedUrlResponse,
} from "./posts.interface.js";

export class PostsService {
  /**
   * Generates a secure signature for a single Cloudinary upload.
   */
  public async generatePresignedUrl(
    input: IPresignedUrlInput
  ): Promise<IPresignedUrlResponse> {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = "posts";
    const publicId = crypto.randomUUID();

    // Alphabetically sort the parameters to sign
    const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
    const apiSecret = env.CLOUDINARY_API_SECRET;

    // Generate SHA-1 hex digest
    const signature = crypto
      .createHash("sha1")
      .update(paramsToSign + apiSecret)
      .digest("hex");

    return {
      signature,
      timestamp,
      folder,
      publicId,
      resourceType: input.resourceType,
      apiKey: env.CLOUDINARY_API_KEY,
      cloudName: env.CLOUDINARY_CLOUD_NAME,
    };
  }

  /**
   * Orchestrates the creation of a Post: MongoDB insert, Redis ZSET + Hash cache sync, and Kafka event emit.
   */
  public async createPost(
    userId: string,
    input: ICreatePostInput
  ): Promise<IPost> {
    // 1. Insert the post into MongoDB
    const postDoc = await postsRepository.create({
      userId,
      content: input.content,
      mediaUrls: input.mediaUrls || [],
    });

    const postDto: IPost = {
      id: postDoc._id,
      userId: postDoc.userId,
      content: postDoc.content,
      mediaUrls: postDoc.mediaUrls,
      likesCount: postDoc.likesCount,
      commentsCount: postDoc.commentsCount,
      createdAt: postDoc.createdAt,
      updatedAt: postDoc.updatedAt,
    };

    // 2. Synchronous Redis Operations (ZSET feed index & HASH cache hydration)
    try {
      const redis = getRedisClient();
      const score = postDoc.createdAt.getTime();
      const feedKey = POSTS_CONSTANTS.REDIS.CACHE_KEYS.GLOBAL_FEED;
      const postKey = POSTS_CONSTANTS.REDIS.CACHE_KEYS.POST_DATA(postDto.id);

      // Add to global feed sorted set
      await redis.zAdd(feedKey, { score, value: postDto.id });

      // Populate post hash fields
      await redis.hSet(postKey, {
        id: postDto.id,
        userId: postDto.userId,
        content: postDto.content || "",
        mediaUrls: JSON.stringify(postDto.mediaUrls || []),
        likesCount: "0",
        commentsCount: "0",
        createdAt: postDto.createdAt.toISOString(),
        updatedAt: postDto.updatedAt.toISOString(),
      });

      // Apply initial 30-minute sliding TTL
      await redis.expire(postKey, POSTS_CONSTANTS.REDIS.TTL.POST_DATA);
      console.log(`Saved post ${postDto.id} details and indexed in global feed.`);
    } catch (redisError: any) {
      console.error(`Failed to synchronize post to Redis cache: ${redisError.message}`);
      throw new AppError("Failed to store post in cache/feed index", 500);
    }

    // 3. Asynchronous Kafka event publishing
    try {
      console.log("Emitting post.created Kafka event for post:", postDto);
      await postsEvents.emitPostCreated({
        id: postDto.id,
        userId: postDto.userId,
        mediaUrls: postDto.mediaUrls,
      });
    } catch (kafkaError: any) {
      console.error(`Failed to dispatch Kafka event: ${kafkaError.message}`);
    }

    const populated = await this.populateUserDetails([postDto]);
    return populated[0];
  }

  /**
   * Retrieves individual post details using the Cache-Aside pattern (Redis Hash -> MongoDB fallback -> Hydrate).
   */
  public async getPostDetails(postId: string): Promise<IPost | null> {
    const postKey = POSTS_CONSTANTS.REDIS.CACHE_KEYS.POST_DATA(postId);
    const redis = getRedisClient();

    try {
      // Check cache first
      const data = await redis.hGetAll(postKey);
      if (data && Object.keys(data).length > 0) {
        // Sliding TTL refresh
        await redis.expire(postKey, POSTS_CONSTANTS.REDIS.TTL.POST_DATA);

        return {
          id: data.id,
          userId: data.userId,
          content: data.content,
          mediaUrls: data.mediaUrls ? JSON.parse(data.mediaUrls) : [],
          likesCount: parseInt(data.likesCount || "0", 10),
          commentsCount: parseInt(data.commentsCount || "0", 10),
          createdAt: new Date(data.createdAt),
          updatedAt: new Date(data.updatedAt),
        };
      }
    } catch (redisError: any) {
      console.warn(`Redis read hit warning for post ID ${postId}: ${redisError.message}`);
    }

    // DB fallback
    const postDoc = await postsRepository.findById(postId);
    if (!postDoc) {
      return null;
    }

    const postDto: IPost = {
      id: postDoc._id,
      userId: postDoc.userId,
      content: postDoc.content,
      mediaUrls: postDoc.mediaUrls,
      likesCount: postDoc.likesCount,
      commentsCount: postDoc.commentsCount,
      createdAt: postDoc.createdAt,
      updatedAt: postDoc.updatedAt,
    };

    // Hydrate cache
    try {
      await redis.hSet(postKey, {
        id: postDto.id,
        userId: postDto.userId,
        content: postDto.content || "",
        mediaUrls: JSON.stringify(postDto.mediaUrls || []),
        likesCount: postDto.likesCount.toString(),
        commentsCount: postDto.commentsCount.toString(),
        createdAt: postDto.createdAt.toISOString(),
        updatedAt: postDto.updatedAt.toISOString(),
      });
      await redis.expire(postKey, POSTS_CONSTANTS.REDIS.TTL.POST_DATA);
    } catch (redisError: any) {
      console.warn(`Redis hydration warning for post ID ${postId}: ${redisError.message}`);
    }

    return postDto;
  }

  /**
   * Fetches the global feed of posts using ZREVRANGEBYSCORE cursor-based pagination.
   */
  public async getFeed(
    query: IGetPostsQuery
  ): Promise<{ posts: IPost[]; nextCursor: string | null }> {
    const redis = getRedisClient();
    const feedKey = POSTS_CONSTANTS.REDIS.CACHE_KEYS.GLOBAL_FEED;

    const limit = query.limit
      ? Math.min(Number(query.limit), POSTS_CONSTANTS.PAGINATION.MAX_LIMIT)
      : POSTS_CONSTANTS.PAGINATION.DEFAULT_LIMIT;

    const cursor = query.cursor;

    // Use ZREVRANGEBYSCORE (via zRange with REV option) on global_feed ZSET for cursor pagination
    const min = "-inf";
    const max = cursor ? `(${cursor}` : "+inf";

    let postIds: string[] = [];
    try {
      postIds = await redis.zRange(feedKey, max, min, {
        BY: "SCORE",
        REV: true,
        LIMIT: { offset: 0, count: limit },
      });
    } catch (redisError: any) {
      console.error(`Failed to fetch ZSET from Redis: ${redisError.message}`);
      throw new AppError("Unable to retrieve feed", 500);
    }

    if (postIds.length === 0) {
      return { posts: [], nextCursor: null };
    }

    // 1. Performance Optimization: Use a Redis pipeline to fetch all post HASHes in a single network trip
    let pipelineResults: any[] = [];
    try {
      const pipeline = redis.multi();
      for (const postId of postIds) {
        const postKey = POSTS_CONSTANTS.REDIS.CACHE_KEYS.POST_DATA(postId);
        pipeline.hGetAll(postKey);
      }
      pipelineResults = await pipeline.exec();
    } catch (redisError: any) {
      console.error(`Failed to execute Redis pipeline fetch: ${redisError.message}`);
      throw new AppError("Unable to retrieve feed", 500);
    }

    const postMap = new Map<string, IPost>();
    const cacheMissIds: string[] = [];

    // Parse cache hits and collect cache misses
    for (let i = 0; i < postIds.length; i++) {
      const postId = postIds[i];
      const data = pipelineResults[i] as Record<string, string> | undefined;

      if (data && Object.keys(data).length > 0 && data.id) {
        // Cache hit! Parse the details
        postMap.set(postId, {
          id: data.id,
          userId: data.userId,
          content: data.content,
          mediaUrls: data.mediaUrls ? JSON.parse(data.mediaUrls) : [],
          likesCount: parseInt(data.likesCount || "0", 10),
          commentsCount: parseInt(data.commentsCount || "0", 10),
          createdAt: new Date(data.createdAt),
          updatedAt: new Date(data.updatedAt),
        });

        // Asynchronously extend cache TTL (sliding window) - non-blocking
        const postKey = POSTS_CONSTANTS.REDIS.CACHE_KEYS.POST_DATA(postId);
        redis.expire(postKey, POSTS_CONSTANTS.REDIS.TTL.POST_DATA).catch((err) => {
          console.warn(`Failed to extend TTL for post key ${postKey}: ${err.message}`);
        });
      } else {
        // Cache miss!
        cacheMissIds.push(postId);
      }
    }

    // 2. Batch MongoDB query to fetch any Cache Miss posts
    if (cacheMissIds.length > 0) {
      try {
        const missedDocs = await postsRepository.findByIds(cacheMissIds);
        const hydrationMulti = redis.multi();

        for (const doc of missedDocs) {
          const postDto: IPost = {
            id: doc._id,
            userId: doc.userId,
            content: doc.content,
            mediaUrls: doc.mediaUrls,
            likesCount: doc.likesCount,
            commentsCount: doc.commentsCount,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          };

          postMap.set(postDto.id, postDto);

          // Queue Redis HASH cache hydration and sliding TTL setup
          const postKey = POSTS_CONSTANTS.REDIS.CACHE_KEYS.POST_DATA(postDto.id);
          hydrationMulti.hSet(postKey, {
            id: postDto.id,
            userId: postDto.userId,
            content: postDto.content || "",
            mediaUrls: JSON.stringify(postDto.mediaUrls || []),
            likesCount: postDto.likesCount.toString(),
            commentsCount: postDto.commentsCount.toString(),
            createdAt: postDto.createdAt.toISOString(),
            updatedAt: postDto.updatedAt.toISOString(),
          });
          hydrationMulti.expire(postKey, POSTS_CONSTANTS.REDIS.TTL.POST_DATA);
        }

        // Execute batch cache hydration for all resolved cache misses
        if (missedDocs.length > 0) {
          await hydrationMulti.exec();
        }
      } catch (dbOrRedisError: any) {
        console.warn(`Cache hydration error: ${dbOrRedisError.message}`);
      }
    }

    // 3. Re-assemble final feed results maintaining the correct ZSET feed ordering
    const posts: IPost[] = [];
    for (const postId of postIds) {
      const post = postMap.get(postId);
      if (post) {
        posts.push(post);
      }
    }

    // Populate user profile details (checking cache and fetching missed IDs from MongoDB)
    await this.populateUserDetails(posts);

    const nextCursor =
      posts.length > 0
        ? new Date(posts[posts.length - 1].createdAt).getTime().toString()
        : null;

    return {
      posts,
      nextCursor,
    };
  }

  /**
   * Batches user profile lookups for a list of posts. Checks Redis first,
   * queries MongoDB via authService for cache misses, hydrates Redis cache,
   * and populates each post's user field.
   */
  private async populateUserDetails(posts: IPost[]): Promise<IPost[]> {
    if (posts.length === 0) return posts;

    const userIds = Array.from(new Set(posts.map((p) => p.userId)));
    const redis = getRedisClient();

    let pipelineResults: any[] = [];
    try {
      const pipeline = redis.multi();
      for (const userId of userIds) {
        const userKey = `user:${userId}:data`;
        pipeline.hGet(userKey, "profile");
      }
      pipelineResults = await pipeline.exec();
    } catch (redisError: any) {
      console.warn(`Redis error fetching user details pipeline: ${redisError.message}`);
    }

    const userMap = new Map<string, { firstName: string; lastName: string; profilePicture?: string }>();
    const cacheMissUserIds: string[] = [];

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i];
      const profileStr = pipelineResults[i] as string | null;

      if (profileStr) {
        try {
          const profile = JSON.parse(profileStr);
          userMap.set(userId, {
            firstName: profile.firstName,
            lastName: profile.lastName,
            profilePicture: profile.profilePicture,
          });
        } catch {
          cacheMissUserIds.push(userId);
        }
      } else {
        cacheMissUserIds.push(userId);
      }
    }

    // Resolve cache misses via batch query to MongoDB through authService
    if (cacheMissUserIds.length > 0) {
      try {
        const missedUsers = await authService.getUsersByIds(cacheMissUserIds);
        const hydrationMulti = redis.multi();

        for (const u of missedUsers) {
          const userProfile = {
            firstName: u.firstName,
            lastName: u.lastName,
            profilePicture: u.profilePicture,
          };
          userMap.set(u.id, userProfile);

          // Hydrate Redis user profile HASH
          const userKey = `user:${u.id}:data`;
          hydrationMulti.hSet(userKey, {
            profile: JSON.stringify(u),
          });
          hydrationMulti.expire(userKey, 7 * 24 * 3600); // 7 days TTL
        }

        if (missedUsers.length > 0) {
          await hydrationMulti.exec();
        }
      } catch (err: any) {
        console.warn(`Failed to resolve user cache misses: ${err.message}`);
      }
    }

    // Populate the user field in each post
    for (const post of posts) {
      const userProfile = userMap.get(post.userId);
      if (userProfile) {
        post.user = userProfile;
      } else {
        post.user = {
          firstName: "Unknown",
          lastName: "User",
        };
      }
    }

    return posts;
  }
}

export const postsService = new PostsService();
export default postsService;
