import { boss } from '../queue';
import { prisma } from '../prisma';
import { assignGroupToStage } from './workflowEngine';
import { GroupStatus } from '@prisma/client';

export const COLLECTIVE_DISPATCH_JOB = 'collective-dispatch';

export async function processCollectiveDispatches() {
  console.log(`[CollectiveDispatch] Checking for closed collective windows...`);
  
  // 1. Find CollectiveGroups where status = COLLECTING AND windowEndsAt <= now()
  const groups = await prisma.collectiveGroup.findMany({
    where: {
      status: GroupStatus.COLLECTING,
      windowEndsAt: {
        lte: new Date()
      }
    },
    include: {
      tickets: true
    }
  });

  const dispatched = [];
  for (const group of groups) {
    if (group.tickets.length === 0) {
      await prisma.collectiveGroup.update({
        where: { id: group.id },
        data: { status: GroupStatus.DISPATCHED }
      });
      continue;
    }

    console.log(`[CollectiveDispatch] Dispatching group ${group.id} with ${group.tickets.length} tickets`);

    const summary: Record<string, string[]> = {};
    for (const ticket of group.tickets) {
      const data = ticket.extractedData as any;
      const room = data?.room || 'Unknown Room';
      if (!summary[group.category]) {
        summary[group.category] = [];
      }
      if (!summary[group.category].includes(room)) {
        summary[group.category].push(room);
      }
    }

    await prisma.collectiveGroup.update({
      where: { id: group.id },
      data: {
        status: GroupStatus.DISPATCHED,
        summary: summary
      }
    });

    await assignGroupToStage(group.id, 0);
    dispatched.push(group.id);
  }
  return dispatched;
}

export async function startCollectiveDispatchWorker() {
  await boss.createQueue(COLLECTIVE_DISPATCH_JOB);
  // Schedule it to run every minute
  await boss.schedule(COLLECTIVE_DISPATCH_JOB, '* * * * *');
  
  await boss.work(COLLECTIVE_DISPATCH_JOB, async (jobs) => {
    for (const job of jobs) {
      await processCollectiveDispatches();
    }
  });
}

