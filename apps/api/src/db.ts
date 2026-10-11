import mongoose from "mongoose";

export function getMongoUri(): string {
  const uri = process.env.MONGODB_URI || process.env.ATLAS_URI;
  if (!uri || uri.trim() === "") {
    throw new Error(
      "MongoDB URI is not configured. Please set MONGODB_URI or ATLAS_URI in environment variables."
    );
  }
  return uri.trim();
}

export async function connectDB(): Promise<typeof mongoose> {
  const uri = getMongoUri();
  try {
    const conn = await mongoose.connect(uri);
    console.log(`[MongoDB] Connected successfully to: ${conn.connection.name}`);
    return conn;
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message.replace(/\/\/[^@]+@/, "//***:***@")
        : "Database connection failed";
    console.error("[MongoDB] Connection failed:", msg);
    throw new Error("Failed to connect to MongoDB");
  }
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
