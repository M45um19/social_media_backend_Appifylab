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
      zAdd: async (key: string, member: any) => {
        let list: Array<{ score: number; value: string }> = [];
        const item = store.get(key);
        if (item) {
          try {
            list = JSON.parse(item.value);
          } catch {}
        }
        const members = Array.isArray(member) ? member : [member];
        for (const m of members) {
          list = list.filter((x) => x.value !== m.value);
          list.push({ score: m.score, value: m.value });
        }
        list.sort((a, b) => a.score - b.score);
        store.set(key, { value: JSON.stringify(list), expireAt: item?.expireAt });
        return members.length;
      },
      zRevRangeByScore: async (key: string, max: any, min: any, options?: { LIMIT?: { offset: number; count: number } }) => {
        const item = store.get(key);
        if (!item) return [];
        try {
          let list: Array<{ score: number; value: string }> = JSON.parse(item.value);
          let maxVal = Infinity;
          let minVal = -Infinity;
          let maxExclusive = false;
          let minExclusive = false;

          if (typeof max === "string") {
            if (max.startsWith("(")) {
              maxVal = parseFloat(max.slice(1));
              maxExclusive = true;
            } else if (max === "+inf") {
              maxVal = Infinity;
            } else {
              maxVal = parseFloat(max);
            }
          } else if (typeof max === "number") {
            maxVal = max;
          }

          if (typeof min === "string") {
            if (min.startsWith("(")) {
              minVal = parseFloat(min.slice(1));
              minExclusive = true;
            } else if (min === "-inf") {
              minVal = -Infinity;
            } else {
              minVal = parseFloat(min);
            }
          } else if (typeof min === "number") {
            minVal = min;
          }

          list = list.filter((x) => {
            const afterMin = minExclusive ? x.score > minVal : x.score >= minVal;
            const beforeMax = maxExclusive ? x.score < maxVal : x.score <= maxVal;
            return afterMin && beforeMax;
          });

          list.sort((a, b) => b.score - a.score);

          if (options?.LIMIT) {
            const { offset, count } = options.LIMIT;
            list = list.slice(offset, offset + count);
          }

          return list.map((x) => x.value);
        } catch {
          return [];
        }
      },
      zRange: async (key: string, minArg: any, maxArg: any, options?: { BY?: string; REV?: boolean; LIMIT?: { offset: number; count: number } }) => {
        const item = store.get(key);
        if (!item) return [];
        try {
          let min = minArg;
          let max = maxArg;
          if (options?.REV) {
            min = maxArg;
            max = minArg;
          }
          let list: Array<{ score: number; value: string }> = JSON.parse(item.value);
          let maxVal = Infinity;
          let minVal = -Infinity;
          let maxExclusive = false;
          let minExclusive = false;

          if (typeof max === "string") {
            if (max.startsWith("(")) {
              maxVal = parseFloat(max.slice(1));
              maxExclusive = true;
            } else if (max === "+inf") {
              maxVal = Infinity;
            } else {
              maxVal = parseFloat(max);
            }
          } else if (typeof max === "number") {
            maxVal = max;
          }

          if (typeof min === "string") {
            if (min.startsWith("(")) {
              minVal = parseFloat(min.slice(1));
              minExclusive = true;
            } else if (min === "-inf") {
              minVal = -Infinity;
            } else {
              minVal = parseFloat(min);
            }
          } else if (typeof min === "number") {
            minVal = min;
          }

          list = list.filter((x) => {
            const afterMin = minExclusive ? x.score > minVal : x.score >= minVal;
            const beforeMax = maxExclusive ? x.score < maxVal : x.score <= maxVal;
            return afterMin && beforeMax;
          });

          if (options?.REV) {
            list.sort((a, b) => b.score - a.score);
          } else {
            list.sort((a, b) => a.score - b.score);
          }

          if (options?.LIMIT) {
            const { offset, count } = options.LIMIT;
            list = list.slice(offset, offset + count);
          }

          return list.map((x) => x.value);
        } catch {
          return [];
        }
      },
      hSet: async (key: string, field: any, value?: any) => {
        let data: Record<string, string> = {};
        const item = store.get(key);
        if (item) {
          try {
            data = JSON.parse(item.value);
          } catch {}
        }
        
        if (typeof field === "object" && field !== null) {
          Object.assign(data, field);
        } else {
          data[field] = value;
        }

        store.set(key, { value: JSON.stringify(data), expireAt: item?.expireAt });
        return 1;
      },
      hGet: async (key: string, field: string) => {
        const item = store.get(key);
        if (!item) return null;
        if (item.expireAt && Date.now() > item.expireAt) {
          store.delete(key);
          return null;
        }
        try {
          const data = JSON.parse(item.value);
          return data[field] || null;
        } catch {
          return null;
        }
      },
      hGetAll: async (key: string) => {
        const item = store.get(key);
        if (!item) return {};
        if (item.expireAt && Date.now() > item.expireAt) {
          store.delete(key);
          return {};
        }
        try {
          return JSON.parse(item.value);
        } catch {
          return {};
        }
      },
      hDel: async (key: string, fields: string | string[]) => {
        const item = store.get(key);
        if (!item) return 0;
        try {
          const data = JSON.parse(item.value);
          let deletedCount = 0;
          const fieldsArray = Array.isArray(fields) ? fields : [fields];
          for (const f of fieldsArray) {
            if (f in data) {
              delete data[f];
              deletedCount++;
            }
          }
          store.set(key, { value: JSON.stringify(data), expireAt: item.expireAt });
          return deletedCount;
        } catch {
          return 0;
        }
      },
      expire: async (key: string, seconds: number) => {
        const item = store.get(key);
        if (item) {
          item.expireAt = Date.now() + seconds * 1000;
          return true;
        }
        return false;
      },
      multi: () => {
        const chain: Array<() => Promise<any>> = [];
        const builder = {
          hSet: (key: string, field: any, value?: any) => {
            chain.push(() => redisClient!.hSet(key, field, value));
            return builder;
          },
          hGetAll: (key: string) => {
            chain.push(() => redisClient!.hGetAll(key));
            return builder;
          },
          hGet: (key: string, field: string) => {
            chain.push(() => redisClient!.hGet(key, field));
            return builder;
          },
          expire: (key: string, seconds: number) => {
            chain.push(() => redisClient!.expire(key, seconds));
            return builder;
          },
          hDel: (key: string, fields: string | string[]) => {
            chain.push(() => redisClient!.hDel(key, fields));
            return builder;
          },
          exec: async () => {
            const results = [];
            for (const fn of chain) {
              results.push(await fn());
            }
            return results;
          }
        };
        return builder;
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
