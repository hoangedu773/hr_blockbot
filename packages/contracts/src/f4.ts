import { z } from "zod";
export const F4_MODEL = "vinai/phobert-base";
export const F4_REVISION = "01daacda68afe13d83023d16ec647239e344a1e6";
const unit = z.number().finite().min(0).max(1);
const skill = z.string().trim().min(1).max(100);
export const F4PairSchema = z.object({ required: skill, matched: skill.nullable(), cosine: unit }).strict();
export const F4InternalRequestSchema = z.object({
  requestId: z.string().uuid(), requiredSkills: z.array(skill).min(1).max(30), description: z.string().max(10000),
  candidates: z.array(z.object({ id: z.string().regex(/^c\d+$/), skills: z.array(skill).max(30) }).strict()).min(1).max(200),
}).strict();
export const F4InternalResponseSchema = z.object({ requestId: z.string().uuid(), model: z.literal(F4_MODEL), revision: z.literal(F4_REVISION),
  items: z.array(z.object({ id: z.string().regex(/^c\d+$/), semanticScore: unit, pairs: z.array(F4PairSchema).max(30) }).strict()).max(200),
}).strict();
export type F4InternalRequest = z.infer<typeof F4InternalRequestSchema>;
export const F4CandidateSchema = z.object({
  employeeId: z.string().regex(/^[a-f0-9]{24}$/), fullName: z.string(), skills: z.array(skill).max(30), activeLoad: z.number().int().nonnegative(), incomingReservations: z.number().int().nonnegative(),
  skillScore: unit, semanticScore: unit.nullable(), suitabilityScore: z.number().finite().min(0).max(100).nullable(), kpi: z.null(),
  matchedSkills: z.array(skill), missingSkills: z.array(skill), semanticEvidence: z.array(F4PairSchema), explanation: z.string(), missingData: z.array(z.string()),
}).strict();
export const F4SuggestionsSchema = z.object({ items: z.array(F4CandidateSchema).max(10), candidatesConsidered: z.number().int().nonnegative(), advisoryOnly: z.literal(true),
  status: z.enum(["READY", "INSUFFICIENT_DATA", "MODEL_UNAVAILABLE", "CAPACITY_EXCEEDED"]), source: z.enum(["BASELINE_EXACT", "PHOBERT", "BASELINE_FALLBACK", "MANUAL"]),
  model: z.literal(F4_MODEL).nullable(), revision: z.literal(F4_REVISION).nullable(), semanticWeight: unit.nullable(),
  projectVersion: z.number().int().positive(), generatedAt: z.string().datetime(), warning: z.string(),
}).strict();
export type F4Suggestions = z.infer<typeof F4SuggestionsSchema>;
