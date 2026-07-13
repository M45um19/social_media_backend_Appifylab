import crypto from "crypto";
import { env } from "../../config/env.js";
import { getRedisClient } from "../../config/redis.js";
import { postsRepository } from "./posts.repository.js";
import { postsEvents } from "./posts.events.js";
import { uuidv7 } from "../../utils/uuid.js";
import { POSTS_CONSTANTS } from "./posts.constants.js";
import { AppError } from "../../utils/appError.js";
import { authService } from "../auth/auth.service.js";
import {
  IPost,
  ICreatePostInput,
  IGetPostsQuery,
  IPresignedUrlInput,
  IPresignedUrlResponse,
  IComment,
  ICreateCommentInput,
  IPostLiker,
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

  public async getPostDetails(postId: string, requestingUserId?: string): Promise<IPost | null> {
    const postKey = POSTS_CONSTANTS.REDIS.CACHE_KEYS.POST_DATA(postId);
    const redis = getRedisClient();

    try {
      // Check cache first
      const data = await redis.hGetAll(postKey);
      if (data && Object.keys(data).length > 0) {
        // Sliding TTL refresh
        await redis.expire(postKey, POSTS_CONSTANTS.REDIS.TTL.POST_DATA);

        let recentLikers: any[] = [];
        if (data.recentLikers) {
          try {
            recentLikers = JSON.parse(data.recentLikers);
          } catch {}
        }

        let recentComment: any = null;
        if (data.recentComment) {
          try {
            recentComment = JSON.parse(data.recentComment);
          } catch {}
        }

        let isLiked = false;
        if (requestingUserId) {
          const likersKey = POSTS_CONSTANTS.REDIS.CACHE_KEYS.POST_LIKERS(postId);
          if (await redis.exists(likersKey)) {
            const memberCheck = await redis.sIsMember(likersKey, requestingUserId) as any;
            isLiked = memberCheck === 1 || memberCheck === true;
          } else {
            isLiked = await postsRepository.hasUserLiked(postId, requestingUserId);
          }
        }

        return {
          id: data.id,
          userId: data.userId,
          content: data.content,
          mediaUrls: data.mediaUrls ? JSON.parse(data.mediaUrls) : [],
          likesCount: parseInt(data.likesCount || "0", 10),
          commentsCount: parseInt(data.commentsCount || "0", 10),
          createdAt: new Date(data.createdAt),
          updatedAt: new Date(data.updatedAt),
          recentLikers,
          recentComment,
          isLiked,
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

    // Fetch recent likes (last 5) and latest comment
    const [recentLikesDocs, latestCommentDoc] = await Promise.all([
      postsRepository.findRecentLikes(postId, 5),
      postsRepository.findLatestComment(postId),
    ]);

    const likerIds = recentLikesDocs.map((l) => l.userId);
    const commentAuthorId = latestCommentDoc?.userId;
    const batchUserIds = Array.from(new Set([
      ...likerIds,
      ...(commentAuthorId ? [commentAuthorId] : []),
    ]));

    let profilesMap = new Map<string, any>();
    if (batchUserIds.length > 0) {
      try {
        const profiles = await authService.getUsersByIds(batchUserIds);
        profilesMap = new Map(profiles.map((p) => [p.id, p]));
      } catch (err: any) {
        console.warn(`Failed to fetch profiles during hydration: ${err.message}`);
      }
    }

    const recentLikers = recentLikesDocs.map((l) => {
      const p = profilesMap.get(l.userId);
      return {
        id: l.userId,
        name: p ? `${p.firstName} ${p.lastName}`.trim() : "Unknown User",
        pic: p?.profilePicture || "",
      };
    });

    let recentComment = null;
    if (latestCommentDoc) {
      const p = profilesMap.get(latestCommentDoc.userId);
      recentComment = {
        userId: latestCommentDoc.userId,
        firstName: p ? p.firstName : "Unknown",
        lastName: p ? p.lastName : "User",
        profilePicture: p?.profilePicture || "",
        text: latestCommentDoc.content.length > 100
          ? latestCommentDoc.content.slice(0, 100) + "..."
          : latestCommentDoc.content,
      };
    }

    let isLiked = false;
    if (requestingUserId) {
      isLiked = await postsRepository.hasUserLiked(postId, requestingUserId);
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
      recentLikers,
      recentComment,
      isLiked,
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
        recentLikers: JSON.stringify(postDto.recentLikers || []),
        recentComment: postDto.recentComment ? JSON.stringify(postDto.recentComment) : "",
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
    query: IGetPostsQuery,
    requestingUserId?: string
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
        let recentLikers: any[] = [];
        if (data.recentLikers) {
          try {
            recentLikers = JSON.parse(data.recentLikers);
          } catch {}
        }
        let recentComment: any = null;
        if (data.recentComment) {
          try {
            recentComment = JSON.parse(data.recentComment);
          } catch {}
        }

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
          recentLikers,
          recentComment,
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

        // Batch fetch recent likes and comments for all missed posts
        const [recentLikesForMissed, latestCommentsForMissed] = await Promise.all([
          postsRepository.findRecentLikesForPosts(cacheMissIds, 5),
          postsRepository.findLatestCommentsForPosts(cacheMissIds),
        ]);

        // Gather all user IDs of recent likers and comment authors to batch fetch their profiles
        const missedUserIds = new Set<string>();
        for (const pid of cacheMissIds) {
          const likes = recentLikesForMissed[pid] || [];
          for (const l of likes) {
            missedUserIds.add(l.userId);
          }
          const comment = latestCommentsForMissed[pid];
          if (comment) {
            missedUserIds.add(comment.userId);
          }
        }

        let profilesMap = new Map<string, any>();
        if (missedUserIds.size > 0) {
          try {
            const profiles = await authService.getUsersByIds(Array.from(missedUserIds));
            profilesMap = new Map(profiles.map((p) => [p.id, p]));
          } catch (err: any) {
            console.warn(`Failed to resolve profiles for missed users: ${err.message}`);
          }
        }

        const hydrationMulti = redis.multi();

        for (const doc of missedDocs) {
          const pid = doc._id;

          // Construct recentLikers list
          const likes = recentLikesForMissed[pid] || [];
          const recentLikers = likes.map((l) => {
            const p = profilesMap.get(l.userId);
            return {
              id: l.userId,
              name: p ? `${p.firstName} ${p.lastName}`.trim() : "Unknown User",
              pic: p?.profilePicture || "",
            };
          });

          // Construct recentComment DTO
          const comment = latestCommentsForMissed[pid];
          let recentComment = null;
          if (comment) {
            const p = profilesMap.get(comment.userId);
            recentComment = {
              userId: comment.userId,
              firstName: p ? p.firstName : "Unknown",
              lastName: p ? p.lastName : "User",
              profilePicture: p?.profilePicture || "",
              text: comment.content.length > 100
                ? comment.content.slice(0, 100) + "..."
                : comment.content,
            };
          }

          const postDto: IPost = {
            id: doc._id,
            userId: doc.userId,
            content: doc.content,
            mediaUrls: doc.mediaUrls,
            likesCount: doc.likesCount,
            commentsCount: doc.commentsCount,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
            recentLikers,
            recentComment,
          };

          postMap.set(postDto.id, postDto);

          // Pipelined hydration HSET
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
            recentLikers: JSON.stringify(postDto.recentLikers || []),
            recentComment: postDto.recentComment ? JSON.stringify(postDto.recentComment) : "",
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

    // 4. Map isLiked state for all retrieved posts if requestingUserId is provided
    if (requestingUserId && posts.length > 0) {
      try {
        const checkMulti = redis.multi();
        for (const post of posts) {
          checkMulti.exists(POSTS_CONSTANTS.REDIS.CACHE_KEYS.POST_LIKERS(post.id));
          checkMulti.sIsMember(POSTS_CONSTANTS.REDIS.CACHE_KEYS.POST_LIKERS(post.id), requestingUserId);
        }
        const checkResults = await checkMulti.exec();

        const missingPostIdsForLikes: string[] = [];
        for (let i = 0; i < posts.length; i++) {
          const post = posts[i];
          const exists = checkResults[i * 2] as any;
          const isMember = checkResults[i * 2 + 1] as any;

          if (exists === 1 || exists === true) {
            post.isLiked = isMember === 1 || isMember === true;
          } else {
            missingPostIdsForLikes.push(post.id);
          }
        }

        if (missingPostIdsForLikes.length > 0) {
          const likedFromDb = await postsRepository.getLikedPostIds(requestingUserId, missingPostIdsForLikes);
          for (const post of posts) {
            if (missingPostIdsForLikes.includes(post.id)) {
              post.isLiked = likedFromDb.includes(post.id);
            }
          }
        }
      } catch (err: any) {
        console.warn(`Failed to resolve isLiked state: ${err.message}`);
      }
    }

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

  /**
   * Toggles a user's like on a post. Uses Redis SADD/SREM sets, increments counts,
   * updates the recentLikers snippet list in the HASH, and emits a post-liked Kafka event.
   * Optimized for zero database reads during the HTTP request cycle.
   */
  public async toggleLike(
    postId: string, 
    userId: string, 
    userFirstName?: string, 
    userLastName?: string
  ): Promise<{ liked: boolean }> {
    const postKey = POSTS_CONSTANTS.REDIS.CACHE_KEYS.POST_DATA(postId);
    const likersKey = POSTS_CONSTANTS.REDIS.CACHE_KEYS.POST_LIKERS(postId);
    const redis = getRedisClient();

    try {
      // 1. Zero DB Read Strategy: Use Redis SISMEMBER to determine if the user has already liked the post
      const memberCheck = await redis.sIsMember(likersKey, userId) as any;
      const isLike = !(memberCheck === 1 || memberCheck === true);

      // 2. Resolve user names from token parameters and profile picture from Redis user cache
      const userProfileName = (userFirstName && userLastName)
        ? `${userFirstName} ${userLastName}`.trim()
        : "Unknown User";

      let userProfilePic = "";
      try {
        const userKey = `user:${userId}:data`;
        const profileStr = await redis.hGet(userKey, "profile");
        if (profileStr) {
          const profile = JSON.parse(profileStr);
          userProfilePic = profile.profilePicture || "";
        }
      } catch (redisErr: any) {
        console.warn(`Failed to retrieve profile picture from cache: ${redisErr.message}`);
      }

      const userProfile: IPostLiker = {
        id: userId,
        name: userProfileName,
        pic: userProfilePic,
      };

      // 3. Retrieve and update recent likers from the post HASH cache
      const currentLikersJson = await redis.hGet(postKey, "recentLikers");
      let recentLikers: IPostLiker[] = [];
      if (currentLikersJson) {
        try {
          recentLikers = JSON.parse(currentLikersJson);
        } catch {}
      }

      if (isLike) {
        recentLikers = [userProfile, ...recentLikers.filter((u) => u.id !== userId)].slice(0, 5);
      } else {
        recentLikers = recentLikers.filter((u) => u.id !== userId);
      }

      // 4. Redis multi-transaction to perform operations atomically
      const multi = redis.multi();
      if (isLike) {
        multi.sAdd(likersKey, userId);
        multi.hIncrBy(postKey, "likesCount", 1);
      } else {
        multi.sRem(likersKey, userId);
        multi.hIncrBy(postKey, "likesCount", -1);
      }
      multi.hSet(postKey, "recentLikers", JSON.stringify(recentLikers));
      multi.expire(likersKey, POSTS_CONSTANTS.REDIS.TTL.POST_LIKERS); // 48-hour TTL
      await multi.exec();

      // 5. Asynchronous Kafka event publishing
      await postsEvents.emitPostLiked({
        postId,
        userId,
        action: isLike ? "like" : "unlike",
      });

      return { liked: isLike };
    } catch (error: any) {
      console.error(`Error in toggleLike transaction: ${error.message}`);
      throw new AppError(error.message || "Failed to toggle post like", error.statusCode || 500);
    }
  }

  /**
   * Persists a comment in MongoDB, updates the commentsCount in Redis,
   * updates the recentComment snippet, and emits a post-commented Kafka event.
   */
  public async addComment(
    postId: string,
    userId: string,
    input: ICreateCommentInput,
    userFirstName?: string,
    userLastName?: string
  ): Promise<IComment> {
    const postKey = POSTS_CONSTANTS.REDIS.CACHE_KEYS.POST_DATA(postId);
    const redis = getRedisClient();

    // 1. Check if post exists via lightweight check (checking cache first, then lightweight DB exist check)
    const postExistsInCache = await redis.exists(postKey);
    if (!postExistsInCache) {
      const existsInDb = await postsRepository.exists(postId);
      if (!existsInDb) {
        throw new AppError("Post not found", 404);
      }
    }

    // 2. Persist comment in MongoDB comments collection synchronously
    const commentDoc = await postsRepository.createComment({
      postId,
      userId,
      content: input.content,
      parentId: input.parentId || null,
    });

    const commentDto: IComment = {
      id: commentDoc._id,
      postId: commentDoc.postId,
      userId: commentDoc.userId,
      content: commentDoc.content,
      parentId: commentDoc.parentId,
      createdAt: commentDoc.createdAt,
      updatedAt: commentDoc.updatedAt,
    };

    // Retrieve profile picture from active Redis user cache
    let userProfilePic = "";
    try {
      const userKey = `user:${userId}:data`;
      const profileStr = await redis.hGet(userKey, "profile");
      if (profileStr) {
        const profile = JSON.parse(profileStr);
        userProfilePic = profile.profilePicture || "";
      }
    } catch {}

    // 3. Format snippet of latest comment
    const commentSnippet = {
      userId,
      firstName: userFirstName || "Unknown",
      lastName: userLastName || "User",
      profilePicture: userProfilePic,
      text: commentDto.content.length > 100 
        ? commentDto.content.slice(0, 100) + "..." 
        : commentDto.content,
    };

    let recentCommentObj: any = null;

    if (input.parentId) {
      // Retrieve the current recentComment from Redis HASH
      const currentRecentCommentStr = await redis.hGet(postKey, "recentComment");
      if (currentRecentCommentStr) {
        try {
          recentCommentObj = JSON.parse(currentRecentCommentStr);
        } catch {}
      }

      if (recentCommentObj) {
        recentCommentObj.reply = commentSnippet;
      } else {
        // If parent is not cached in Redis, we just save the reply comment itself as the main recentComment snippet
        recentCommentObj = commentSnippet;
      }
    } else {
      recentCommentObj = commentSnippet;
    }

    // 4. Update counts and recent comment atomically in Redis
    await redis.multi()
      .hIncrBy(postKey, "commentsCount", 1)
      .hSet(postKey, "recentComment", JSON.stringify(recentCommentObj))
      .exec();

    // 5. Emit comment event to Kafka
    await postsEvents.emitPostCommented({
      commentId: commentDto.id,
      postId: commentDto.postId,
      userId: commentDto.userId,
      content: commentDto.content,
      parentId: commentDto.parentId,
    });

    return commentDto;
  }
}

export const postsService = new PostsService();
export default postsService;
