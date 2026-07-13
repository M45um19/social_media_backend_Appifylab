import { kafka } from "../config/kafka.js";
import { POSTS_CONSTANTS } from "../modules/posts/posts.constants.js";
import { Like } from "../modules/posts/likes.model.js";
import { Post } from "../modules/posts/posts.model.js";
import { Comment } from "../modules/posts/comments.model.js";
import { uuidv7 } from "../utils/uuid.js";

interface ILikeEvent {
  postId: string;
  userId: string;
  action: "like" | "unlike";
}

interface ICommentEvent {
  commentId: string;
  postId: string;
  userId: string;
  content: string;
  parentId?: string | null;
}

let likesBuffer: ILikeEvent[] = [];
let flushTimeout: NodeJS.Timeout | null = null;

let commentsBuffer: ICommentEvent[] = [];
let commentsFlushTimeout: NodeJS.Timeout | null = null;

const flushLikes = async (): Promise<void> => {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }

  if (likesBuffer.length === 0) return;

  const currentBuffer = [...likesBuffer];
  likesBuffer = [];

  console.log(`[Kafka Posts Consumer] Flushing ${currentBuffer.length} like/unlike events to MongoDB...`);

  const netLikesMap = new Map<string, number>();

  const bulkOps = currentBuffer.map((event) => {
    const change = event.action === "like" ? 1 : -1;
    netLikesMap.set(event.postId, (netLikesMap.get(event.postId) || 0) + change);

    if (event.action === "like") {
      return {
        updateOne: {
          filter: { postId: event.postId, userId: event.userId },
          update: { $setOnInsert: { _id: uuidv7() } },
          upsert: true,
        },
      };
    } else {
      return {
        deleteOne: {
          filter: { postId: event.postId, userId: event.userId },
        },
      };
    }
  });

  const postBulkOps = Array.from(netLikesMap.entries()).map(([postId, change]) => ({
    updateOne: {
      filter: { _id: postId },
      update: { $inc: { likesCount: change } },
    },
  }));

  try {
    await Like.bulkWrite(bulkOps);
    if (postBulkOps.length > 0) {
      await Post.bulkWrite(postBulkOps);
    }
    console.log(`[Kafka Posts Consumer] Successfully synced ${bulkOps.length} likes/unlikes and counters to MongoDB.`);
  } catch (error: any) {
    console.error("[Kafka Posts Consumer] Failed to sync likes buffer to MongoDB:", error.message);
  }
};

const flushComments = async (): Promise<void> => {
  if (commentsFlushTimeout) {
    clearTimeout(commentsFlushTimeout);
    commentsFlushTimeout = null;
  }

  if (commentsBuffer.length === 0) return;

  const currentBuffer = [...commentsBuffer];
  commentsBuffer = [];

  console.log(`[Kafka Posts Consumer] Flushing commentsCount increments for ${currentBuffer.length} comment events to MongoDB...`);

  const postCommentsCountMap = new Map<string, number>();
  for (const event of currentBuffer) {
    postCommentsCountMap.set(event.postId, (postCommentsCountMap.get(event.postId) || 0) + 1);
  }

  const postOps = Array.from(postCommentsCountMap.entries()).map(([postId, increment]) => ({
    updateOne: {
      filter: { _id: postId },
      update: { $inc: { commentsCount: increment } },
    },
  }));

  try {
    if (postOps.length > 0) {
      await Post.bulkWrite(postOps);
    }
    console.log(`[Kafka Posts Consumer] Successfully synced ${postOps.length} comment counters to MongoDB.`);
  } catch (error: any) {
    console.error("[Kafka Posts Consumer] Failed to flush comments buffer to MongoDB:", error.message);
  }
};

export const startPostsConsumer = async (): Promise<void> => {
  const consumer = kafka.consumer({ groupId: POSTS_CONSTANTS.KAFKA.CONSUMER_GROUP_ID });

  try {
    await consumer.connect();
    await consumer.subscribe({
      topic: POSTS_CONSTANTS.KAFKA.TOPICS.POST_LIKED,
      fromBeginning: true,
    });
    await consumer.subscribe({
      topic: POSTS_CONSTANTS.KAFKA.TOPICS.POST_CREATED,
      fromBeginning: true,
    });
    await consumer.subscribe({
      topic: POSTS_CONSTANTS.KAFKA.TOPICS.POST_COMMENTED,
      fromBeginning: true,
    });

    console.log(`Kafka Posts Consumer subscribed to topics: ${POSTS_CONSTANTS.KAFKA.TOPICS.POST_LIKED}, ${POSTS_CONSTANTS.KAFKA.TOPICS.POST_CREATED}, ${POSTS_CONSTANTS.KAFKA.TOPICS.POST_COMMENTED}`);

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const payloadString = message.value?.toString();
        if (!payloadString) return;

        try {
          const payload = JSON.parse(payloadString);

          if (topic === POSTS_CONSTANTS.KAFKA.TOPICS.POST_CREATED) {
            console.log(`[Kafka Posts Consumer] Received POST_CREATED event:`, payload);
          } else if (topic === POSTS_CONSTANTS.KAFKA.TOPICS.POST_LIKED) {
            likesBuffer.push(payload as ILikeEvent);

            if (likesBuffer.length >= 10000) {
              await flushLikes();
            } else if (!flushTimeout) {
              flushTimeout = setTimeout(async () => {
                await flushLikes();
              }, 5 * 60 * 1000); // 5 minutes
            }
          } else if (topic === POSTS_CONSTANTS.KAFKA.TOPICS.POST_COMMENTED) {
            commentsBuffer.push(payload as ICommentEvent);

            if (commentsBuffer.length >= 10000) {
              await flushComments();
            } else if (!commentsFlushTimeout) {
              commentsFlushTimeout = setTimeout(async () => {
                await flushComments();
              }, 5 * 60 * 1000); // 5 minutes
            }
          }
        } catch (err: any) {
          console.error(`Error parsing posts consumer message payload on topic ${topic}:`, err.message);
        }
      },
    });

    // Ensure clean flushing of any buffered likes and comments on process termination
    process.on("SIGINT", async () => {
      await Promise.all([flushLikes(), flushComments()]);
    });
    process.on("SIGTERM", async () => {
      await Promise.all([flushLikes(), flushComments()]);
    });

  } catch (error: any) {
    console.warn(`Failed to start Kafka Posts Consumer. Worker consumer running in fallback/disabled mode: ${error.message}`);
  }
};
