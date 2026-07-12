import app from "./app.js";
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { connectRedis } from "./config/redis.js";
import { connectProducer } from "./config/kafka.js";

const startServer = async () => {
  console.log("Starting HTTP API Server Process...");

  // 1. Connect MongoDB
  await connectDB();

  // 2. Connect Redis cache
  await connectRedis();

  // 3. Connect Kafka producer
  await connectProducer();

  // 4. Listen on configured port
  const server = app.listen(env.PORT, () => {
    console.log(`HTTP Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  });

  // Graceful shutdown
  const handleExit = (signal: string) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log("HTTP Server closed.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => handleExit("SIGTERM"));
  process.on("SIGINT", () => handleExit("SIGINT"));
};

startServer().catch((err) => {
  console.error("Critical server boot failure:", err);
  process.exit(1);
});
