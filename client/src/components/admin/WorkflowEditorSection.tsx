import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Clock, 
  ArrowRight, 
  Edit3, 
  Check, 
  X, 
  Loader2, 
  AlertCircle,
  Building2,
  Sliders
} from 'lucide-react';
import { api } from '../../lib/api';


interface WorkflowStage {
  id: string;
  order: number;
  roleId: string;
  role: {
    id: string;
    name: string;
    domain: string;
    order: number;
    escalationMinutes?: number | null;
    assignments?: Array<{ user: { username: string; displayName: string } }>;
  };
}

interface WorkflowDefinition {
  id: string;
  domain: string;
  stages: WorkflowStage[];
}

export const WorkflowEditorSection: React.FC = () => {
  const queryClient = useQueryClient();

  // State for editing stage SLA / order
  const [editingStage, setEditingStage] = useState<{
    roleId: string;
    roleName: string;
    domain: string;
    order: number;
    escalationMinutes: number;
  } | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch workflows
  const { data: workflowsData, isLoading, error } = useQuery({
    queryKey: ['adminWorkflows'],
    queryFn: async () => {
      const res = await api.admin.getWorkflows();
      return (res.workflows || []) as WorkflowDefinition[];
    },
  });

  // Mutation: Update Role Stage Config
  const updateRoleMutation = useMutation({
    mutationFn: async ({ roleId, data }: { roleId: string; data: { escalationMinutes?: number; order?: number } }) => {
      return api.admin.updateRole(roleId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminWorkflows'] });
      queryClient.invalidateQueries({ queryKey: ['adminRoles'] });
      setFeedback({ type: 'success', text: 'Workflow stage updated successfully!' });
      setTimeout(() => {
        setEditingStage(null);
        setFeedback(null);
      }, 1000);
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', text: err?.message || 'Failed to update workflow stage' });
    },
  });

  const workflows = workflowsData || [];

  return (
    <div className="space-y-8">
      {/* ── Section Intro ── */}
      <div className="p-4 rounded-xl bg-app-surface border border-app-border-subtle flex items-start gap-3">
        <Sliders className="w-5 h-5 text-app-accent-active flex-shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs">
          <h3 className="font-bold text-app-text-primary">
            Workflow Hierarchy &amp; Escalation Cadence (§13.6 &amp; §8)
          </h3>
          <p className="text-app-text-secondary leading-relaxed">
            Configure the linear approval sequence and stage-specific SLA countdown timers for each institutional domain.
            All modifications write real-time entries to the system audit trail.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12 space-x-3 text-app-text-secondary">
          <Loader2 className="w-5 h-5 animate-spin text-app-accent-primary" />
          <span className="text-xs">Loading workflow definitions...</span>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl bg-app-accent-critical/10 border border-app-accent-critical/30 text-app-accent-critical text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>Error loading workflows: {(error as any)?.message || 'Failed to fetch'}</span>
        </div>
      ) : workflows.length === 0 ? (
        <div className="p-12 text-center text-xs text-app-text-secondary bg-app-surface border border-app-border-subtle rounded-xl">
          No workflow definitions found.
        </div>
      ) : (
        <div className="space-y-8">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className="bg-app-surface border border-app-border-subtle rounded-2xl p-6 space-y-6 shadow-sm"
            >
              {/* Domain Header & Pipeline Visualization */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border-subtle/70 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-app-accent-primary/10 text-app-accent-primary border border-app-accent-primary/30 flex items-center justify-center font-bold">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-app-text-primary">
                      {wf.domain}
                    </h4>
                    <span className="text-[11px] text-app-text-secondary font-mono">
                      {wf.stages.length} Linear Escalation Stages
                    </span>
                  </div>
                </div>

                {/* Breadcrumb Pipeline Strip */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {wf.stages.map((stage, idx) => (
                    <React.Fragment key={stage.id}>
                      <span className="px-2.5 py-1 rounded-lg bg-app-surface-raised border border-app-border-subtle text-[11px] font-mono font-semibold text-app-text-primary">
                        {stage.role?.name || `Stage ${idx + 1}`}
                      </span>
                      {idx < wf.stages.length - 1 && (
                        <ArrowRight className="w-3.5 h-3.5 text-app-text-secondary" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Stages Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-app-border-subtle text-app-text-secondary font-mono uppercase text-[10px]">
                      <th className="py-2.5 px-3">Order</th>
                      <th className="py-2.5 px-3">Role Authority</th>
                      <th className="py-2.5 px-3">Assigned Staff</th>
                      <th className="py-2.5 px-3">Escalation Timer (SLA)</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app-border-subtle/50">
                    {wf.stages.map((stage) => {
                      const role = stage.role;
                      const staffCount = role?.assignments?.length || 0;
                      return (
                        <tr key={stage.id} className="hover:bg-app-surface-raised/40 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-app-accent-info">
                            Stage {stage.order + 1}
                          </td>
                          <td className="py-3 px-3 font-semibold text-app-text-primary">
                            {role?.name || '—'}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-full bg-app-surface-raised border border-app-border-subtle text-[10px] font-mono text-app-text-secondary">
                              {staffCount} {staffCount === 1 ? 'member' : 'members'}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-app-accent-active">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" />
                              <span>{role?.escalationMinutes || 60} mins</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                if (role) {
                                  setEditingStage({
                                    roleId: role.id,
                                    roleName: role.name,
                                    domain: wf.domain,
                                    order: stage.order,
                                    escalationMinutes: role.escalationMinutes || 60,
                                  });
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-app-surface-raised border border-app-border-subtle text-[11px] font-medium text-app-text-primary hover:border-app-accent-primary hover:text-app-accent-primary transition-colors"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit SLA / Order</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Edit Stage Modal ── */}
      {editingStage && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-app-surface border border-app-border-subtle rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setEditingStage(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-app-text-secondary hover:text-app-text-primary hover:bg-app-surface-raised"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-app-text-primary flex items-center gap-2">
                <Sliders className="w-4 h-4 text-app-accent-primary" />
                Configure Stage SLA &amp; Sequence
              </h3>
              <p className="text-xs text-app-text-secondary font-mono">
                {editingStage.roleName} ({editingStage.domain})
              </p>
            </div>

            <div className="space-y-4">
              {/* Order input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-app-text-secondary">
                  Hierarchy Order Position (0-indexed)
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={editingStage.order}
                  onChange={(e) =>
                    setEditingStage({ ...editingStage, order: parseInt(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-app-surface-raised border border-app-border-subtle text-xs text-app-text-primary font-mono focus:outline-none focus:border-app-accent-primary"
                />
              </div>

              {/* Escalation Minutes input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-app-text-secondary">
                  Auto-Escalation SLA (Minutes before advancing to next stage)
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 absolute left-3 top-3 text-app-text-secondary" />
                  <input
                    type="number"
                    min="1"
                    step="5"
                    value={editingStage.escalationMinutes}
                    onChange={(e) =>
                      setEditingStage({ ...editingStage, escalationMinutes: parseInt(e.target.value) || 60 })
                    }
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-app-surface-raised border border-app-border-subtle text-xs text-app-text-primary font-mono focus:outline-none focus:border-app-accent-primary"
                  />
                </div>
              </div>
            </div>

            {/* Feedback Message */}
            {feedback && (
              <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-app-accent-complete/15 text-app-accent-complete border border-app-accent-complete/30'
                  : 'bg-app-accent-critical/15 text-app-accent-critical border border-app-accent-critical/30'
              }`}>
                {feedback.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{feedback.text}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingStage(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-app-text-secondary hover:text-app-text-primary hover:bg-app-surface-raised"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={updateRoleMutation.isPending}
                onClick={() => {
                  updateRoleMutation.mutate({
                    roleId: editingStage.roleId,
                    data: {
                      order: editingStage.order,
                      escalationMinutes: editingStage.escalationMinutes,
                    },
                  });
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-app-accent-primary text-app-base text-xs font-bold shadow-md hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {updateRoleMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkflowEditorSection;
