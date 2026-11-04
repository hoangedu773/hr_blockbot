import { Router } from 'express';
import { z } from 'zod';
import { ScheduleDateSchema } from '@hr-blockbot/contracts';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { endpoint } from '../lib/endpoint.js';
import { WorkflowError } from '../services/project-workflow.service.js';
import * as schedules from '../services/scheduling.service.js';

const router = Router();
router.use('/scheduling', authenticateToken);
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => { const value = schema.safeParse(input); if (!value.success) throw new WorkflowError(400, 'VALIDATION_FAILED', 'Nội dung hoặc phiên bản không hợp lệ.'); return value.data; };
const version = z.object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(5).max(500) }).strict();
router.get('/scheduling/access', endpoint(async (req, res) => { res.json(schedules.schedulingAccess(req.user!)); }));
router.get('/scheduling/stores/:storeId/shifts', endpoint(async (req, res) => { res.json(await schedules.listShifts(req.user!, req.params.storeId)); }));
router.post('/scheduling/stores/:storeId/shifts', endpoint(async (req, res) => {
  const body = parse(z.object({ expectedVersion: z.number().int().nonnegative(), definition: z.unknown() }).strict(), req.body);
  res.json(await schedules.saveShift(req.user!, req.params.storeId, body.definition, body.expectedVersion));
}));
router.get('/scheduling/stores/:storeId/roster', endpoint(async (req, res) => { res.json(await schedules.scheduleRoster(req.user!, req.params.storeId)); }));
router.get('/scheduling/stores/:storeId/week', endpoint(async (req, res) => {
  const query = parse(z.object({ weekStart: ScheduleDateSchema }).strict(), req.query);
  res.json(await schedules.getStoreWeek(req.user!, req.params.storeId, query.weekStart));
}));
router.post('/scheduling/stores/:storeId/weeks', endpoint(async (req, res) => {
  const body = parse(z.object({ weekStart: ScheduleDateSchema }).strict(), req.body);
  res.json(await schedules.createWeek(req.user!, req.params.storeId, body.weekStart));
}));
router.post('/scheduling/weeks/:weekId/draft', endpoint(async (req, res) => { res.json(await schedules.saveDraft(req.user!, req.params.weekId, req.body)); }));
router.post('/scheduling/weeks/:weekId/publish', endpoint(async (req, res) => {
  const body = parse(version, req.body); res.json(await schedules.publishWeek(req.user!, req.params.weekId, body.expectedVersion, body.reason));
}));
router.post('/scheduling/weeks/:weekId/retry-notices', endpoint(async (req, res) => { parse(z.object({}).strict(), req.body); res.json(await schedules.retryScheduleNotices(req.user!, req.params.weekId)); }));
router.get('/scheduling/me', endpoint(async (req, res) => {
  const query = parse(z.object({ from: ScheduleDateSchema, to: ScheduleDateSchema }).strict(), req.query);
  res.json(await schedules.personalSchedule(req.user!, query.from, query.to, true));
}));
router.get('/scheduling/weeks/:weekId/partners', endpoint(async (req, res) => { res.json(await schedules.schedulePartners(req.user!, req.params.weekId)); }));
router.post('/scheduling/weeks/:weekId/changes', endpoint(async (req, res) => { res.json(await schedules.createScheduleChange(req.user!, req.params.weekId, req.body)); }));
router.post('/scheduling/weeks/:weekId/changes/:changeId', endpoint(async (req, res) => { res.json(await schedules.actScheduleChange(req.user!, req.params.weekId, req.params.changeId, req.body)); }));
const registrationWeek = z.object({ weekStart: ScheduleDateSchema }).strict();
router.get('/scheduling/registrations/me', endpoint(async (req, res) => {
  const { weekStart } = parse(registrationWeek, req.query);
  res.json(await schedules.listScheduleRegistrations(req.user!, weekStart));
}));
router.get('/scheduling/stores/:storeId/registrations', endpoint(async (req, res) => {
  const { weekStart } = parse(registrationWeek, req.query);
  res.json(await schedules.listScheduleRegistrations(req.user!, weekStart, req.params.storeId));
}));
router.post('/scheduling/registrations', endpoint(async (req, res) => {
  res.json(await schedules.createScheduleRegistration(req.user!, req.body));
}));
router.post('/scheduling/stores/:storeId/registrations', endpoint(async (req, res) => {
  res.json(await schedules.createScheduleRegistration(req.user!, req.body, req.params.storeId));
}));
router.post('/scheduling/stores/:storeId/registrations/:requestId', endpoint(async (req, res) => {
  const requestId = parse(z.string().uuid(), req.params.requestId).toLowerCase();
  res.json(await schedules.actScheduleRegistration(req.user!, req.params.storeId, requestId, req.body));
}));
export default router;
