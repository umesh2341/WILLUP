import { Ticket, TicketStatus, CollectiveGroup } from "@prisma/client";
import { prisma } from "../prisma";
import { boss } from "../queue";
import { ESCALATION_JOB_NAME } from "./escalationJob";

export async function assignToStage(ticketId: string, stageOrder: number, isEscalation: boolean = false): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { student: true }
  });

  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  // 1. Look up WorkflowDefinition for the ticket's domain
  const wfDef = await prisma.workflowDefinition.findUnique({
    where: { domain: ticket.domain },
    include: {
      stages: {
        orderBy: { order: 'asc' },
        include: { role: true }
      }
    }
  });

  if (!wfDef || wfDef.stages.length === 0) {
    throw new Error(`No workflow definition found for domain ${ticket.domain}`);
  }

  // 2. Resolve the WorkflowStage at the given order
  let targetStage = wfDef.stages.find(s => s.order === stageOrder);
  
  if (!targetStage) {
    throw new Error(`Stage order ${stageOrder} not found in workflow for ${ticket.domain}`);
  }

  // 3. Apply the redirectIfSubjectIsRole conflict-of-interest check
  const extractedData = ticket.extractedData as any;
  const subjectRole = extractedData?.subjectRole || extractedData?.targetRole;

  if (targetStage.redirectIfSubjectIsRole && subjectRole && targetStage.redirectIfSubjectIsRole === subjectRole) {
    console.log(`[Workflow] Conflict of interest detected for role ${subjectRole}. Skipping stage ${stageOrder}.`);
    return assignToStage(ticketId, stageOrder + 1, isEscalation);
  }

  // 4. Set ticket.currentStageId
  await prisma.ticket.update({
    where: { id: ticketId },
    data: { 
      currentStageId: targetStage.id,
      status: isEscalation ? TicketStatus.ESCALATED : TicketStatus.IN_WORKFLOW,
      currentNodeKey: targetStage.role.name,
      lastAction: isEscalation ? "AUTO_ESCALATED" : "ROUTED"
    }
  });

  // 5. Find all Users via RoleAssignment for that stage's Role
  const assignees = await prisma.roleAssignment.findMany({
    where: { roleId: targetStage.roleId },
    include: { user: true }
  });

  // 6. Insert a Notification row for each of them
  if (assignees.length > 0) {
    const notifications = assignees.map(assignment => ({
      userId: assignment.userId,
      ticketId: ticketId,
      message: `New ticket assigned to your role (${targetStage!.role.name}): Ticket ${ticketId}`,
      read: false
    }));

    await prisma.notification.createMany({
      data: notifications
    });
  }

  // 7. Write an AuditLog entry
  await prisma.auditLog.create({
    data: {
      ticketId: ticketId,
      actor: "AI:WorkflowEngine",
      action: isEscalation ? "AUTO_ESCALATED" : "ROUTED",
      details: {
        stageId: targetStage.id,
        stageOrder: targetStage.order,
        roleAssigned: targetStage.role.name
      }
    }
  });

  // 8. Start the escalation timer job
  if (targetStage.role.escalationMinutes !== null) {
    const delaySeconds = targetStage.role.escalationMinutes * 60;
    if (delaySeconds >= 0) {
      await boss.send(
        ESCALATION_JOB_NAME, 
        { ticketId, stageOrder, stageId: targetStage.id }, 
        { startAfter: delaySeconds }
      );
      console.log(`[Workflow] Scheduled escalation check for ticket ${ticketId} in ${delaySeconds}s`);
    }
  }
}

export async function assignGroupToStage(groupId: string, stageOrder: number, isEscalation: boolean = false): Promise<void> {
  const group = await prisma.collectiveGroup.findUnique({
    where: { id: groupId },
    include: { tickets: true }
  });

  if (!group || group.tickets.length === 0) throw new Error(`Group ${groupId} not found or empty`);

  const wfDef = await prisma.workflowDefinition.findUnique({
    where: { domain: group.domain },
    include: {
      stages: {
        orderBy: { order: 'asc' },
        include: { role: true }
      }
    }
  });

  if (!wfDef || wfDef.stages.length === 0) {
    throw new Error(`No workflow definition found for domain ${group.domain}`);
  }

  let targetStage = wfDef.stages.find(s => s.order === stageOrder);
  
  if (!targetStage) {
    throw new Error(`Stage order ${stageOrder} not found in workflow for ${group.domain}`);
  }

  // Apply redirect check based on the first ticket (assume homogeneous)
  const firstTicketData = group.tickets[0].extractedData as any;
  const subjectRole = firstTicketData?.subjectRole || firstTicketData?.targetRole;

  if (targetStage.redirectIfSubjectIsRole && subjectRole && targetStage.redirectIfSubjectIsRole === subjectRole) {
    console.log(`[Workflow] Conflict of interest detected for role ${subjectRole}. Skipping stage ${stageOrder}.`);
    return assignGroupToStage(groupId, stageOrder + 1, isEscalation);
  }

  // Update ALL tickets
  await prisma.ticket.updateMany({
    where: { collectiveGroupId: groupId },
    data: {
      currentStageId: targetStage.id,
      status: isEscalation ? TicketStatus.ESCALATED : TicketStatus.IN_WORKFLOW,
      currentNodeKey: targetStage.role.name,
      lastAction: isEscalation ? "AUTO_ESCALATED" : "ROUTED_COLLECTIVE"
    }
  });

  const assignees = await prisma.roleAssignment.findMany({
    where: { roleId: targetStage.roleId },
    include: { user: true }
  });

  if (assignees.length > 0) {
    // Notify assignees (one notification per group to avoid spam, but they need a link. 
    // We'll notify them about the first ticket or the group. The spec says group workflows aren't fully fleshed out in UI yet.)
    // Let's just create a notification for the first ticket.
    const notifications = assignees.map(assignment => ({
      userId: assignment.userId,
      ticketId: group.tickets[0].id, // fallback link
      message: `New Collective Group (${group.category}) assigned to your role (${targetStage!.role.name}) with ${group.tickets.length} reports.`,
      read: false
    }));

    await prisma.notification.createMany({ data: notifications });
  }

  // Notify students and audit logs
  for (const ticket of group.tickets) {
    await prisma.notification.create({
      data: {
        userId: ticket.studentId,
        ticketId: ticket.id,
        message: `Grouped with ${group.tickets.length - 1} similar reports, sent to ${targetStage!.role.name}`,
        read: false
      }
    });

    await prisma.auditLog.create({
      data: {
        ticketId: ticket.id,
        actor: "AI:WorkflowEngine",
        action: isEscalation ? "AUTO_ESCALATED" : "ROUTED_COLLECTIVE",
        details: {
          groupId: group.id,
          stageId: targetStage.id,
          stageOrder: targetStage.order,
          roleAssigned: targetStage.role.name
        }
      }
    });
  }

  // Start escalation timer for the group
  if (targetStage.role.escalationMinutes !== null) {
    const delaySeconds = targetStage.role.escalationMinutes * 60;
    if (delaySeconds >= 0) {
      await boss.send(
        ESCALATION_JOB_NAME, 
        { groupId, stageOrder, stageId: targetStage.id }, 
        { startAfter: delaySeconds }
      );
      console.log(`[Workflow] Scheduled collective escalation check for group ${groupId} in ${delaySeconds}s`);
    }
  }
}
