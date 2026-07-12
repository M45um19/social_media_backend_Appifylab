import { kafka } from "../config/kafka.js";
import { AUTH_CONSTANTS } from "../modules/auth/auth.constants.js";
import { authService } from "../modules/auth/auth.service.js";

export const startAuthConsumer = async (): Promise<void> => {
  const consumer = kafka.consumer({ groupId: AUTH_CONSTANTS.KAFKA.CONSUMER_GROUP_ID });

  try {
    await consumer.connect();
    await consumer.subscribe({
      topic: AUTH_CONSTANTS.KAFKA.TOPICS.USER_REGISTERED,
      fromBeginning: true,
    });

    console.log(`Kafka Auth Consumer subscribed to topic: ${AUTH_CONSTANTS.KAFKA.TOPICS.USER_REGISTERED}`);

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const payloadString = message.value?.toString();
        if (!payloadString) return;

        try {
          const payload = JSON.parse(payloadString);
          console.log(`Received user.registered event for user ID: ${payload.id}`);
          await authService.sendWelcomeEmail(payload);
        } catch (err: any) {
          console.error("Error processing registration consumer message:", err.message);
        }
      },
    });
  } catch (error: any) {
    console.warn(`Failed to start Kafka Auth Consumer. Worker consumer running in fallback/disabled mode: ${error.message}`);
  }
};
