import { kafka } from "../config/kafka.js";
import { startAuthConsumer } from "./auth.consumer.js";
import { AUTH_CONSTANTS } from "../modules/auth/auth.constants.js";

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
    console.log("Ensuring required Kafka topics exist...");
    await ensureTopicsExist([AUTH_CONSTANTS.KAFKA.TOPICS.USER_REGISTERED]);

    console.log("Initializing consumer subscriptions...");
    await startAuthConsumer();
    
    console.log("Kafka Consumers boot orchestration complete");
  } catch (error) {
    console.error("Kafka consumer initialization failed:", error);
  }
};
export default startConsumers;
