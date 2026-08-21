import { boss } from '../queue';
import { prisma } from '../prisma';
import { assignToStage } from './workflowEngine';
import { TicketStatus } from '@prisma/client';

export const ESCALATION_JOB_NAME = 'escalation-check';

export async function startEscalationWorker() {
  await boss.createQueue(ESCALATION_JOB_NAME);
  await boss.work(ESCALATION_JOB_NAME, async (jobs) => {
    for (const job of jobs as any[]) {
      const { ticketId, groupId, stageOrder, stageId } = job.data as { ticketId?: string, groupId?: string, stageOrder: number, stageId: string };
      
      if (groupId) {
        console.log(`[EscalationJob] Worker picked up job for group: ${groupId}`);
        const group = await prisma.collectiveGroup.findUnique({ where: { id: groupId }, include: { tickets: true } });
        if (!group) continue;
        
        // Filter tickets that are still stuck at this stage
        const tickets = group.tickets.filter(t => t.status === TicketStatus.IN_WORKFLOW && t.currentStageId === stageId);
        if (tickets.length === 0) continue;

        // Check if ANY ticket in the group was approved for this stage
        const ticketIds = tickets.map(t => t.id);
        const approval = await prisma.approval.findFirst({
          where: { ticketId: { in: ticketIds }, stageId }
        });
        if (approval) continue;

        console.log(`[EscalationJob] Group ${groupId} timed out at stage order ${stageOrder}. Auto-escalating.`);

        await prisma.ticket.updateMany({
          where: { id: { in: ticketIds } },
          data: { status: TicketStatus.ESCALATED, lastAction: "AUTO_ESCALATED" }
        });

        for (const tid of ticketIds) {
          await prisma.auditLog.create({
            data: {
              ticketId: tid,
              actor: "AI:EscalationJob",
              action: "AUTO_ESCALATED",
              details: { reason: "timeout", stageId, stageOrder, groupId }
            }
          });
        }

        try {
          // I need to import assignGroupToStage at the top of the file.
          const { assignGroupToStage } = require('./workflowEngine');
          await assignGroupToStage(groupId, stageOrder + 1, true);
        } catch (err: any) {
          if (err.message && err.message.includes("not found in workflow")) {
            console.log(`[EscalationJob] No next stage found for group ${groupId}. Marking as stuck.`);
            for (const ticket of tickets) {
              const currentData = ticket.extractedData as any;
              await prisma.ticket.update({
                where: { id: ticket.id },
                data: { extractedData: { ...currentData, isStuck: true } }
              });
            }
          } else {
            throw err;
          }
        }
      } else if (ticketId) {
        console.log(`[EscalationJob] Worker picked up job for ticket: ${ticketId}`);
        const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }});
        if (!ticket || ticket.status !== TicketStatus.IN_WORKFLOW || ticket.currentStageId !== stageId) {
          continue; // Already moved on, resolved, or manually escalated
        }

        // Check if there is an Approval row for this stage
        const approval = await prisma.approval.findFirst({
          where: { ticketId, stageId }
        });

        if (approval) {
          continue; // It was approved/rejected/escalated manually before timeout
        }

        console.log(`[EscalationJob] Ticket ${ticketId} timed out at stage order ${stageOrder}. Auto-escalating.`);

        // Time elapsed, no approval -> escalate
        await prisma.ticket.update({
          where: { id: ticketId },
          data: { status: TicketStatus.ESCALATED, lastAction: "AUTO_ESCALATED" }
        });

        await prisma.auditLog.create({
          data: {
            ticketId,
            actor: "AI:EscalationJob",
            action: "AUTO_ESCALATED",
            details: { reason: "timeout", stageId, stageOrder }
          }
        });

        try {
          const { assignToStage } = require('./workflowEngine');
          await assignToStage(ticketId, stageOrder + 1, true);
        } catch (err: any) {
          if (err.message && err.message.includes("not found in workflow")) {
            console.log(`[EscalationJob] No next stage found for ticket ${ticketId}. Marking as stuck.`);
            const currentData = ticket.extractedData as any;
            await prisma.ticket.update({
              where: { id: ticketId },
              data: {
                extractedData: { ...currentData, isStuck: true }
              }
            });
          } else {
            throw err;
          }
        }
      }
    }
  });
}
