import React, { useMemo, useEffect } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  Edge, 
  Node, 
  useNodesState, 
  useEdgesState, 
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant
} from '@xyflow/react';
import { motion } from 'framer-motion';
import { WorkflowNode, WorkflowNodeData, NodeVisualState } from './WorkflowNode';

const nodeTypes = {
  workflowNode: WorkflowNode,
};

// Domain default chains if backend stages are not yet loaded
const DOMAIN_CHAINS: Record<string, { role: string; escalationMinutes: number; summary: string }[]> = {
  HOSTEL_MAINTENANCE: [
    { role: 'Caretaker', escalationMinutes: 1, summary: 'Primary hostel facility inspection' },
    { role: 'Warden', escalationMinutes: 60, summary: 'Hostel block administrator approval' },
    { role: 'Superintendent', escalationMinutes: 120, summary: 'Senior campus administration' },
  ],
  LABORATORY: [
    { role: 'Lab Technician', escalationMinutes: 60, summary: 'Equipment slot & safety inspection' },
    { role: 'HOD', escalationMinutes: 240, summary: 'Department head final sign-off' },
  ],
  CERTIFICATE: [
    { role: 'Registrar', escalationMinutes: 120, summary: 'Academic verification & digital signature' },
  ],
  GRIEVANCE: [
    { role: 'Dean Students', escalationMinutes: 60, summary: 'Institutional grievance resolution' },
  ],
};

interface WorkflowCanvasProps {
  ticket: any;
  auditLogs?: any[];
  workflowStages?: any[];
  lockedViewport?: boolean;
  hideControls?: boolean;
}

const FlowInner: React.FC<WorkflowCanvasProps> = ({ 
  ticket, 
  auditLogs = [], 
  workflowStages = [],
  lockedViewport = false,
  hideControls = false,
}) => {

  const { fitView } = useReactFlow();

  const domain = ticket?.domain || 'HOSTEL_MAINTENANCE';
  const ticketStatus = ticket?.status || 'RECEIVED';
  const currentStageId = ticket?.currentStageId;
  const currentNodeKey = ticket?.currentNodeKey;

  const { initialNodes, initialEdges } = useMemo(() => {
    const rawStages = (workflowStages && workflowStages.length > 0)
      ? workflowStages
      : DOMAIN_CHAINS[domain]?.map((s, idx) => ({
          id: `static-stage-${idx}`,
          order: idx,
          role: { name: s.role, escalationMinutes: s.escalationMinutes },
          summary: s.summary
        })) || [];

    // Full sequence:
    // 0: Student Submission
    // 1: AI Agent Ingestion & Triage
    // 2..N: Domain Stages
    const allSteps: {
      id: string;
      label: string;
      roleName: string;
      stageOrder: number;
      isStudent?: boolean;
      isAI?: boolean;
      summary: string;
      escalationMinutes?: number | null;
      stageId?: string;
    }[] = [
      {
        id: 'step-student',
        label: 'Student Submission',
        roleName: 'Student',
        stageOrder: 0,
        isStudent: true,
        summary: 'Query initiated via multi-lingual chat',
      },
      {
        id: 'step-ai-triage',
        label: 'AI Agent Triage',
        roleName: 'AI:CategoryAgent',
        stageOrder: 1,
        isAI: true,
        summary: 'Intent, language & domain extraction',
      },
      ...rawStages.map((stage: any, idx: number) => ({
        id: stage.id || `stage-${stage.order || idx}`,
        label: `${stage.role?.name || stage.roleName || 'Approval'} Stage`,
        roleName: stage.role?.name || stage.roleName || 'Reviewer',
        stageOrder: idx + 2,
        stageId: stage.id,
        summary: stage.summary || `Assigned to ${stage.role?.name || 'staff'} pool`,
        escalationMinutes: stage.role?.escalationMinutes ?? 60,
      })),
    ];

    // Determine current active step index in the allSteps array
    let activeStepIdx = 2; // Default to first domain stage

    if (ticketStatus === 'RESOLVED') {
      activeStepIdx = allSteps.length; // All completed
    } else if (ticketStatus === 'QUEUED_COLLECTIVE') {
      activeStepIdx = 2; // Queued at Caretaker/first role
    } else if (ticketStatus === 'RECEIVED' || ticketStatus === 'CLASSIFIED') {
      activeStepIdx = 2;
    } else if (currentStageId) {
      const matchIdx = allSteps.findIndex(s => s.stageId === currentStageId);
      if (matchIdx !== -1) {
        activeStepIdx = matchIdx;
      }
    } else if (currentNodeKey) {
      const matchIdx = allSteps.findIndex(s => s.roleName.toLowerCase() === currentNodeKey.toLowerCase());
      if (matchIdx !== -1) {
        activeStepIdx = matchIdx;
      }
    }

    const isTicketEscalated = ticketStatus === 'ESCALATED';

    // Build Nodes
    const nodes: Node<WorkflowNodeData>[] = allSteps.map((step, idx) => {
      let state: NodeVisualState = 'future';

      if (idx < activeStepIdx) {
        state = 'completed';
      } else if (idx === activeStepIdx) {
        state = isTicketEscalated ? 'critical' : 'active';
      } else {
        state = 'future';
      }

      // If ticket is fully resolved, all stages are completed
      if (ticketStatus === 'RESOLVED') {
        state = 'completed';
      }

      // Calculate escalation deadline if active
      let escalationDeadline: number | null = null;
      if (state === 'active' || state === 'critical') {
        const baseTime = ticket?.updatedAt ? new Date(ticket.updatedAt).getTime() : Date.now();
        const cadenceMs = (step.escalationMinutes || 60) * 60 * 1000;
        escalationDeadline = baseTime + cadenceMs;
      }

      // Find audit log for completed steps
      const matchingAudit = auditLogs.find(a => 
        a.action === step.roleName || 
        a.actor === step.roleName ||
        (step.isAI && a.actor?.startsWith('AI:'))
      );

      const collectiveReportCount = 
        ticket?.collectiveGroup?.tickets?.length || 
        (ticket?.extractedData?.reportCount as number) || 
        (ticket?.reportCount as number) || 
        1;

      return {
        id: step.id,
        type: 'workflowNode',
        position: { x: idx * 300 + 40, y: 120 },
        data: {
          label: step.label,
          roleName: step.roleName,
          stageOrder: idx,
          state,
          domain,
          assigneeSummary: step.summary,
          actor: matchingAudit?.actor || (step.isStudent ? 'Student' : step.isAI ? 'Chat AI + Category AI' : undefined),
          actionTime: matchingAudit?.createdAt ? new Date(matchingAudit.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
          escalationMinutes: step.escalationMinutes,
          escalationDeadline,
          isAI: step.isAI,
          isStudent: step.isStudent,
          reportCount: idx >= 2 && collectiveReportCount > 1 ? collectiveReportCount : undefined,
        },
      };
    });


    // Build Edges
    const edges: Edge[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const sourceId = nodes[i].id;
      const targetId = nodes[i + 1].id;
      const isTargetActive = i + 1 === activeStepIdx;
      const isPastActive = i + 1 < activeStepIdx;

      edges.push({
        id: `e-${sourceId}-${targetId}`,
        source: sourceId,
        target: targetId,
        animated: isTargetActive && ticketStatus !== 'RESOLVED',
        style: {
          stroke: isTargetActive 
            ? (isTicketEscalated ? '#D9564B' : '#F2B84B') 
            : isPastActive 
            ? '#3FA66A' 
            : '#2A2F37',
          strokeWidth: isTargetActive ? 2.5 : 2,
        },
      });
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [ticket, domain, ticketStatus, currentStageId, currentNodeKey, auditLogs, workflowStages]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync state whenever dependencies change
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setTimeout(() => {
      fitView({ padding: 0.25, duration: 400 });
    }, 50);
  }, [initialNodes, initialEdges, setNodes, setEdges, fitView]);

  return (
    <div className="w-full h-full min-h-[280px] bg-app-base/80 rounded-2xl border border-app-border-subtle/80 overflow-hidden relative shadow-inner">
      {/* Top Banner with Domain Badge and Live Status */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-app-surface/90 backdrop-blur-md border border-app-border-subtle px-3 py-1.5 rounded-xl shadow-md text-xs font-mono">
        <span className="w-2 h-2 rounded-full bg-app-accent-active animate-ping" />
        <span className="text-app-text-secondary">Domain Workflow:</span>
        <span className="font-semibold text-app-accent-primary">{domain}</span>
        <span className="text-app-border-subtle">|</span>
        <span className="text-app-text-secondary">Status:</span>
        <span className={`font-semibold ${
          ticketStatus === 'ESCALATED' ? 'text-app-accent-critical' :
          ticketStatus === 'RESOLVED' ? 'text-app-accent-complete' : 'text-app-accent-active'
        }`}>
          {ticketStatus}
        </span>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={lockedViewport ? undefined : onNodesChange}
        onEdgesChange={lockedViewport ? undefined : onEdgesChange}
        nodesDraggable={!lockedViewport}
        nodesConnectable={false}
        elementsSelectable={!lockedViewport}
        panOnDrag={!lockedViewport}
        zoomOnScroll={!lockedViewport}
        zoomOnPinch={!lockedViewport}
        panOnScroll={!lockedViewport}
        preventScrolling={lockedViewport}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={18} 
          size={1.2} 
          color="#2A2F37" 
        />
        {!hideControls && (
          <Controls 
            className="!bg-app-surface !border !border-app-border-subtle !rounded-xl !p-1 !shadow-lg [&>button]:!bg-app-surface-raised [&>button]:!border-app-border-subtle [&>button]:!text-app-text-secondary hover:[&>button]:!text-app-text-primary" 
          />
        )}
      </ReactFlow>
    </div>
  );
};


export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = (props) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full h-full"
    >
      <ReactFlowProvider>
        <FlowInner {...props} />
      </ReactFlowProvider>
    </motion.div>
  );
};

export default WorkflowCanvas;
