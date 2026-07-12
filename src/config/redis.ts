import { createClient, RedisClientType } from "redis";
import { env } from "./env.js";

let redisClient: RedisClientType | null = null;

export const connectRedis = async (): Promise<RedisClientType> => {
  if (redisClient) return redisClient;

  const url = env.REDIS_URL || "redis://127.0.0.1:6379";
  const client = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 1) {
          return new Error("Redis connection failed");
        }
        return 100;
      },
    },
  });

  client.on("error", (err) => {
    console.warn("Redis Client Error:", err.message);
  });

  try {
    await client.connect();
    redisClient = client as RedisClientType;
    console.log("Redis Connected");
  } catch (error) {
    console.warn("Redis connection failed. Caching will be mocked/disabled.");
    const store = new Map<string, { value: string; expireAt?: number }>();
    redisClient = {
      connect: async () => {},
      disconnect: async () => {},
      get: async (key: string) => {
        const item = store.get(key);
        if (!item) return null;
        if (item.expireAt && Date.now() > item.expireAt) {
          store.delete(key);
          return null;
        }
        return item.value;
      },
      set: async (key: string, value: string, options?: any) => {
        let expireAt: number | undefined;
        if (options?.EX) {
          expireAt = Date.now() + options.EX * 1000;
        }
        store.set(key, { value, expireAt });
        return "OK";
      },
      ttl: async (key: string) => {
        const item = store.get(key);
        if (!item) return -2;
        if (!item.expireAt) return -1;
        const diff = Math.ceil((item.expireAt - Date.now()) / 1000);
        if (diff < 0) {
          store.delete(key);
          return -2;
        }
        return diff;
      },
      del: async (key: string) => {
        return store.delete(key) ? 1 : 0;
      },
      on: () => {},
    } as unknown as RedisClientType;
  }
  return redisClient;
};

export const getRedisClient = (): RedisClientType => {
  if (!redisClient) {
    throw new Error("Redis client not initialized. Call connectRedis() first.");
  }
  return redisClient;
};
export default connectRedis;
