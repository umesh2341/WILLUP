import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import chatRoutes from './routes/chat';
import ticketRoutes from './routes/tickets';
import adminRoutes from './routes/admin';
import knowledgeRoutes from './routes/knowledge';
import userRoutes from './routes/users';
import { initQueue } from './queue';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'WILLUP Backend',
    timestamp: new Date().toISOString(),
  });
});

import { requireAuth } from './middleware/auth';
import { prisma } from './prisma';

// Mount routes
app.get('/api/workflows', requireAuth, async (_req: Request, res: Response) => {
  try {
    const workflows = await prisma.workflowDefinition.findMany({
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: { role: true },
        },
      },
    });
    res.json({ workflows });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/audit/:ticketId', requireAuth, async (req: Request, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { ticketId: req.params.ticketId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.use('/api/chat', chatRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/users', userRoutes);

import { startEscalationWorker } from './workflow/escalationJob';
import { startCollectiveDispatchWorker } from './workflow/collectiveDispatchJob';

const isMain = process.argv[1] && (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js') || process.argv[1].endsWith('index'));

if (isMain) {
  app.listen(PORT, () => {
    console.log(`WILLUP Backend running on http://localhost:${PORT}`);
  });

  // Start queue workers — non-fatal if pg-boss can't connect
  initQueue()
    .then(async () => {
      await startEscalationWorker();
      await startCollectiveDispatchWorker();
      console.log('[Queue] Escalation and collective dispatch workers started');
    })
    .catch((err) => {
      console.error('[Queue] pg-boss failed to start (escalation disabled):', err.message);
    });
}


export default app;
