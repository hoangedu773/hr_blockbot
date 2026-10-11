import mongoose from "mongoose";

const DEFAULT_URI =
  "mongodb+srv://hr_admin:clajTXjKpf4O4HUh@hr-blockbot.a2gbplq.mongodb.net/hr_bot?retryWrites=true&w=majority&appName=hr-blockbot";

export async function connectDB(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI || DEFAULT_URI;
  try {
    const conn = await mongoose.connect(uri);
    console.log(`[MongoDB] Connected successfully to: ${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error("[MongoDB] Connection failed:", err);
    throw err;
  }
}
