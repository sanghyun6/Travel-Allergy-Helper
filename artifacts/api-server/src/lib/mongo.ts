import { MongoClient, type Collection, type Db } from "mongodb";
import { logger } from "./logger";

export interface HistoryDoc {
  _id?: string;
  sessionId: string;
  deviceId: string;
  menuLanguage: string;
  items: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

let clientPromise: Promise<MongoClient> | null = null;
let cachedDb: Db | null = null;

function getClient(): Promise<MongoClient> {
  if (clientPromise) return clientPromise;
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 10,
  });
  clientPromise = client.connect().then((c) => {
    logger.info({ msg: "MongoDB connected" });
    return c;
  });
  return clientPromise;
}

export async function getHistoryCollection(): Promise<Collection<HistoryDoc>> {
  const client = await getClient();
  if (!cachedDb) {
    cachedDb = client.db(process.env.MONGODB_DB || "menu_scanner");
    const col = cachedDb.collection<HistoryDoc>("history");
    await col.createIndex({ deviceId: 1, updatedAt: -1 });
    await col.createIndex({ sessionId: 1 }, { unique: true });
  }
  return cachedDb.collection<HistoryDoc>("history");
}
