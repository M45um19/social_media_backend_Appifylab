import { kafka, waitForKafka } from "../config/kafka.js";
import { startAuthConsumer } from "./auth.consumer.js";
import { startPostsConsumer } from "./posts.consumer.js";
import { AUTH_CONSTANTS } from "../modules/auth/auth.constants.js";
import { POSTS_CONSTANTS } from "../modules/posts/posts.constants.js";

export const ensureTopicsExist = async (topics: string[]): Promise<void> => {
  const admin = kafka.admin();
  try {
    await admin.connect();
    const existingTopics = await admin.listTopics();
    const topicsToCreate = topics.filter((t) => !existingTopics.includes(t));
    
    if (topicsToCreate.length > 0) {
      console.log(`Creating Kafka topics: ${topicsToCreate.join(", ")}`);
      await admin.createTopics({
        topics: topicsToCreate.map((topic) => ({
          topic,
          numPartitions: 1,
          replicationFactor: 1,
        })),
      });
      console.log("Kafka topics created successfully");
    }
  } catch (error: any) {
    console.warn(`Failed to check/create Kafka topics: ${error.message}`);
  } finally {
    try {
      await admin.disconnect();
    } catch {}
  }
};

export const startConsumers = async (): Promise<void> => {
  try {
    console.log("Waiting for Kafka connection readiness...");
    const isReady = await waitForKafka(10, 3000);
    if (!isReady) {
      console.warn("Kafka was not ready after retries. Starting consumers in fallback/disabled mode.");
    } else {
      console.log("Kafka connection ready. Initializing topics and consumers.");
    }

    console.log("Ensuring required Kafka topics exist...");
    await ensureTopicsExist([
      AUTH_CONSTANTS.KAFKA.TOPICS.USER_REGISTERED,
      POSTS_CONSTANTS.KAFKA.TOPICS.POST_CREATED,
      POSTS_CONSTANTS.KAFKA.TOPICS.POST_LIKED,
      POSTS_CONSTANTS.KAFKA.TOPICS.POST_COMMENTED,
    ]);

    console.log("Initializing consumer subscriptions...");
    await startAuthConsumer();
    await startPostsConsumer();
    
    console.log("Kafka Consumers boot orchestration complete");
  } catch (error) {
    console.error("Kafka consumer initialization failed:", error);
  }
};
export default startConsumers;
