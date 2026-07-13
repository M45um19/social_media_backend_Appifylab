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

  public async emitPostLiked(event: {
    postId: string;
    userId: string;
    action: "like" | "unlike";
  }): Promise<void> {
    try {
      const producer = getProducer();
      await producer.send({
        topic: POSTS_CONSTANTS.KAFKA.TOPICS.POST_LIKED,
        messages: [
          {
            key: event.postId,
            value: JSON.stringify({
              postId: event.postId,
              userId: event.userId,
              action: event.action,
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      });
      console.log(`Published post-liked event: Post=${event.postId}, User=${event.userId}, Action=${event.action}`);
    } catch (error) {
      console.error("Failed to publish post liked event to Kafka:", error);
    }
  }

  public async emitPostCommented(event: {
    commentId: string;
    postId: string;
    userId: string;
    content: string;
    parentId?: string | null;
  }): Promise<void> {
    try {
      const producer = getProducer();
      await producer.send({
        topic: POSTS_CONSTANTS.KAFKA.TOPICS.POST_COMMENTED,
        messages: [
          {
            key: event.postId,
            value: JSON.stringify({
              commentId: event.commentId,
              postId: event.postId,
              userId: event.userId,
              content: event.content,
              parentId: event.parentId,
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      });
      console.log(`Published post-commented event: Comment=${event.commentId}, Post=${event.postId}`);
    } catch (error) {
      console.error("Failed to publish post commented event to Kafka:", error);
    }
  }
}

export const postsEvents = new PostsEvents();
export default postsEvents;
