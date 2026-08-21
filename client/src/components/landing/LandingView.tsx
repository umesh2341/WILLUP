import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Sparkles, 
  ArrowUp, 
  Wrench, 
  FileText, 
  FlaskConical, 
  AlertCircle,
  Loader2,
  User,
  Bot,
  RotateCcw
} from 'lucide-react';
import { api } from '../../lib/api';
import { useTicketRealtime } from '../../hooks/useTicketRealtime';
import { supabase } from '../../lib/supabaseClient';
import { WorkflowCanvas } from '../workflow/WorkflowCanvas';

export interface ChatMessage {
  id: string;
  sender: 'student' | 'ai' | 'system';
  text: string;
  timestamp: string;
  isClarification?: boolean;
}

const QUICK_ACTIONS = [
  {
    id: 'maintenance',
    label: 'Report Maintenance',
    icon: Wrench,
    starter: 'The fan in hostel room 204 is broken and making a lot of noise, please fix it.',
    shortDesc: 'Hostel room, electrical & plumbing'
  },
  {
    id: 'certificate',
    label: 'Request Certificate',
    icon: FileText,
    starter: 'I want to apply for a Bonafide Certificate.',
    shortDesc: 'Bonafide, NOC & transcript'
  },
  {
    id: 'lab',
    label: 'Book a Lab',
    icon: FlaskConical,
    starter: 'I need to book the Physics Lab 101 on 2026-10-15 for the 10:00 AM - 12:00 PM slot for my final year project.',
    shortDesc: 'Equipment & workspace slots'
  },
  {
    id: 'grievance',
    label: 'Raise a Grievance',
    icon: AlertCircle,
    starter: 'I want to submit a formal grievance regarding: ',
    shortDesc: 'Academic & administrative'
  },
];

export const LandingView: React.FC = () => {
  const [queryText, setQueryText] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [ticket, setTicket] = useState<any | null>(null);
  const [workflowStages, setWorkflowStages] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [queryText]);

  // Scroll chat to bottom on new message
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Realtime subscription on active Ticket
  useTicketRealtime({
    ticketId: ticket?.id,
    onUpdate: (payload) => {
      if (payload.new) {
        setTicket((prev: any) => ({
          ...prev,
          ...payload.new,
        }));
      }
    },
  });

  // Realtime subscription on AuditLog for active ticket
  useEffect(() => {
    if (!ticket?.id) return;

    const channel = supabase
      .channel(`audit-logs-ticket-${ticket.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'AuditLog',
          filter: `ticketId=eq.${ticket.id}`,
        },
        (payload) => {
          if (payload.new) {
            setAuditLogs((prev) => [...prev, payload.new]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticket?.id]);

  // Fetch workflow definitions / stages when ticket domain is identified
  useEffect(() => {
    if (!ticket?.domain) return;

    let isMounted = true;
    api.workflows.getAll()
      .then((res: any) => {
        if (!isMounted) return;
        const workflows = res?.workflows || [];
        const match = workflows.find((w: any) => w.domain === ticket.domain);
        if (match?.stages) {
          setWorkflowStages(match.stages);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch workflow definitions:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [ticket?.domain]);

  const handleSelectChip = (starter: string) => {
    setQueryText(starter);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = queryText.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'student',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQueryText('');
    setIsSubmitted(true);
    setIsLoading(true);
    setError(null);

    try {
      const historyPayload = messages.map((m) => ({
        role: m.sender === 'student' ? ('user' as const) : ('assistant' as const),
        content: m.text,
      }));

      const res = await api.chat.sendMessage({
        message: trimmed,
        history: historyPayload,
        isFollowUp: Boolean(ticket?.id),
      });

      if (res.ticket) {
        setTicket(res.ticket);
      }

      if (res.reply) {
        const aiMessage: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: res.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isClarification: res.isFollowUp,
        };
        setMessages((prev) => [...prev, aiMessage]);
      }
    } catch (err: any) {
      console.error('Failed to send message:', err);
      setError(err?.message || 'Failed to process request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleReset = () => {
    setIsSubmitted(false);
    setIsLoading(false);
    setTicket(null);
    setWorkflowStages([]);
    setAuditLogs([]);
    setMessages([]);
    setError(null);
    setQueryText('');
  };

  return (
    <div className="relative h-[calc(100vh-5rem)] md:h-screen flex flex-col justify-between overflow-hidden bg-app-base antialiased">
      {/* ─────────────────────────────────────────────────────────────
          PHASE 1: LANDING STATE (Centered layout, no clutter)
      ─────────────────────────────────────────────────────────────── */}
      {!isSubmitted && (
        <div className="flex-1 flex flex-col justify-between p-4 md:p-8 max-w-4xl mx-auto w-full">
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              <div className="w-14 h-14 rounded-2xl bg-app-accent-primary/10 border border-app-accent-primary/25 flex items-center justify-center text-app-accent-primary shadow-lg shadow-app-accent-primary/5 mx-auto">
                <Sparkles className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-app-text-primary">
                  What can we help you resolve today?
                </h1>
                <p className="text-app-text-secondary text-sm md:text-base max-w-xl mx-auto">
                  Institutional AI Assistant for automated grievance resolution, laboratory access, hostel facilities, and certificate requests.
                </p>
              </div>
            </motion.div>
          </div>

          {/* Phase 1 Centered Input & Chips */}
          <motion.div
            layout
            layoutId="query-input-dock"
            className="w-full max-w-2xl mx-auto space-y-3.5 pb-6"
          >
            <div className="relative bg-app-surface border border-app-border-subtle focus-within:border-app-accent-primary/70 focus-within:ring-1 focus-within:ring-app-accent-primary/30 rounded-2xl p-3.5 shadow-2xl transition-all">
              <textarea
                ref={textareaRef}
                id="new-query-input"
                rows={1}
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder="What do you need help with?"
                className="w-full bg-transparent text-app-text-primary placeholder:text-app-text-secondary text-sm md:text-base outline-none resize-none px-2 pt-1 pb-10 leading-relaxed font-sans"
              />

              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-2 text-[11px] text-app-text-secondary/80 pointer-events-auto">
                  <span className="flex items-center gap-1.5 font-mono">
                    <span className="w-2 h-2 rounded-full bg-app-accent-complete" />
                    Multi-Agent Pipeline Ready
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={queryText.trim().length === 0 || isLoading}
                  aria-label="Send Query"
                  className="pointer-events-auto w-8 h-8 rounded-xl bg-app-accent-primary text-app-base flex items-center justify-center font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-app-accent-active shadow-md shadow-app-accent-primary/20"
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Quick-Action Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {QUICK_ACTIONS.map((action) => {
                const IconComponent = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => handleSelectChip(action.starter)}
                    className="p-3 rounded-xl bg-app-surface border border-app-border-subtle hover:border-app-accent-primary/40 hover:bg-app-surface-raised transition-all text-left group flex flex-col justify-between h-full"
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <div className="font-semibold text-xs text-app-text-primary group-hover:text-app-accent-primary transition-colors">
                        {action.label}
                      </div>
                      <IconComponent className="w-3.5 h-3.5 text-app-text-secondary group-hover:text-app-accent-primary transition-colors flex-shrink-0" />
                    </div>
                    <div className="text-[11px] text-app-text-secondary line-clamp-1">
                      {action.shortDesc}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PHASE 2 & PHASE 3: ACTIVE WORKFLOW SPLIT SCREEN (§13.1)
          - Top ~55%: React Flow Workflow Canvas
          - Middle ~35%: Chat thread with AI & clarifying questions
          - Bottom ~10%: Docked input for follow-ups
      ─────────────────────────────────────────────────────────────── */}
      {isSubmitted && (
        <div className="flex-1 flex flex-col h-full overflow-hidden p-3 md:p-5 max-w-7xl mx-auto w-full gap-3">
          
          {/* Top Zone: React Flow Canvas (~55% height) */}
          <div className="h-[52%] w-full flex-shrink-0 relative">
            {isLoading && !ticket ? (
              <div className="w-full h-full rounded-2xl bg-app-surface/60 border border-app-border-subtle flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-app-accent-primary/10 border border-app-accent-primary/30 flex items-center justify-center text-app-accent-primary">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-app-text-primary">
                    Understanding your request...
                  </h3>
                  <p className="text-xs text-app-text-secondary max-w-md">
                    Analyzing intent and language, querying institutional knowledge base, and constructing domain workflow graph.
                  </p>
                </div>
              </div>
            ) : (
              <WorkflowCanvas
                ticket={ticket}
                auditLogs={auditLogs}
                workflowStages={workflowStages}
              />
            )}
          </div>

          {/* Middle Zone: Chat Conversation Thread (~35% height) */}
          <div 
            ref={chatScrollRef}
            className="flex-1 min-h-[120px] overflow-y-auto rounded-2xl bg-app-surface/40 border border-app-border-subtle/70 p-4 space-y-3"
          >
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2.5 max-w-3xl ${
                  msg.sender === 'student' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  msg.sender === 'student' 
                    ? 'bg-app-accent-primary text-app-base' 
                    : 'bg-app-surface-raised border border-app-border-subtle text-app-accent-info'
                }`}>
                  {msg.sender === 'student' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>

                <div className={`rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                  msg.sender === 'student'
                    ? 'bg-app-accent-primary/15 border border-app-accent-primary/30 text-app-text-primary rounded-tr-none'
                    : 'bg-app-surface border border-app-border-subtle text-app-text-primary rounded-tl-none shadow-sm'
                }`}>
                  <div className="flex items-center justify-between gap-3 mb-1 text-[10px] text-app-text-secondary">
                    <span className="font-semibold uppercase tracking-wider">
                      {msg.sender === 'student' ? 'You' : 'WILLUP Assistant'}
                    </span>
                    <span className="font-mono">{msg.timestamp}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
              </motion.div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-app-text-secondary italic pl-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-app-accent-active" />
                <span>AI Agent is typing response...</span>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-app-accent-critical/10 border border-app-accent-critical/30 text-xs text-app-accent-critical flex items-center justify-between">
                <span>{error}</span>
                <button
                  onClick={handleReset}
                  className="px-2.5 py-1 rounded bg-app-surface border border-app-border-subtle text-[11px] text-app-text-primary hover:border-app-accent-primary"
                >
                  Reset
                </button>
              </div>
            )}
          </div>

          {/* Bottom Zone: Docked Text Input (~10% height) */}
          <motion.div
            layout
            layoutId="query-input-dock"
            className="w-full flex-shrink-0"
          >
            <div className="relative bg-app-surface border border-app-border-subtle focus-within:border-app-accent-primary/70 focus-within:ring-1 focus-within:ring-app-accent-primary/30 rounded-2xl p-2.5 shadow-xl">
              <textarea
                ref={textareaRef}
                id="new-query-input"
                rows={1}
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder={ticket ? "Reply or provide follow-up information..." : "What do you need help with?"}
                className="w-full bg-transparent text-app-text-primary placeholder:text-app-text-secondary text-xs md:text-sm outline-none resize-none px-2 pt-0.5 pb-8 leading-relaxed font-sans"
              />

              <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-2 text-[10px] font-mono text-app-text-secondary pointer-events-auto">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-app-accent-complete" />
                    {ticket ? `Ticket #${ticket.id.slice(0, 8)} Active` : 'Ready'}
                  </span>
                  {ticket && (
                    <button
                      onClick={handleReset}
                      className="hover:text-app-text-primary flex items-center gap-1 text-[10px] ml-2 text-app-accent-info"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      New Query
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={queryText.trim().length === 0 || isLoading}
                  aria-label="Send Query"
                  className="pointer-events-auto w-7 h-7 rounded-lg bg-app-accent-primary text-app-base flex items-center justify-center font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-app-accent-active"
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>

        </div>
      )}
    </div>
  );
};

export default LandingView;
