import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, 
  XCircle, 
  Wrench, 
  FileText, 
  FlaskConical, 
  AlertCircle, 
  Search, 
  X, 
  Loader2, 
  History, 
  MessageSquare, 
  ChevronRight,
  ShieldAlert,
  FileCheck
} from 'lucide-react';

import { api } from '../../lib/api';
import { WorkflowCanvas } from '../workflow/WorkflowCanvas';
import { NavDestination } from '../layout/PlaceholderView';

export interface ResolvedTicketsViewProps {
  onNavigate?: (dest: NavDestination) => void;
}

const DOMAIN_INFO: Record<string, { label: string; icon: React.FC<{ className?: string }> }> = {
  HOSTEL_MAINTENANCE: { label: 'Hostel Maintenance', icon: Wrench },
  CERTIFICATE: { label: 'Certificate Request', icon: FileText },
  LABORATORY: { label: 'Laboratory Access', icon: FlaskConical },
  GRIEVANCE: { label: 'Grievance', icon: AlertCircle },
};

function formatExactDate(dateString?: string | null) {
  if (!dateString) return '—';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(startDateStr: string, endDateStr: string) {
  const start = new Date(startDateStr).getTime();
  const end = new Date(endDateStr).getTime();
  const diffSec = Math.max(0, Math.floor((end - start) / 1000));
  
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  if (diffHours < 24) return `${diffHours}h ${remMin}m`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ${diffHours % 24}h`;
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
    if (data.certificateType) return `Certificate: ${data.certificateType}`;
  } else if (domain === 'LABORATORY') {
    const parts: string[] = [];
    if (data.labName) parts.push(data.labName);
    if (data.equipment) parts.push(data.equipment);
    if (parts.length > 0) return parts.join(' • ');
  } else if (domain === 'GRIEVANCE') {
    if (data.category) return `Grievance: ${data.category}`;
  }

  return ticket?.originalText || ticket?.translatedText || 'Resolved Request';
}

export const ResolvedTicketsView: React.FC<ResolvedTicketsViewProps> = ({ onNavigate }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState<string>('ALL');
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [workflowStages, setWorkflowStages] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // ── Query Resolved Tickets ──
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['resolvedTickets'],
    queryFn: async () => {
      try {
        const res = await api.tickets.getResolved();
        return Array.isArray(res) ? res : (res?.tickets || []);
      } catch (err) {
        console.warn('Fallback to getMine for resolved tickets:', err);
        const res = await api.tickets.getMine();
        const list = Array.isArray(res) ? res : (res?.tickets || []);
        return list.filter((t: any) => t.status === 'RESOLVED' || t.status === 'REJECTED');
      }
    },
    staleTime: 60000,
  });

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

  // ── Load Audit Trail on Modal Open ──
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
  }, [selectedTicket?.id]);

  // Filter tickets by search and domain
  const filteredTickets = tickets.filter((t: any) => {
    const matchesDomain = domainFilter === 'ALL' || t.domain === domainFilter;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchesDomain;
    
    const desc = getExtractedDescription(t).toLowerCase();
    const id = t.id.toLowerCase();
    const raw = (t.originalText || '').toLowerCase();
    return matchesDomain && (desc.includes(q) || id.includes(q) || raw.includes(q) || t.domain.toLowerCase().includes(q));
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 antialiased">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-app-border-subtle pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-app-accent-complete/10 border border-app-accent-complete/30 flex items-center justify-center text-app-accent-complete">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-app-text-primary">
              Resolved Tickets
            </h1>
          </div>
          <p className="text-xs md:text-sm text-app-text-secondary mt-1">
            Historical archive of finalized institutional requests and completed workflow graphs.
          </p>
        </div>

        {/* Stats Pills */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-app-surface border border-app-border-subtle text-xs font-mono text-app-text-secondary flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-app-accent-complete" />
            <span>Total Archived: <strong className="text-app-text-primary font-bold">{tickets.length}</strong></span>
          </div>
        </div>
      </div>

      {/* ── Search & Filter Bar ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-app-surface border border-app-border-subtle p-3 rounded-2xl">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-app-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Ticket ID, room, certificate type, or keywords..."
            className="w-full bg-app-surface-raised border border-app-border-subtle rounded-xl pl-9 pr-3 py-2 text-xs text-app-text-primary placeholder:text-app-text-secondary outline-none focus:border-app-accent-primary/60 transition-all font-sans"
          />
        </div>

        {/* Domain Filter Dropdown */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="bg-app-surface-raised border border-app-border-subtle text-app-text-primary text-xs rounded-xl px-3 py-2 outline-none focus:border-app-accent-primary font-sans w-full sm:w-auto"
          >
            <option value="ALL">All Domains</option>
            <option value="HOSTEL_MAINTENANCE">Hostel Maintenance</option>
            <option value="CERTIFICATE">Certificate Request</option>
            <option value="LABORATORY">Laboratory Access</option>
            <option value="GRIEVANCE">Grievance</option>
          </select>
        </div>
      </div>

      {/* ── Data Table / List View ── */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-app-accent-complete" />
          <p className="text-xs text-app-text-secondary">Loading archived tickets...</p>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="bg-app-surface border border-app-border-subtle rounded-2xl p-12 text-center space-y-4 max-w-md mx-auto my-8">
          <div className="w-12 h-12 rounded-2xl bg-app-surface-raised border border-app-border-subtle flex items-center justify-center text-app-text-secondary mx-auto">
            <History className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-app-text-primary">No Resolved Tickets</h3>
            <p className="text-xs text-app-text-secondary">
              {searchQuery || domainFilter !== 'ALL'
                ? 'No archived tickets matched your search criteria.'
                : 'There are no completed or rejected tickets in the historical archive yet.'}
            </p>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('new_query')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-app-accent-primary text-app-base text-xs font-semibold hover:bg-app-accent-active transition-all"
            >
              <span>+ Create New Query</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-app-surface border border-app-border-subtle rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-app-border-subtle bg-app-surface-raised/60 text-app-text-secondary uppercase text-[10px] tracking-wider font-semibold">
                  <th className="py-3.5 px-4">Domain / Ticket ID</th>
                  <th className="py-3.5 px-4">Description &amp; Parameters</th>
                  <th className="py-3.5 px-4">Submitted Date</th>
                  <th className="py-3.5 px-4">Resolved Date</th>
                  <th className="py-3.5 px-4">Duration</th>
                  <th className="py-3.5 px-4 text-center">Final Outcome</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border-subtle/60">
                {filteredTickets.map((ticket: any) => {
                  const domainMeta = DOMAIN_INFO[ticket.domain] || { label: ticket.domain, icon: FileText };
                  const DomainIcon = domainMeta.icon;
                  const isResolved = ticket.status === 'RESOLVED';

                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => setSelectedTicket(ticket)}
                      className="hover:bg-app-surface-raised transition-colors cursor-pointer group"
                    >
                      {/* Domain Column */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-app-surface-raised border border-app-border-subtle flex items-center justify-center text-app-accent-primary group-hover:border-app-accent-primary/40 transition-colors flex-shrink-0">
                            <DomainIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-app-text-primary group-hover:text-app-accent-primary transition-colors">
                              {domainMeta.label}
                            </div>
                            <div className="font-mono text-[10px] text-app-text-secondary">
                              #{ticket.id.slice(0, 8)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Description Column */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="text-app-text-primary line-clamp-1 font-medium">
                          {getExtractedDescription(ticket)}
                        </div>
                        <div className="text-[10px] text-app-text-secondary truncate mt-0.5">
                          {ticket.scope || 'PERSONAL'} • {ticket.severity || 'LOW'} Severity
                        </div>
                      </td>

                      {/* Submitted Date */}
                      <td className="py-3.5 px-4 font-mono text-app-text-secondary text-[11px] whitespace-nowrap">
                        {formatExactDate(ticket.createdAt)}
                      </td>

                      {/* Resolved Date */}
                      <td className="py-3.5 px-4 font-mono text-app-text-secondary text-[11px] whitespace-nowrap">
                        {formatExactDate(ticket.updatedAt || ticket.createdAt)}
                      </td>

                      {/* Duration */}
                      <td className="py-3.5 px-4 font-mono text-app-text-secondary text-[11px] whitespace-nowrap">
                        {formatDuration(ticket.createdAt, ticket.updatedAt || ticket.createdAt)}
                      </td>

                      {/* Outcome Pill */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {isResolved ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-app-accent-complete/10 border border-app-accent-complete/30 text-app-accent-complete text-[11px] font-semibold">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Resolved</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-app-accent-critical/10 border border-app-accent-critical/30 text-app-accent-critical text-[11px] font-semibold">
                            <XCircle className="w-3 h-3" />
                            <span>Rejected</span>
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[11px] text-app-accent-primary font-medium group-hover:translate-x-0.5 transition-transform">
                          <span>View Graph</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          HISTORICAL VIEW MODAL (§13.3)
          - Full React Flow canvas with ALL nodes completed (green)
          - Chronological audit log timeline pulled from GET /api/audit/:ticketId
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
                  <div className="w-10 h-10 rounded-xl bg-app-accent-complete/10 border border-app-accent-complete/30 flex items-center justify-center text-app-accent-complete">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-base md:text-lg font-bold text-app-text-primary">
                        Historical Workflow: {DOMAIN_INFO[selectedTicket.domain]?.label || selectedTicket.domain}
                      </h2>
                      <span className="px-2 py-0.5 rounded-full bg-app-surface-raised border border-app-border-subtle text-[11px] font-mono text-app-text-secondary">
                        #{selectedTicket.id.slice(0, 8)}
                      </span>
                    </div>
                    <p className="text-xs text-app-text-secondary mt-0.5">
                      Submitted {formatExactDate(selectedTicket.createdAt)} • Resolved {formatExactDate(selectedTicket.updatedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedTicket.status === 'RESOLVED' ? (
                    <div className="px-3 py-1 rounded-full bg-app-accent-complete/15 border border-app-accent-complete/40 text-app-accent-complete text-xs font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Completed / Resolved</span>
                    </div>
                  ) : (
                    <div className="px-3 py-1 rounded-full bg-app-accent-critical/15 border border-app-accent-critical/40 text-app-accent-critical text-xs font-semibold flex items-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Rejected</span>
                    </div>
                  )}

                  <button
                    onClick={() => setSelectedTicket(null)}
                    aria-label="Close Modal"
                    className="w-8 h-8 rounded-xl bg-app-surface-raised border border-app-border-subtle hover:bg-app-surface hover:text-app-text-primary text-app-text-secondary flex items-center justify-center transition-colors ml-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Modal Body: Read-Only Completed Canvas (~60%) & Chronological Audit Timeline (~40%) */}
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                
                {/* Left/Top: Completed React Flow Canvas */}
                <div className="h-[45%] md:h-full md:w-[60%] border-b md:border-b-0 md:border-r border-app-border-subtle p-3 flex flex-col bg-app-base/40">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-semibold text-app-accent-complete uppercase tracking-wider flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5 text-app-accent-complete" />
                      Historical Execution Graph (All Stages Completed)
                    </span>
                    <span className="text-[10px] font-mono text-app-text-secondary/70">
                      Locked Viewport
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

                {/* Right/Bottom: Chronological Audit Trail Timeline */}
                <div className="flex-1 h-[55%] md:h-full md:w-[40%] flex flex-col bg-app-surface/90 overflow-hidden">
                  
                  {/* Parameter Snapshot Brief */}
                  <div className="p-4 border-b border-app-border-subtle bg-app-surface-raised/30 space-y-2">
                    <span className="text-[11px] font-bold text-app-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3 text-app-accent-primary" />
                      Original Request
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

                  {/* Chronological Audit Log List */}
                  <div className="p-4 flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold text-app-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-app-accent-complete" />
                        Full Chronological Audit Log ({auditLogs.length} entries)
                      </span>
                      <span className="text-[10px] font-mono text-app-text-secondary">
                        Finalized
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 font-sans">
                      {isLoadingAudit ? (
                        <div className="py-10 flex flex-col items-center justify-center text-center">
                          <Loader2 className="w-5 h-5 animate-spin text-app-accent-complete" />
                          <span className="text-xs text-app-text-secondary mt-1">Loading audit logs...</span>
                        </div>
                      ) : auditLogs.length === 0 ? (
                        <div className="text-center py-8 text-xs text-app-text-secondary">
                          No audit entries recorded.
                        </div>
                      ) : (
                        auditLogs.map((log: any, idx: number) => {
                          const isStudentMsg = log.action === 'STUDENT_MESSAGE';
                          const isApproval = log.action === 'APPROVAL' || log.action === 'APPROVED';
                          const isReject = log.action === 'REJECTED';
                          const isEscalation = log.action === 'ESCALATION' || log.action === 'AUTO_ESCALATED';

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
    </div>
  );
};

export default ResolvedTicketsView;
