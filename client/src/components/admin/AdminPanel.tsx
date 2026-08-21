import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Users, 
  Workflow, 
  Flame, 
  BookOpen, 
  History, 
  ArrowLeft
} from 'lucide-react';
import { useRoleAssignments } from '../../hooks/useRoleAssignments';
import { RolesMembersSection } from './RolesMembersSection';
import { WorkflowEditorSection } from './WorkflowEditorSection';
import { SeverityRulesSection } from './SeverityRulesSection';
import { KnowledgeBaseSection } from './KnowledgeBaseSection';
import { api } from '../../lib/api';

type AdminTab = 'roles_members' | 'workflow_editor' | 'severity_rules' | 'knowledge_base' | 'audit_trail';

interface AdminPanelProps {
  onNavigate?: (dest: any) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onNavigate }) => {
  const { isAdmin, isLoading: authLoading } = useRoleAssignments();
  const [activeTab, setActiveTab] = useState<AdminTab>('roles_members');


  // Audit logs query for the Audit Trail tab
  const { data: auditLogs = [], isLoading: auditLoading } = useQuery({
    queryKey: ['adminAuditLogs'],
    enabled: isAdmin && activeTab === 'audit_trail',
    queryFn: async () => {
      const res = await api.admin.getAuditLogs();
      return res.logs || [];
    },
  });

  // ── Frontend Route Guard per §14 & §10 ──
  if (!authLoading && !isAdmin) {
    return (
      <div className="p-6 md:p-12 max-w-3xl mx-auto space-y-6 antialiased animate-in fade-in duration-300">
        <div className="bg-app-surface border border-app-accent-critical/30 rounded-2xl p-8 text-center space-y-5 shadow-lg">
          <div className="w-16 h-16 rounded-2xl bg-app-accent-critical/10 border border-app-accent-critical/30 flex items-center justify-center text-app-accent-critical mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl md:text-2xl font-bold text-app-text-primary">
              Access Restricted (403 Forbidden)
            </h2>
            <p className="text-xs md:text-sm text-app-text-secondary max-w-lg mx-auto leading-relaxed">
              The Administrative Governance Console (<code className="text-app-accent-primary font-mono">/admin</code>) is protected under institutional Role-Based Access Control (§14). Only authorized System Administrators, Superadmins, or Department Heads (HOD) can manage workflows, severity thresholds, and role allocations.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('new_query')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-app-surface-raised border border-app-border-subtle text-xs font-semibold text-app-text-primary hover:border-app-accent-primary transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Student Workspace</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: AdminTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'roles_members', label: 'Roles & Members', icon: Users },
    { id: 'workflow_editor', label: 'Workflow Editor', icon: Workflow },
    { id: 'severity_rules', label: 'Severity Rules', icon: Flame },
    { id: 'knowledge_base', label: 'Knowledge Base', icon: BookOpen },
    { id: 'audit_trail', label: 'System Audit Trail', icon: History },
  ];

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-8 antialiased animate-in fade-in duration-300">
      {/* ── Page Header ── */}
      <div className="border-b border-app-border-subtle pb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-app-accent-primary/15 border border-app-accent-primary/30 flex items-center justify-center text-app-accent-primary shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-app-text-primary">
                Administration &amp; Governance
              </h1>
              <span className="px-2 py-0.5 rounded-md bg-app-accent-info/15 text-app-accent-info border border-app-accent-info/30 font-mono text-[9px] font-bold uppercase">
                §13.6 Route Guarded
              </span>
            </div>
            <p className="text-xs md:text-sm text-app-text-secondary mt-0.5">
              Configure institutional role hierarchies, SLA escalation timers, severity triggers, and RAG knowledge.
            </p>
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex flex-wrap gap-2 border-b border-app-border-subtle/80 pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-app-accent-primary text-app-base shadow-sm font-bold'
                  : 'bg-app-surface border border-app-border-subtle text-app-text-secondary hover:text-app-text-primary hover:bg-app-surface-raised'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab Contents ── */}
      <div className="min-h-[400px]">
        {activeTab === 'roles_members' && <RolesMembersSection />}
        {activeTab === 'workflow_editor' && <WorkflowEditorSection />}
        {activeTab === 'severity_rules' && <SeverityRulesSection />}
        {activeTab === 'knowledge_base' && <KnowledgeBaseSection />}
        {activeTab === 'audit_trail' && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-app-surface border border-app-border-subtle flex items-center gap-2.5 text-xs">
              <History className="w-4 h-4 text-app-accent-info flex-shrink-0" />
              <p className="text-app-text-secondary">
                Audited system record of all administrative operations (role membership changes, workflow edits, severity rule changes) per §10.
              </p>
            </div>

            {auditLoading ? (
              <div className="p-12 text-center text-xs text-app-text-secondary">Loading audit trail...</div>
            ) : auditLogs.length === 0 ? (
              <div className="p-12 text-center text-xs text-app-text-secondary bg-app-surface border border-app-border-subtle rounded-xl">
                No system audit log entries found.
              </div>
            ) : (
              <div className="bg-app-surface border border-app-border-subtle rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-app-border-subtle bg-app-surface-raised/40 text-app-text-secondary font-mono uppercase text-[10px]">
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Action</th>
                        <th className="py-3 px-4">Actor ID</th>
                        <th className="py-3 px-4">Operation Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-app-border-subtle/50">
                      {auditLogs.map((log: any) => (
                        <tr key={log.id} className="hover:bg-app-surface-raised/30 transition-colors">
                          <td className="py-3 px-4 font-mono text-[11px] text-app-text-secondary">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded bg-app-accent-primary/15 text-app-accent-primary border border-app-accent-primary/30 font-mono text-[10px] font-bold">
                              {log.action}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-app-text-secondary truncate max-w-[150px]">
                            {log.actor}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-app-text-primary">
                            <pre className="text-[10px] text-app-text-secondary truncate max-w-[350px]">
                              {JSON.stringify(log.details)}
                            </pre>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
