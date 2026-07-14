import { Kafka, KafkaConfig, Producer } from "kafkajs";
import { env } from "./env.js";

const brokers = env.KAFKA_SERVICE_URI
  ? [env.KAFKA_SERVICE_URI]
  : (env.KAFKA_BROKERS ? env.KAFKA_BROKERS.split(",") : ["127.0.0.1:9092"]);

const kafkaConfig: KafkaConfig = {
  clientId: env.KAFKA_CLIENT_ID,
  brokers,
};

if (env.KAFKA_USER && env.KAFKA_PASSWORD) {
  kafkaConfig.ssl = {
    rejectUnauthorized: false,
  };
  kafkaConfig.sasl = {
    mechanism: "scram-sha-256",
    username: env.KAFKA_USER,
    password: env.KAFKA_PASSWORD,
  };
}

export const kafka = new Kafka(kafkaConfig);

export const waitForKafka = async (retries = 10, delayMs = 3000): Promise<boolean> => {
  const admin = kafka.admin();
  for (let i = 0; i < retries; i++) {
    try {
      await admin.connect();
      await admin.disconnect();
      return true;
    } catch (err: any) {
      console.log(`Waiting for Kafka connection readiness... (Attempt ${i + 1}/${retries}). Error: ${err.message}`);
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  return false;
};

let producer: Producer | null = null;

export const connectProducer = async (): Promise<Producer> => {
  if (producer) return producer;
  
  const isReady = await waitForKafka(5, 3000);
  if (!isReady) {
    console.warn("Kafka was not ready. Starting producer in fallback/disabled mock mode.");
    producer = {
      connect: async () => {},
      disconnect: async () => {},
      send: async (record: any) => {
        console.log(`[MOCK KAFKA PRODUCER] Publish to ${record.topic}:`, JSON.stringify(record.messages));
        return [];
      },
    } as unknown as Producer;
    return producer;
  }

  const actualProducer = kafka.producer();
  try {
    await actualProducer.connect();
    producer = actualProducer;
    console.log("Kafka Producer Connected");
  } catch (error) {
    console.warn("Kafka Producer connection failed. Event publishing will be mocked/disabled.");
    // Create a mock producer so the application doesn't crash on outbound events if Kafka is down
    producer = {
      connect: async () => {},
      disconnect: async () => {},
      send: async (record: any) => {
        console.log(`[MOCK KAFKA PRODUCER] Publish to ${record.topic}:`, JSON.stringify(record.messages));
        return [];
      },
    } as unknown as Producer;
  }
  return producer;
};

export const getProducer = (): Producer => {
  if (!producer) {
    throw new Error("Kafka producer not initialized. Call connectProducer() first.");
  }
  return producer;
};
