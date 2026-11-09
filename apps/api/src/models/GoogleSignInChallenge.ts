import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  _id: { type: String, required: true },
  userId: { type: String, default: null },
  sessionId: { type: String, default: null },
  securityVersion: { type: Number, default: null },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { collection: "google_sign_in_challenges", versionKey: false });

export const GoogleSignInChallengeModel = mongoose.model("GoogleSignInChallenge", schema);
