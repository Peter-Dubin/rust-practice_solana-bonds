import { MongoClient, Db } from "mongodb";

// Cache a single MongoClient promise. In development we stash it on globalThis so
// Next.js hot-reload doesn't open a new connection on every edit (connection storms).
// In production we create a fresh client per server instance.

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local.");
}

const options = {};

let clientPromise: Promise<MongoClient>;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = new MongoClient(uri, options).connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  clientPromise = new MongoClient(uri, options).connect();
}

/** Resolve the shared client. */
export async function getClient(): Promise<MongoClient> {
  return clientPromise;
}

/**
 * Resolve the application database. The db name embedded in MONGODB_URI is used;
 * if none is present, the driver falls back to "test", so prefer a URI with a db.
 */
export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db();
}

export default clientPromise;
