import mongoose, { Schema } from 'mongoose';

const conversation = new Schema({
  _id: { type: String, required: true }, userId: { type: Schema.Types.ObjectId, required: true },
  clientRequestId: { type: String, required: true }, title: { type: String, default: 'Hội thoại mới', maxlength: 100 },
  lastMessageAt: { type: Date, default: null }, pendingTurnId: { type: String, default: null },
  leaseToken: { type: String, default: null }, leaseUntil: { type: Date, default: null },
}, { collection: 'chat_conversations', strict: 'throw', timestamps: true });
conversation.index({ userId: 1, clientRequestId: 1 }, { unique: true });
conversation.index({ userId: 1, lastMessageAt: -1, _id: -1 });
const turn = new Schema({
  _id: { type: String, required: true }, conversationId: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, required: true }, clientMessageId: { type: String, required: true },
  userMessage: { type: String, required: true, maxlength: 2000 },
  status: { type: String, enum: ['QUEUED', 'PENDING', 'COMPLETED', 'FAILED', 'INTERRUPTED'], required: true },
  reply: { type: String, default: null, maxlength: 64000 }, citations: { type: [Schema.Types.Mixed], default: [] },
  evidence: { type: Schema.Types.Mixed, default: null }, leaseToken: { type: String, default: null },
}, { collection: 'chat_conversation_turns', strict: 'throw', timestamps: true });
turn.index({ conversationId: 1, clientMessageId: 1 }, { unique: true });
turn.index({ userId: 1, conversationId: 1, createdAt: -1, _id: -1 });
export const ChatConversationModel = mongoose.models.ChatConversation || mongoose.model('ChatConversation', conversation);
export const ChatTurnModel = mongoose.models.ChatTurn || mongoose.model('ChatTurn', turn);
