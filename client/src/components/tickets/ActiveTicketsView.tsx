import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Ticket as TicketIcon, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Wrench, 
  FileText, 
  FlaskConical, 
  ChevronRight, 
  X, 
  Check, 
  Loader2, 
  UserCheck, 
  Layers, 
  ShieldAlert, 
  History, 
  MessageSquare,
  Eye
} from 'lucide-react';
import { api } from '../../lib/api';
import { useRoleAssignments } from '../../hooks/useRoleAssignments';
import { supabase } from '../../lib/supabaseClient';
import { WorkflowCanvas } from '../workflow/WorkflowCanvas';
import { CollectiveGroupCard } from './CollectiveGroupCard';
import { NavDestination } from '../layout/PlaceholderView';


export interface ActiveTicketsViewProps {
  initialTab?: 'my_tickets' | 'pending_approvals' | 'collective_queue';
  onNavigate?: (dest: NavDestination) => void;
}


// ─── Formatters & Helpers ───────────────────────────────────────────────────

const DOMAIN_INFO: Record<string, { label: string; icon: React.FC<{ className?: string }> }> = {
  HOSTEL_MAINTENANCE: { label: 'Hostel Maintenance', icon: Wrench },
  CERTIFICATE: { label: 'Certificate Request', icon: FileText },
  LABORATORY: { label: 'Laboratory Access', icon: FlaskConical },
  GRIEVANCE: { label: 'Grievance', icon: AlertCircle },
};

function getStatusStyle(status: string) {
  switch (status) {
    case 'RECEIVED':
    case 'CLASSIFIED':
      return {
        bg: 'bg-app-accent-info/10 text-app-accent-info border-app-accent-info/30',
        dot: 'bg-app-accent-info',
        label: 'Received',
      };
    case 'QUEUED_COLLECTIVE':
      return {
        bg: 'bg-app-accent-active/10 text-app-accent-active border-app-accent-active/30',
        dot: 'bg-app-accent-active',
        label: 'Collective Queue',
      };
    case 'IN_WORKFLOW':
      return {
        bg: 'bg-app-accent-active/10 text-app-accent-active border-app-accent-active/30',
        dot: 'bg-app-accent-active',
        label: 'In Workflow',
      };
    case 'ESCALATED':
      return {
        bg: 'bg-app-accent-critical/15 text-app-accent-critical border-app-accent-critical/40',
        dot: 'bg-app-accent-critical animate-ping',
        label: 'Escalated',
      };
    case 'RESOLVED':
      return {
        bg: 'bg-app-accent-complete/10 text-app-accent-complete border-app-accent-complete/30',
        dot: 'bg-app-accent-complete',
        label: 'Resolved',
      };
    case 'REJECTED':
      return {
        bg: 'bg-app-accent-critical/10 text-app-accent-critical border-app-accent-critical/30',
        dot: 'bg-app-accent-critical',
        label: 'Rejected',
      };
    default:
      return {
        bg: 'bg-app-surface-raised text-app-text-secondary border-app-border-subtle',
        dot: 'bg-app-text-secondary',
        label: status || 'Active',
      };
  }
}

function formatRelativeTime(dateString?: string | null) {
  if (!dateString) return 'Recently';
  const now = Date.now();
  const date = new Date(dateString).getTime();
  const diffSec = Math.max(0, Math.floor((now - date) / 1000));
  
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

function getExtractedDescription(ticket: any): string {
  const data = ticket?.extractedData || {};
  const domain = ticket?.domain;

  if (domain === 'HOSTEL_MAINTENANCE') {
    const parts: string[] = [];
    if (data.block && data.block !== 'UNKNOWN') parts.push(`Block ${data.block}`);
    if (data.room && data.room !== 'UNKNOWN') parts.push(`Room ${data.room}`);
    if (data.issueCategory) parts.push(String(data.issueCategory).toUpperCase());
    if (parts.length > 0) return parts.join(' • ');
  } else if (domain === 'CERTIFICATE') {
    if (data.certificateType) return `Type: ${data.certificateType}`;
  } else if (domain === 'LABORATORY') {
    const parts: string[] = [];
    if (data.labName) parts.push(data.labName);
    if (data.equipment) parts.push(data.equipment);
    if (parts.length > 0) return parts.join(' • ');
  } else if (domain === 'GRIEVANCE') {
    if (data.category) return `Grievance: ${data.category}`;
  }

  return ticket?.originalText || ticket?.translatedText || 'Service Request';
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const ActiveTicketsView: React.FC<ActiveTicketsViewProps> = ({
  initialTab = 'my_tickets',
  onNavigate,
}) => {
  const queryClient = useQueryClient();
  const { isStaff } = useRoleAssignments();

  const [activeTab, setActiveTab] = useState<'my_tickets' | 'pending_approvals' | 'collective_queue'>(
    initialTab === 'pending_approvals' && isStaff 
      ? 'pending_approvals' 
      : initialTab === 'collective_queue' 
      ? 'collective_queue' 
      : 'my_tickets'
  );


  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [rejectingTicketId, setRejectingTicketId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [workflowStages, setWorkflowStages] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Sync activeTab if initialTab changes
  useEffect(() => {
    if (initialTab === 'pending_approvals' && isStaff) {
      setActiveTab('pending_approvals');
    }
  }, [initialTab, isStaff]);

  // ── Queries ──
  const { 
    data: myTickets = [], 
    isLoading: isLoadingMine,
  } = useQuery({
    queryKey: ['myTickets'],
    queryFn: async () => {
      const res = await api.tickets.getMine();
      const list = Array.isArray(res) ? res : (res?.tickets || []);
      // Filter to open tickets
      return list.filter((t: any) => t.status !== 'RESOLVED' && t.status !== 'REJECTED');
    },
    refetchInterval: 30000,
  });

  const { 
    data: pendingTickets = [], 
    isLoading: isLoadingPending,
  } = useQuery({
    queryKey: ['pendingTickets'],
    queryFn: async () => {
      if (!isStaff) return [];
      const res = await api.tickets.getPending();
      return Array.isArray(res) ? res : (res?.tickets || []);
    },
    enabled: isStaff,
    refetchInterval: 30000,
  });

  const {
    data: collectiveGroups = [],
    isLoading: isLoadingCollective,
  } = useQuery({
    queryKey: ['collectiveGroups'],
    queryFn: async () => {
      const res = await api.tickets.getCollectiveGroups();
      return Array.isArray(res) ? res : (res?.groups || []);
    },
    refetchInterval: 15000,
  });

  // ── Global Realtime CDC Subscription on Ticket & CollectiveGroup Tables ──
  useEffect(() => {
    const channel = supabase
      .channel('realtime-active-tickets-cdc')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'Ticket' },
        () => {
          // Immediately invalidate and trigger live refetch across all sessions
          queryClient.invalidateQueries({ queryKey: ['myTickets'] });
          queryClient.invalidateQueries({ queryKey: ['pendingTickets'] });
          queryClient.invalidateQueries({ queryKey: ['pendingTicketsCount'] });
          queryClient.invalidateQueries({ queryKey: ['collectiveGroups'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'CollectiveGroup' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['collectiveGroups'] });
          queryClient.invalidateQueries({ queryKey: ['myTickets'] });
          queryClient.invalidateQueries({ queryKey: ['pendingTickets'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);


  // ── Load Workflow Definitions on Modal Open ──
  useEffect(() => {
    if (!selectedTicket?.domain) return;

    api.workflows.getAll()
      .then((res: any) => {
        const workflows = res?.workflows || [];
        const match = workflows.find((w: any) => w.domain === selectedTicket.domain);
        if (match?.stages) {
          setWorkflowStages(match.stages);
        }
      })
      .catch((err) => console.warn('Could not load workflow stages:', err));
  }, [selectedTicket?.domain]);

  // ── Load Audit Trail on Modal Open & Subscribe to Live Audit Logs ──
  useEffect(() => {
    if (!selectedTicket?.id) {
      setAuditLogs([]);
      return;
    }

    setIsLoadingAudit(true);
    api.audit.getByTicketId(selectedTicket.id)
      .then((res: any) => {
        setAuditLogs(res?.logs || []);
      })
      .catch((err) => {
        console.warn('Could not fetch audit trail:', err);
        setAuditLogs(selectedTicket.auditLogs || []);
      })
      .finally(() => {
        setIsLoadingAudit(false);
      });

    // Realtime channel for this ticket's audit logs
    const auditChannel = supabase
      .channel(`audit-logs-modal-${selectedTicket.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'AuditLog',
          filter: `ticketId=eq.${selectedTicket.id}`,
        },
        (payload) => {
          if (payload.new) {
            setAuditLogs((prev) => [...prev, payload.new]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(auditChannel);
    };
  }, [selectedTicket?.id]);

  // ── Mutations: Approve & Reject ──
  const approveMutation = useMutation({
    mutationFn: async ({ ticketId, stageId }: { ticketId: string; stageId?: string }) => {
      return api.tickets.approve(ticketId, { stageId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingTickets'] });
      queryClient.invalidateQueries({ queryKey: ['pendingTicketsCount'] });
      queryClient.invalidateQueries({ queryKey: ['myTickets'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ ticketId, stageId, comment }: { ticketId: string; stageId?: string; comment?: string }) => {
      return api.tickets.reject(ticketId, { stageId, comment });
    },
    onSuccess: () => {
      setRejectingTicketId(null);
      setRejectComment('');
      queryClient.invalidateQueries({ queryKey: ['pendingTickets'] });
      queryClient.invalidateQueries({ queryKey: ['pendingTicketsCount'] });
      queryClient.invalidateQueries({ queryKey: ['myTickets'] });
    },
  });

  const handleApprove = (e: React.MouseEvent, ticket: any) => {
    e.stopPropagation();
    approveMutation.mutate({ ticketId: ticket.id, stageId: ticket.currentStageId });
  };

  const handleOpenRejectModal = (e: React.MouseEvent, ticket: any) => {
    e.stopPropagation();
    setRejectingTicketId(ticket.id);
  };

  const handleConfirmReject = (ticket: any) => {
    rejectMutation.mutate({
      ticketId: ticket.id,
      stageId: ticket.currentStageId,
      comment: rejectComment.trim() || undefined,
    });
  };

  const displayTickets = activeTab === 'pending_approvals' ? pendingTickets : myTickets;
  const isLoadingList = activeTab === 'pending_approvals' ? isLoadingPending : isLoadingMine;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 antialiased">
      {/* ── Header & Navigation ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-app-border-subtle pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-app-accent-active/10 border border-app-accent-active/30 flex items-center justify-center text-app-accent-active">
              <TicketIcon className="w-4 h-4" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-app-text-primary">
              Active Tickets
            </h1>
          </div>
          <p className="text-xs md:text-sm text-app-text-secondary mt-1">
            Real-time tracking of in-progress requests, workflow stages, and approval queues.
          </p>
        </div>

        {/* Tab Switcher (Visible to all users) */}
        <div className="flex items-center p-1 bg-app-surface border border-app-border-subtle rounded-xl self-start sm:self-auto flex-wrap gap-1">
          <button
            onClick={() => setActiveTab('my_tickets')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'my_tickets'
                ? 'bg-app-accent-primary text-app-base shadow-sm font-bold'
                : 'text-app-text-secondary hover:text-app-text-primary'
            }`}
          >
            <TicketIcon className="w-3.5 h-3.5" />
            <span>My Submitted</span>
            <span className="font-mono text-[10px] opacity-80">({myTickets.length})</span>
          </button>

          {isStaff && (
            <button
              onClick={() => setActiveTab('pending_approvals')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'pending_approvals'
                  ? 'bg-app-accent-critical text-app-base shadow-sm font-bold'
                  : 'text-app-text-secondary hover:text-app-text-primary'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Pending My Approval</span>
              {pendingTickets.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-app-base text-app-accent-critical font-mono text-[10px] font-bold">
                  {pendingTickets.length}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => setActiveTab('collective_queue')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'collective_queue'
                ? 'bg-app-accent-active text-app-base shadow-sm font-bold'
                : 'text-app-text-secondary hover:text-app-text-primary'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Collective Queue</span>
            {collectiveGroups.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold ${
                activeTab === 'collective_queue'
                  ? 'bg-app-base text-app-accent-active'
                  : 'bg-app-accent-active/20 text-app-accent-active'
              }`}>
                {collectiveGroups.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Collective Queue Tab Content ── */}
      {activeTab === 'collective_queue' ? (
        isLoadingCollective ? (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-app-accent-active" />
            <p className="text-xs text-app-text-secondary">Loading collective batches...</p>
          </div>
        ) : collectiveGroups.length === 0 ? (
          <div className="bg-app-surface border border-app-border-subtle rounded-2xl p-12 text-center space-y-4 max-w-md mx-auto my-8">
            <div className="w-12 h-12 rounded-2xl bg-app-surface-raised border border-app-border-subtle flex items-center justify-center text-app-accent-active mx-auto">
              <Layers className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-app-text-primary">
                No Active Collective Batches
              </h3>
              <p className="text-xs text-app-text-secondary">
                When multiple hostel maintenance requests occur in the same category across rooms, the AI groups them automatically into batched windows before dispatching.
              </p>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('new_query')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-app-accent-primary text-app-base text-xs font-semibold hover:bg-app-accent-active transition-all"
              >
                <span>+ Report Maintenance Issue</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <AnimatePresence mode="popLayout">
              {collectiveGroups.map((group: any) => (
                <CollectiveGroupCard
                  key={group.id}
                  group={group}
                  onSelectTicket={(t) => setSelectedTicket(t)}
                  isStaff={isStaff}
                />
              ))}
            </AnimatePresence>
          </div>
        )
      ) : isLoadingList ? (
        <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-app-accent-primary" />
          <p className="text-xs text-app-text-secondary">Loading active tickets...</p>
        </div>
      ) : displayTickets.length === 0 ? (
        <div className="bg-app-surface border border-app-border-subtle rounded-2xl p-12 text-center space-y-4 max-w-md mx-auto my-8">
          <div className="w-12 h-12 rounded-2xl bg-app-surface-raised border border-app-border-subtle flex items-center justify-center text-app-text-secondary mx-auto">
            {activeTab === 'pending_approvals' ? (
              <CheckCircle2 className="w-6 h-6 text-app-accent-complete" />
            ) : (
              <TicketIcon className="w-6 h-6 text-app-text-secondary" />
            )}
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-app-text-primary">
              {activeTab === 'pending_approvals'
                ? 'No Pending Approvals'
                : 'No Active Tickets Found'}
            </h3>
            <p className="text-xs text-app-text-secondary">
              {activeTab === 'pending_approvals'
                ? 'You are all caught up! There are no tickets awaiting your role approval right now.'
                : 'You do not have any unresolved requests in progress. Start a new query anytime.'}
            </p>
          </div>
          {activeTab === 'my_tickets' && onNavigate && (
            <button
              onClick={() => onNavigate('new_query')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-app-accent-primary text-app-base text-xs font-semibold hover:bg-app-accent-active transition-all"
            >
              <span>+ Create New Query</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {displayTickets.map((ticket: any) => {
              const domainMeta = DOMAIN_INFO[ticket.domain] || { label: ticket.domain, icon: TicketIcon };
              const DomainIcon = domainMeta.icon;
              const statusStyle = getStatusStyle(ticket.status);
              const currentStageName = 
                ticket.currentStage?.role?.name || 
                ticket.currentStage?.name || 
                (ticket.status === 'QUEUED_COLLECTIVE' ? 'Collective Queue' : 'Submitted');
              const isPendingTab = activeTab === 'pending_approvals';
              const isApproving = approveMutation.isPending && approveMutation.variables?.ticketId === ticket.id;
              const isRejecting = rejectMutation.isPending && rejectMutation.variables?.ticketId === ticket.id;
              const isCollective = ticket.scope === 'COLLECTIVE' || ticket.collectiveGroupId;


              return (
                <motion.div
                  key={ticket.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: -10 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => setSelectedTicket(ticket)}
                  className="group relative bg-app-surface border border-app-border-subtle hover:border-app-accent-primary/50 hover:bg-app-surface-raised rounded-2xl p-5 shadow-sm transition-all cursor-pointer flex flex-col justify-between space-y-4"
                >
                  {/* Card Header: Domain & Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-app-surface-raised border border-app-border-subtle group-hover:border-app-accent-primary/30 flex items-center justify-center text-app-accent-primary transition-colors flex-shrink-0">
                        <DomainIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-app-text-primary group-hover:text-app-accent-primary transition-colors">
                            {domainMeta.label}
                          </span>
                          <span className="text-[10px] font-mono text-app-text-secondary">
                            #{ticket.id.slice(0, 8)}
                          </span>
                        </div>
                        <div className="text-xs text-app-text-secondary flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1 font-mono text-[11px]">
                            <Clock className="w-3 h-3 text-app-text-secondary" />
                            {formatRelativeTime(ticket.updatedAt || ticket.createdAt)}
                          </span>
                          <span>•</span>
                          <span className="text-[11px] text-app-text-secondary">
                            {ticket.scope || 'PERSONAL'}
                          </span>
                          {isCollective && (
                            <span className="px-1.5 py-0.2 rounded bg-app-accent-active/15 border border-app-accent-active/30 font-mono text-[9px] font-bold text-app-accent-active flex items-center gap-1">
                              <Layers className="w-2.5 h-2.5" />
                              BATCH
                            </span>
                          )}
                        </div>
                      </div>
                    </div>


                    {/* Status Pill (§11.1) */}
                    <div className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold flex items-center gap-1.5 flex-shrink-0 ${statusStyle.bg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                      <span>{statusStyle.label}</span>
                    </div>
                  </div>

                  {/* Description & Extracted Data */}
                  <div className="bg-app-base/60 border border-app-border-subtle/60 rounded-xl p-3 text-xs leading-relaxed text-app-text-primary line-clamp-2">
                    {getExtractedDescription(ticket)}
                  </div>

                  {/* Current Stage & Footer Actions */}
                  <div className="flex items-center justify-between gap-3 pt-1 border-t border-app-border-subtle/50 text-xs">
                    <div className="flex items-center gap-1.5 text-app-text-secondary text-[11px]">
                      <Layers className="w-3.5 h-3.5 text-app-accent-primary" />
                      <span className="text-app-text-secondary">Stage:</span>
                      <span className="font-semibold text-app-text-primary truncate max-w-[140px]">
                        {currentStageName}
                      </span>
                    </div>

                    {/* Staff Inline Actions on Pending Approvals */}
                    {isPendingTab ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={isApproving || isRejecting}
                          onClick={(e) => handleOpenRejectModal(e, ticket)}
                          className="px-2.5 py-1 rounded-lg border border-app-accent-critical/40 bg-app-accent-critical/10 text-app-accent-critical hover:bg-app-accent-critical/20 text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1"
                        >
                          {isRejecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3 stroke-[2.5]" />}
                          <span>Reject</span>
                        </button>

                        <button
                          type="button"
                          disabled={isApproving || isRejecting}
                          onClick={(e) => handleApprove(e, ticket)}
                          className="px-3 py-1 rounded-lg bg-app-accent-complete text-app-base hover:bg-app-accent-complete/90 text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1 shadow-sm"
                        >
                          {isApproving ? <Loader2 className="w-3 h-3 animate-spin text-app-base" /> : <Check className="w-3 h-3 stroke-[3]" />}
                          <span>Approve</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[11px] text-app-accent-primary group-hover:translate-x-0.5 transition-transform font-medium">
                        <span>View Workflow</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: Read-Only Locked-Viewport React Flow & Audit Trail (§13.2)
      ─────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedTicket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-app-base/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.22 }}
              className="bg-app-surface border border-app-border-subtle rounded-3xl w-full max-w-5xl h-[88vh] max-h-[850px] shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-4 md:p-5 border-b border-app-border-subtle flex items-center justify-between bg-app-surface-raised/40">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-app-accent-primary/10 border border-app-accent-primary/30 flex items-center justify-center text-app-accent-primary">
                    {React.createElement(
                      DOMAIN_INFO[selectedTicket.domain]?.icon || TicketIcon,
                      { className: 'w-5 h-5' }
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-base md:text-lg font-bold text-app-text-primary">
                        {DOMAIN_INFO[selectedTicket.domain]?.label || selectedTicket.domain}
                      </h2>
                      <span className="px-2 py-0.5 rounded-full bg-app-surface-raised border border-app-border-subtle text-[11px] font-mono text-app-text-secondary">
                        #{selectedTicket.id.slice(0, 8)}
                      </span>
                    </div>
                    <p className="text-xs text-app-text-secondary mt-0.5">
                      Submitted {formatRelativeTime(selectedTicket.createdAt)} by student • Status: {selectedTicket.status}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`px-2.5 py-1 rounded-full border text-xs font-semibold flex items-center gap-1.5 ${getStatusStyle(selectedTicket.status).bg}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${getStatusStyle(selectedTicket.status).dot}`} />
                    <span>{getStatusStyle(selectedTicket.status).label}</span>
                  </div>

                  <button
                    onClick={() => setSelectedTicket(null)}
                    aria-label="Close Modal"
                    className="w-8 h-8 rounded-xl bg-app-surface-raised border border-app-border-subtle hover:bg-app-surface hover:text-app-text-primary text-app-text-secondary flex items-center justify-center transition-colors ml-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Modal Body: Split between Read-Only Canvas (~60%) and Live Audit Trail (~40%) */}
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                
                {/* Left/Top: Locked-Viewport Read-Only React Flow Canvas */}
                <div className="h-[45%] md:h-full md:w-[60%] border-b md:border-b-0 md:border-r border-app-border-subtle p-3 flex flex-col bg-app-base/40">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-semibold text-app-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-app-accent-info" />
                      Live Workflow Graph (Read-Only)
                    </span>
                    <span className="text-[10px] font-mono text-app-text-secondary/70">
                      Viewport Locked
                    </span>
                  </div>

                  <div className="flex-1 w-full rounded-2xl overflow-hidden border border-app-border-subtle/80">
                    <WorkflowCanvas
                      ticket={selectedTicket}
                      auditLogs={auditLogs}
                      workflowStages={workflowStages}
                      lockedViewport={true}
                      hideControls={false}
                    />
                  </div>
                </div>

                {/* Right/Bottom: Slide-Out Audit Trail & Parameters Panel */}
                <div className="flex-1 h-[55%] md:h-full md:w-[40%] flex flex-col bg-app-surface/90 overflow-hidden">
                  
                  {/* Extracted Parameters Brief */}
                  <div className="p-4 border-b border-app-border-subtle bg-app-surface-raised/30 space-y-2">
                    <span className="text-[11px] font-bold text-app-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3 text-app-accent-primary" />
                      Original Request &amp; Parameters
                    </span>
                    <p className="text-xs text-app-text-primary bg-app-base/60 p-2.5 rounded-xl border border-app-border-subtle font-mono text-[11px] leading-relaxed">
                      {selectedTicket.originalText || selectedTicket.translatedText}
                    </p>
                    {selectedTicket.extractedData && Object.keys(selectedTicket.extractedData).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {Object.entries(selectedTicket.extractedData).map(([key, val]) => (
                          <span
                            key={key}
                            className="px-2 py-0.5 rounded-md bg-app-surface border border-app-border-subtle text-[10px] font-mono text-app-text-secondary"
                          >
                            <strong className="text-app-text-primary">{key}:</strong> {String(val)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Audit Trail Timeline */}
                  <div className="p-4 flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold text-app-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-app-accent-complete" />
                        Audit Trail Timeline ({auditLogs.length})
                      </span>
                      <span className="text-[10px] font-mono text-app-accent-complete flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-app-accent-complete animate-pulse" />
                        Live CDC
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 font-sans">
                      {isLoadingAudit ? (
                        <div className="py-10 flex flex-col items-center justify-center text-center">
                          <Loader2 className="w-5 h-5 animate-spin text-app-accent-primary" />
                          <span className="text-xs text-app-text-secondary mt-1">Loading audit logs...</span>
                        </div>
                      ) : auditLogs.length === 0 ? (
                        <div className="text-center py-8 text-xs text-app-text-secondary">
                          No audit entries recorded yet.
                        </div>
                      ) : (
                        auditLogs.map((log: any, idx: number) => {
                          const isStudentMsg = log.action === 'STUDENT_MESSAGE';
                          const isApproval = log.action === 'APPROVAL' || log.action === 'APPROVED';
                          const isReject = log.action === 'REJECTED';
                          const isEscalation = log.action === 'ESCALATION';

                          return (
                            <div
                              key={log.id || `audit-${idx}`}
                              className="p-2.5 rounded-xl bg-app-surface-raised border border-app-border-subtle text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-app-text-primary flex items-center gap-1.5">
                                  {isApproval && <CheckCircle2 className="w-3 h-3 text-app-accent-complete" />}
                                  {isReject && <XCircle className="w-3 h-3 text-app-accent-critical" />}
                                  {isEscalation && <ShieldAlert className="w-3 h-3 text-app-accent-critical" />}
                                  {isStudentMsg && <MessageSquare className="w-3 h-3 text-app-accent-info" />}
                                  <span>{log.action}</span>
                                </span>
                                <span className="font-mono text-[10px] text-app-text-secondary">
                                  {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                              </div>

                              <div className="text-[11px] text-app-text-secondary flex items-center justify-between">
                                <span className="font-mono text-[10px] text-app-accent-primary">
                                  Actor: {log.actor || 'System'}
                                </span>
                              </div>

                              {log.details && (
                                <div className="text-[10px] font-mono text-app-text-secondary/90 bg-app-base/60 p-1.5 rounded-md border border-app-border-subtle/50 mt-1">
                                  {typeof log.details === 'string' 
                                    ? log.details 
                                    : JSON.stringify(log.details)}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Rejection Comment Dialog ── */}
      <AnimatePresence>
        {rejectingTicketId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-app-base/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-app-surface border border-app-border-subtle rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-2.5 text-app-accent-critical">
                <XCircle className="w-5 h-5" />
                <h3 className="font-bold text-base text-app-text-primary">Confirm Rejection</h3>
              </div>
              <p className="text-xs text-app-text-secondary">
                Are you sure you want to reject Ticket #{rejectingTicketId.slice(0, 8)}? You may provide an optional reason for the student.
              </p>
              <textarea
                rows={3}
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="Optional rejection comment..."
                className="w-full bg-app-surface-raised border border-app-border-subtle rounded-xl p-2.5 text-xs text-app-text-primary placeholder:text-app-text-secondary outline-none focus:border-app-accent-critical"
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingTicketId(null)}
                  className="px-3.5 py-1.5 rounded-xl bg-app-surface-raised border border-app-border-subtle text-xs text-app-text-secondary hover:text-app-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={rejectMutation.isPending}
                  onClick={() => {
                    const t = pendingTickets.find((item: any) => item.id === rejectingTicketId);
                    if (t) handleConfirmReject(t);
                  }}
                  className="px-4 py-1.5 rounded-xl bg-app-accent-critical text-app-base font-bold text-xs hover:bg-app-accent-critical/90 transition-colors flex items-center gap-1.5"
                >
                  {rejectMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-app-base" />}
                  <span>Confirm Reject</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ActiveTicketsView;
