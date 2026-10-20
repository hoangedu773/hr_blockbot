import mongoose, { Schema, Document } from "mongoose";

export const SETTINGS_ID = "llm";

export type LLMProviderType = "openai_compatible" | "gemini" | "anthropic";

export interface ILLMProviderRecord {
  id: string;
  name: string;
  type: LLMProviderType;
  baseUrl: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  priority: number;
  enabled: boolean;
  /** AES-256-GCM blob (see crypto.service). NEVER returned to clients. */
  keyCipher?: string | null;
  /** Last 4 characters of the plaintext key, for Admin recognition only. */
  keyHint?: string | null;
  lastTestAt?: Date | null;
  lastTestOk?: boolean | null;
  lastTestError?: string | null;
}

export interface ISettingsAuditEntry {
  actor: string;
  at: Date;
  changedFields: string[];
  configVersion: number;
}

export interface ISettings {
  _id: string;
  configVersion: number;
  providers: ILLMProviderRecord[];
  updatedBy?: string | null;
  updatedAt?: Date;
  audit: ISettingsAuditEntry[];
}

const LLMProviderRecordSchema = new Schema<ILLMProviderRecord>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ["openai_compatible", "gemini", "anthropic"],
      required: true,
    },
    baseUrl: { type: String, required: true },
    model: { type: String, required: true },
    maxTokens: { type: Number, required: true },
    timeoutMs: { type: Number, required: true },
    priority: { type: Number, required: true },
    enabled: { type: Boolean, required: true },
    keyCipher: { type: String, default: null },
    keyHint: { type: String, default: null },
    lastTestAt: { type: Date, default: null },
    lastTestOk: { type: Boolean, default: null },
    lastTestError: { type: String, default: null },
  },
  { _id: false }
);

const SettingsAuditEntrySchema = new Schema<ISettingsAuditEntry>(
  {
    actor: { type: String, required: true },
    at: { type: Date, default: Date.now },
    changedFields: { type: [String], default: [] },
    configVersion: { type: Number, required: true },
  },
  { _id: false }
);

const SettingsSchema = new Schema<ISettings>(
  {
    _id: { type: String, default: SETTINGS_ID },
    configVersion: { type: Number, default: 0 },
    providers: { type: [LLMProviderRecordSchema], default: [] },
    updatedBy: { type: String, default: null },
    updatedAt: { type: Date, default: Date.now },
    // Bounded audit trail (ADR-017 bullet 3): last 20 changes only.
    audit: { type: [SettingsAuditEntrySchema], default: [] },
  },
  {
    collection: "settings",
    timestamps: false,
    versionKey: false,
  }
);

export const SettingsModel: mongoose.Model<ISettings> =
  (mongoose.models.Settings as mongoose.Model<ISettings>) ||
  mongoose.model<ISettings>("Settings", SettingsSchema);
