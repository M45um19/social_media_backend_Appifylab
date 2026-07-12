export const AUTH_CONSTANTS = {
  KAFKA: {
    TOPICS: {
      USER_REGISTERED: "auth.user-registered",
    },
    CONSUMER_GROUP_ID: "auth-group",
  },
  REDIS: {
    CACHE_KEYS: {
      USER_DEVICES: (userId: string) => `auth:devices:${userId}`,
    },
    TTL: {
      USER_DEVICES: 7 * 24 * 3600, // 7 days
    },
  },
};
