import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  Clock, 
  Layers, 
  Wrench, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  DoorOpen, 
  Info
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { api } from '../../lib/api';
import { WorkflowCanvas } from '../workflow/WorkflowCanvas';


export interface CollectiveTicket {
  id: string;
  studentId: string;
  domain: string;
  category?: string;
  scope: string;
  severity: string;
  status: string;
  originalText: string;
  extractedData: any;
  createdAt: string;
  updatedAt: string;
  currentStageId?: string | null;
  currentStage?: {
    id: string;
    order: number;
    role: {
      id: string;
      name: string;
      escalationMinutes?: number | null;
    };
  } | null;
}

export interface CollectiveGroupData {
  id: string;
  domain: string;
  category: string;
  windowStart: string;
  windowEndsAt: string;
  status: 'COLLECTING' | 'DISPATCHED';
  summary?: any;
  tickets?: CollectiveTicket[];
}

export interface CollectiveGroupCardProps {
  group: CollectiveGroupData;
  onSelectTicket?: (ticket: any) => void;
  isStaff?: boolean;
}

export const CollectiveGroupCard: React.FC<CollectiveGroupCardProps> = ({
  group: initialGroup,
  onSelectTicket,
}) => {
  const [group, setGroup] = useState<CollectiveGroupData>(initialGroup);
  const [countdownStr, setCountdownStr] = useState<string>('');
  const [showMemberDetails, setShowMemberDetails] = useState<boolean>(false);


  // Sync initialGroup if prop changes
  useEffect(() => {
    setGroup(initialGroup);
  }, [initialGroup]);

  // Realtime subscription on CollectiveGroup and linked Tickets
  useEffect(() => {
    const channelName = `collective_group_${group.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'CollectiveGroup',
          filter: `id=eq.${group.id}`,
        },
        async (payload) => {
          console.log('[Realtime] CollectiveGroup change detected:', payload);
          if (payload.new) {
            setGroup((prev) => ({
              ...prev,
              ...(payload.new as any),
            }));
            // Refresh full group with tickets relation
            try {
              const res = await api.tickets.getCollectiveGroup(group.id);
              if (res?.group) {
                setGroup(res.group);
              }
            } catch (err) {
              console.warn('Failed to refresh collective group tickets:', err);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'Ticket',
          filter: `collectiveGroupId=eq.${group.id}`,
        },
        async (payload) => {
          console.log('[Realtime] Linked ticket change detected in collective group:', payload);
          try {
            const res = await api.tickets.getCollectiveGroup(group.id);
            if (res?.group) {
              setGroup(res.group);
            }
          } catch (err) {
            console.warn('Failed to refresh collective group on ticket update:', err);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [group.id]);

  // Live countdown to windowEndsAt
  useEffect(() => {
    if (group.status !== 'COLLECTING') return;

    const updateCountdown = () => {
      const targetTime = new Date(group.windowEndsAt).getTime();
      const now = Date.now();
      const diff = targetTime - now;

      if (diff <= 0) {
        setCountdownStr('00:00 - Dispatching Batch');
        return;
      }

      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setCountdownStr(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);

    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [group.status, group.windowEndsAt]);

  const tickets = group.tickets || [];
  const ticketCount = tickets.length;

  // Extract rooms from linked tickets
  const roomsReported = Array.from(
    new Set(
      tickets
        .map((t) => {
          const d = t.extractedData || {};
          return d.room || (d.block ? `Block ${d.block}` : null);
        })
        .filter(Boolean)
    )
  );

  // Pick representative ticket for workflow canvas
  const representativeTicket = tickets[0] || {
    id: group.id,
    domain: group.domain,
    scope: 'COLLECTIVE',
    status: group.status === 'DISPATCHED' ? 'IN_WORKFLOW' : 'QUEUED_COLLECTIVE',
    extractedData: {
      issueCategory: group.category,
      reportCount: ticketCount,
      rooms: roomsReported,
    },
    collectiveGroup: group,
  };

  // Format AI summary
  const renderSummary = () => {
    if (!group.summary) {
      return `Batched ${ticketCount} maintenance reports for ${group.category}.`;
    }
    if (typeof group.summary === 'string') {
      return group.summary;
    }
    if (typeof group.summary === 'object') {
      const entries = Object.entries(group.summary);
      if (entries.length > 0) {
        return entries
          .map(([cat, rooms]) => `${cat}: ${(rooms as string[]).join(', ')}`)
          .join(' | ');
      }
    }
    return JSON.stringify(group.summary);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className={`rounded-2xl border transition-all overflow-hidden ${
        group.status === 'COLLECTING'
          ? 'bg-app-surface border-app-accent-active/40 shadow-lg shadow-app-accent-active/5'
          : 'bg-app-surface border-app-border-subtle shadow-md'
      }`}
    >
      {/* ── Group Card Header ── */}
      <div className="p-5 md:p-6 border-b border-app-border-subtle/70">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Domain & Category Identity */}
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              group.status === 'COLLECTING'
                ? 'bg-app-accent-active/15 text-app-accent-active border border-app-accent-active/30'
                : 'bg-app-accent-complete/15 text-app-accent-complete border border-app-accent-complete/30'
            }`}>
              {group.status === 'COLLECTING' ? <Layers className="w-5 h-5 animate-pulse" /> : <Wrench className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-app-text-secondary">
                  COLLECTIVE QUEUE • {group.domain.replace('_', ' ')}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                  group.status === 'COLLECTING'
                    ? 'bg-app-accent-active/15 text-app-accent-active border-app-accent-active/30 animate-pulse'
                    : 'bg-app-accent-info/15 text-app-accent-info border-app-accent-info/30'
                }`}>
                  {group.status}
                </span>
              </div>
              <h3 className="text-lg font-bold text-app-text-primary mt-0.5">
                {group.category || 'Collective Issue Group'}
              </h3>
            </div>
          </div>

          {/* Right Status Pill / Live Countdown Timer */}
          <div className="flex items-center gap-2">
            {group.status === 'COLLECTING' ? (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-app-accent-active/10 border border-app-accent-active/30 text-app-accent-active font-mono text-xs font-semibold">
                <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} />
                <span>Window Closes:</span>
                <span className="font-bold tracking-wider">{countdownStr || 'Calculating...'}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-app-accent-complete/10 border border-app-accent-complete/30 text-app-accent-complete font-mono text-xs font-bold">
                <Users className="w-3.5 h-3.5" />
                <span>{ticketCount} Reports Batched</span>
              </div>
            )}
          </div>
        </div>

        {/* Affected Rooms Banner */}
        {roomsReported.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-app-text-secondary font-medium mr-1 flex items-center gap-1">
              <DoorOpen className="w-3.5 h-3.5" />
              Rooms Reported:
            </span>
            {roomsReported.map((room, idx) => (
              <span 
                key={idx} 
                className="px-2 py-0.5 rounded-md bg-app-surface-raised border border-app-border-subtle font-mono text-[11px] text-app-text-primary font-semibold"
              >
                {room}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── State: COLLECTING ── */}
      {group.status === 'COLLECTING' ? (
        <div className="p-5 md:p-6 space-y-4">
          {/* Explanation Banner */}
          <div className="p-4 rounded-xl bg-app-surface-raised border border-app-border-subtle text-xs text-app-text-secondary flex items-start gap-3">
            <Info className="w-4 h-4 text-app-accent-active shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-app-text-primary">
                Multi-Room Batching Active
              </p>
              <p className="leading-relaxed">
                Similar reports in this category are automatically gathered into a single batch during the collection window. When the timer expires, this group will automatically dispatch to the Caretaker as a single batched work order.
              </p>
            </div>
          </div>

          {/* Grouped Reports List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-app-text-secondary uppercase tracking-wider">
              <span>Currently Grouped Reports ({ticketCount})</span>
              <span className="font-mono text-[10px]">Queue ID: {group.id.slice(0, 8)}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {tickets.map((t, idx) => {
                const data = t.extractedData || {};
                const roomStr = data.room ? `Room ${data.room}` : data.block ? `Block ${data.block}` : 'Hostel Unit';
                return (
                  <div
                    key={t.id || idx}
                    onClick={() => onSelectTicket && onSelectTicket(t)}
                    className="p-3 rounded-xl bg-app-surface-raised border border-app-border-subtle hover:border-app-accent-active/40 transition-colors cursor-pointer space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-app-accent-active/15 border border-app-accent-active/30 font-mono text-[10px] font-bold text-app-accent-active">
                          {roomStr}
                        </span>
                        <span className="text-[11px] font-mono text-app-text-secondary">
                          #{t.id.slice(0, 8)}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-app-text-secondary">
                        {new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-app-text-primary line-clamp-1">
                      {t.originalText || 'Maintenance report'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ── State: DISPATCHED (Collapsed Node-Graph View) ── */
        <div className="space-y-4">
          {/* AI Structured Summary Banner */}
          <div className="px-6 pt-5">
            <div className="p-4 rounded-xl bg-app-accent-info/5 border border-app-accent-info/20 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-app-accent-info">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Collective Summary</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-app-accent-primary/15 border border-app-accent-primary/40 text-app-accent-primary font-mono text-[10px] font-bold flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  <span>{ticketCount} Batched Reports</span>
                </span>
              </div>
              <p className="text-app-text-primary text-xs leading-relaxed font-sans">
                {renderSummary()}
              </p>
            </div>
          </div>

          {/* Node Graph View (Linear Hierarchy with Report Count Badge) */}
          <div className="px-6 pb-2">
            <div className="border border-app-border-subtle rounded-xl overflow-hidden bg-app-base">
              <div className="px-4 py-2 border-b border-app-border-subtle/60 flex items-center justify-between bg-app-surface">
                <span className="text-[11px] font-mono font-semibold text-app-text-secondary uppercase tracking-wider">
                  Batched Workflow Graph • Hostels Linear Hierarchy
                </span>
                <span className="text-[10px] font-mono text-app-accent-complete font-bold">
                  Single Dispatched Instance
                </span>
              </div>
              <div className="h-[240px] w-full">
                <WorkflowCanvas
                  ticket={representativeTicket}
                  lockedViewport={true}
                  hideControls={true}
                />
              </div>

            </div>
          </div>

          {/* Toggle Member Details */}
          <div className="px-6 pb-5">
            <button
              onClick={() => setShowMemberDetails(!showMemberDetails)}
              className="flex items-center gap-1.5 text-xs text-app-text-secondary hover:text-app-text-primary font-semibold transition-colors"
            >
              {showMemberDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              <span>{showMemberDetails ? 'Hide Individual Linked Reports' : `View ${ticketCount} Individual Reports in Batch`}</span>
            </button>

            <AnimatePresence>
              {showMemberDetails && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 space-y-2 overflow-hidden"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {tickets.map((t, i) => (
                      <div
                        key={t.id || i}
                        onClick={() => onSelectTicket && onSelectTicket(t)}
                        className="p-2.5 rounded-lg bg-app-surface-raised border border-app-border-subtle hover:border-app-accent-primary transition-colors cursor-pointer text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between font-mono text-[10px] text-app-text-secondary">
                          <span>#{t.id.slice(0, 8)}</span>
                          <span className="text-app-accent-complete font-bold">BATCHED</span>
                        </div>
                        <p className="text-app-text-primary truncate">{t.originalText}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default CollectiveGroupCard;
