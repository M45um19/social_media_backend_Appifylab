import { getProducer } from "../../config/kafka.js";
import { POSTS_CONSTANTS } from "./posts.constants.js";

export class PostsEvents {
  public async emitPostCreated(post: {
    id: string;
    userId: string;
    mediaUrls?: string[];
  }): Promise<void> {
    try {
      const producer = getProducer();
      await producer.send({
        topic: POSTS_CONSTANTS.KAFKA.TOPICS.POST_CREATED,
        messages: [
          {
            key: post.id,
            value: JSON.stringify({
              postId: post.id,
              userId: post.userId,
              mediaUrls: post.mediaUrls || [],
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      });
      console.log(`Published post creation event for post ID: ${post.id}`);
    } catch (error) {
      console.error("Failed to publish post creation event to Kafka:", error);
    }
  }
}

export const postsEvents = new PostsEvents();
export default postsEvents;
