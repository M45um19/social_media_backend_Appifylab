export const POSTS_CONSTANTS = {
  KAFKA: {
    TOPICS: {
      POST_CREATED: "posts.post-created",
      POST_LIKED: "posts.post-liked",
      POST_COMMENTED: "posts.post-commented",
    },
    CLIENT_ID: "posts-service",
    CONSUMER_GROUP_ID: "posts-group",
  },
  REDIS: {
    CACHE_KEYS: {
      POST_DATA: (postId: string) => `post:${postId}:data`,
      POST_LIKERS: (postId: string) => `post:${postId}:likers`,
      GLOBAL_FEED: "global_feed",
    },
    TTL: {
      POST_DATA: 30 * 60, // 30 minutes in seconds
      POST_LIKERS: 48 * 3600, // 48 hours in seconds
    },
  },
  PAGINATION: {
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
  },
};
