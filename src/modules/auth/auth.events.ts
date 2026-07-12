import { getProducer } from "../../config/kafka.js";
import { AUTH_CONSTANTS } from "./auth.constants.js";

export class AuthEvents {
  public async emitUserRegistered(user: { id: string; email: string; firstName: string; lastName: string }): Promise<void> {
    try {
      const producer = getProducer();
      await producer.send({
        topic: AUTH_CONSTANTS.KAFKA.TOPICS.USER_REGISTERED,
        messages: [
          {
            key: user.id,
            value: JSON.stringify({
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      });
      console.log(`Published user registration event for user ID: ${user.id}`);
    } catch (error) {
      console.error("Failed to publish user registration event to Kafka:", error);
    }
  }
}

export const authEvents = new AuthEvents();
export default authEvents;
