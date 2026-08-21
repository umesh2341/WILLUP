import React, { useEffect, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  User, 
  Bot, 
  ShieldCheck, 
  Building2,
  Hourglass,
  Users
} from 'lucide-react';


export type NodeVisualState = 'completed' | 'active' | 'future' | 'critical';

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  roleName: string;
  stageOrder: number;
  state: NodeVisualState;
  domain?: string;
  assigneeSummary?: string;
  actor?: string;
  actionTime?: string;
  escalationMinutes?: number | null;
  escalationDeadline?: string | number | null;
  isAI?: boolean;
  isStudent?: boolean;
  reportCount?: number;
}

export const WorkflowNode: React.FC<NodeProps> = ({ data: rawData }) => {
  const data = rawData as unknown as WorkflowNodeData;
  const {
    label,
    roleName,
    stageOrder,
    state,
    assigneeSummary,
    actor,
    actionTime,
    escalationMinutes,
    escalationDeadline,
    isAI,
    isStudent,
    reportCount
  } = data;


  // Live countdown state for active / critical stages
  const [timeLeftStr, setTimeLeftStr] = useState<string>('');

  useEffect(() => {
    if (state !== 'active' && state !== 'critical') return;

    const calculateTimeLeft = () => {
      if (!escalationDeadline) {
        if (escalationMinutes) {
          setTimeLeftStr(`${escalationMinutes}m SLA`);
        }
        return;
      }

      const target = typeof escalationDeadline === 'string' 
        ? new Date(escalationDeadline).getTime() 
        : escalationDeadline;
      
      const diff = target - Date.now();
      if (diff <= 0) {
        setTimeLeftStr('Escalated / Expired');
        return;
      }

      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeftStr(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [state, escalationDeadline, escalationMinutes]);

  // Icon selection
  const getIcon = () => {
    if (isStudent) return <User className="w-4 h-4" />;
    if (isAI) return <Bot className="w-4 h-4" />;
    if (roleName.toLowerCase().includes('warden') || roleName.toLowerCase().includes('hod') || roleName.toLowerCase().includes('dean')) {
      return <ShieldCheck className="w-4 h-4" />;
    }
    return <Building2 className="w-4 h-4" />;
  };

  // State-specific styles per §11.3
  let containerStyles = '';
  let badgeContent = null;

  switch (state) {
    case 'completed':
      containerStyles = 'bg-app-surface border-app-accent-complete text-app-text-primary shadow-sm';
      badgeContent = (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-app-accent-complete">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Completed
        </span>
      );
      break;

    case 'active':
      containerStyles = 'bg-app-surface border-app-accent-active text-app-text-primary shadow-lg';
      badgeContent = (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-app-accent-active">
          <Clock className="w-3.5 h-3.5 animate-pulse" />
          In Progress
        </span>
      );
      break;

    case 'critical':
      containerStyles = 'bg-app-accent-critical/10 border-app-accent-critical text-app-text-primary shadow-lg';
      badgeContent = (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-app-accent-critical">
          <AlertTriangle className="w-3.5 h-3.5" />
          Escalated SLA
        </span>
      );
      break;

    case 'future':
    default:
      containerStyles = 'bg-app-future-node-bg border-app-future-node text-app-future-node opacity-60';
      badgeContent = (
        <span className="flex items-center gap-1 text-[10px] font-medium text-app-future-node">
          <Hourglass className="w-3 h-3" />
          Pending
        </span>
      );
      break;
  }

  return (
    <motion.div
      animate={
        state === 'active'
          ? {
              boxShadow: [
                '0 0 0 0px rgba(242, 184, 75, 0.0)',
                '0 0 0 6px rgba(242, 184, 75, 0.15)',
                '0 0 0 0px rgba(242, 184, 75, 0.0)',
              ],
            }
          : state === 'critical'
          ? {
              boxShadow: [
                '0 0 0 0px rgba(217, 86, 75, 0.0)',
                '0 0 0 6px rgba(217, 86, 75, 0.2)',
                '0 0 0 0px rgba(217, 86, 75, 0.0)',
              ],
            }
          : {}
      }
      transition={
        state === 'active' || state === 'critical'
          ? { repeat: Infinity, duration: 2.2, ease: 'easeInOut' }
          : undefined
      }
      className={`relative w-64 rounded-xl border p-3.5 select-none transition-colors ${containerStyles}`}
    >
      {/* Left Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-app-surface-raised !border-2 !border-app-border-subtle !-left-1.5"
      />

      {/* Top Meta Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div className={`p-1 rounded-md ${
            state === 'completed' 
              ? 'bg-app-accent-complete/15 text-app-accent-complete' 
              : state === 'active' 
              ? 'bg-app-accent-active/15 text-app-accent-active' 
              : state === 'critical'
              ? 'bg-app-accent-critical/20 text-app-accent-critical'
              : 'bg-app-surface-raised text-app-future-node'
          }`}>
            {getIcon()}
          </div>
          <span className="text-[10px] font-mono tracking-wider uppercase font-semibold text-app-text-secondary">
            STAGE {stageOrder + 1}
          </span>
        </div>
        {badgeContent}
      </div>

      {/* Stage Role / Label */}
      <div className="space-y-1 mb-2.5">
        <div className="flex items-center justify-between gap-1.5">
          <h4 className="font-semibold text-xs text-app-text-primary tracking-tight">
            {label || roleName}
          </h4>
          {reportCount && reportCount > 1 ? (
            <span className="px-1.5 py-0.2 rounded-full bg-app-accent-primary/15 border border-app-accent-primary/40 text-app-accent-primary font-mono text-[9px] font-bold flex items-center gap-1">
              <Users className="w-2.5 h-2.5" />
              <span>{reportCount} reports</span>
            </span>
          ) : null}
        </div>
        <p className="text-[11px] text-app-text-secondary line-clamp-1 leading-tight font-sans">
          {assigneeSummary || `Role: ${roleName}`}
        </p>
      </div>


      {/* Live Status & SLA Countdown Footer */}
      {(state === 'active' || state === 'critical' || state === 'completed') && (
        <div className="pt-2 border-t border-app-border-subtle/50 flex items-center justify-between text-[10px] font-mono">
          {state === 'completed' ? (
            <span className="text-app-text-secondary truncate">
              {actor ? `Action: ${actor}` : (actionTime || 'Verified')}
            </span>
          ) : (
            <>
              <span className="text-app-text-secondary">SLA Escalation:</span>
              <span className={`font-semibold ${state === 'critical' ? 'text-app-accent-critical' : 'text-app-accent-active'}`}>
                {timeLeftStr || `${escalationMinutes || 60}m timer`}
              </span>
            </>
          )}
        </div>
      )}

      {/* Right Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-app-surface-raised !border-2 !border-app-border-subtle !-right-1.5"
      />
    </motion.div>
  );
};

export default WorkflowNode;
