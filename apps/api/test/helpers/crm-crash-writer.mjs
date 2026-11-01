import '../require-isolated-db.mjs';
import { connectDB } from '../../dist/db.js';
import { withCrmWriter } from '../../dist/services/crm-writer.service.js';
await connectDB();
await withCrmWriter(async () => { process.stdout.write('CRM_OWNED_WRITER_CLAIMED\n'); await new Promise(() => {}); });
