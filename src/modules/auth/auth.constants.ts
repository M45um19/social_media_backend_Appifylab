export const AUTH_CONSTANTS = {
  KAFKA: {
    TOPICS: {
      USER_REGISTERED: "auth.user-registered",
    },
    CONSUMER_GROUP_ID: "auth-group",
  },
  REDIS: {
    CACHE_KEYS: {
      USER_DATA: (userId: string) => `user:${userId}:data`,
    },
    TTL: {
      USER_DATA: 7 * 24 * 3600, // 7 days
    },
  },
};
