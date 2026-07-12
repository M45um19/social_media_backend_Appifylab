import { connectDB } from "./config/db.js";
import { connectRedis } from "./config/redis.js";
import { startConsumers } from "./kafka/index.js";

const startWorker = async () => {
  console.log("Starting standalone background worker process...");

  // 1. Connect MongoDB
  await connectDB();

  // 2. Connect Redis
  await connectRedis();

  // 3. Connect and start event consumers
  await startConsumers();

  // Graceful shutdown
  const handleExit = (signal: string) => {
    console.log(`Worker received ${signal}. Shutting down worker...`);
    process.exit(0);
  };

  process.on("SIGTERM", () => handleExit("SIGTERM"));
  process.on("SIGINT", () => handleExit("SIGINT"));
};

startWorker().catch((err) => {
  console.error("Critical worker process boot failure:", err);
  process.exit(1);
});
