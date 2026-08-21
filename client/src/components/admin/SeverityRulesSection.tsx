import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Flame, 
  Plus, 
  Trash2, 
  Clock, 
  Check, 
  X, 
  AlertCircle, 
  Loader2
} from 'lucide-react';
import { api } from '../../lib/api';


interface SeverityRule {
  id: string;
  domain: string;
  keyword: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  escalationCadenceMinutes: number;
}

export const SeverityRulesSection: React.FC = () => {
  const queryClient = useQueryClient();

  // Add rule modal state
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [formDomain, setFormDomain] = useState<string>('HOSTEL_MAINTENANCE');
  const [formKeyword, setFormKeyword] = useState<string>('');
  const [formSeverity, setFormSeverity] = useState<string>('HIGH');
  const [formCadence, setFormCadence] = useState<number>(30);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch severity rules
  const { data: rulesData, isLoading, error } = useQuery({
    queryKey: ['adminSeverityRules'],
    queryFn: async () => {
      const res = await api.admin.getSeverityRules();
      return (res.rules || []) as SeverityRule[];
    },
  });

  // Mutation: Create / Update Severity Rule
  const createRuleMutation = useMutation({
    mutationFn: async (data: { domain: string; keyword: string; severity: string; escalationCadenceMinutes: number }) => {
      return api.admin.createSeverityRule(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminSeverityRules'] });
      setFeedback({ type: 'success', text: 'Severity rule saved successfully!' });
      setTimeout(() => {
        setIsAddOpen(false);
        setFormKeyword('');
        setFeedback(null);
      }, 1000);
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', text: err?.message || 'Failed to save rule' });
    },
  });

  // Mutation: Delete Severity Rule
  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.admin.deleteSeverityRule(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminSeverityRules'] });
    },
    onError: (err: any) => {
      alert(`Could not delete rule: ${err?.message || 'Unknown error'}`);
    },
  });

  const rules = rulesData || [];

  const getSeverityBadgeClass = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-app-accent-critical/15 text-app-accent-critical border-app-accent-critical/30';
      case 'HIGH':
        return 'bg-app-accent-active/15 text-app-accent-active border-app-accent-active/30';
      case 'MEDIUM':
        return 'bg-app-accent-info/15 text-app-accent-info border-app-accent-info/30';
      default:
        return 'bg-app-surface-raised text-app-text-secondary border-app-border-subtle';
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Header & Action ── */}
      <div className="p-4 rounded-xl bg-app-surface border border-app-border-subtle flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Flame className="w-5 h-5 text-app-accent-critical flex-shrink-0" />
          <div className="text-xs">
            <h3 className="font-bold text-app-text-primary">
              Keyword Severity Mappings (§13.6 &amp; §6.3)
            </h3>
            <p className="text-app-text-secondary">
              Map trigger keywords to severity tiers (LOW, MEDIUM, HIGH, CRITICAL) to automatically adjust SLA escalation rates.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsAddOpen(true);
            setFeedback(null);
          }}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-app-accent-primary text-app-base text-xs font-bold shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          <span>Add Keyword Rule</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12 space-x-3 text-app-text-secondary">
          <Loader2 className="w-5 h-5 animate-spin text-app-accent-primary" />
          <span className="text-xs">Loading severity rules...</span>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl bg-app-accent-critical/10 border border-app-accent-critical/30 text-app-accent-critical text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>Error loading rules: {(error as any)?.message || 'Failed to fetch'}</span>
        </div>
      ) : rules.length === 0 ? (
        <div className="p-12 text-center text-xs text-app-text-secondary bg-app-surface border border-app-border-subtle rounded-xl">
          No keyword severity rules configured yet. Click "Add Keyword Rule" to create one.
        </div>
      ) : (
        <div className="bg-app-surface border border-app-border-subtle rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-app-border-subtle bg-app-surface-raised/40 text-app-text-secondary font-mono uppercase text-[10px]">
                  <th className="py-3 px-4">Domain</th>
                  <th className="py-3 px-4">Trigger Keyword / Phrase</th>
                  <th className="py-3 px-4">Severity Tier</th>
                  <th className="py-3 px-4">Escalation SLA</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border-subtle/50">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-app-surface-raised/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-app-text-primary text-[11px]">
                      {rule.domain}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <span className="px-2 py-0.5 rounded bg-app-base border border-app-border-subtle text-app-accent-primary font-bold">
                        {rule.keyword}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${getSeverityBadgeClass(rule.severity)}`}>
                        {rule.severity}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-app-accent-active text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{rule.escalationCadenceMinutes} mins</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => deleteRuleMutation.mutate(rule.id)}
                        disabled={deleteRuleMutation.isPending}
                        className="p-1.5 rounded-lg text-app-text-secondary hover:text-app-accent-critical hover:bg-app-accent-critical/10 transition-colors"
                        title="Delete severity rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add Severity Rule Modal ── */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-app-surface border border-app-border-subtle rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setIsAddOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-app-text-secondary hover:text-app-text-primary hover:bg-app-surface-raised"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-app-text-primary flex items-center gap-2">
                <Flame className="w-4 h-4 text-app-accent-critical" />
                Add Keyword Severity Rule
              </h3>
              <p className="text-xs text-app-text-secondary">
                Configure automated severity escalation when students mention specific issues.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!formKeyword.trim()) return;
                createRuleMutation.mutate({
                  domain: formDomain,
                  keyword: formKeyword.trim().toLowerCase(),
                  severity: formSeverity,
                  escalationCadenceMinutes: formCadence,
                });
              }}
              className="space-y-4 text-xs"
            >
              {/* Domain */}
              <div className="space-y-1.5">
                <label className="font-semibold text-app-text-secondary">Institutional Domain</label>
                <select
                  value={formDomain}
                  onChange={(e) => setFormDomain(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-app-surface-raised border border-app-border-subtle text-app-text-primary font-mono focus:outline-none focus:border-app-accent-primary"
                >
                  <option value="HOSTEL_MAINTENANCE">HOSTEL_MAINTENANCE</option>
                  <option value="CERTIFICATE">CERTIFICATE</option>
                  <option value="LABORATORY">LABORATORY</option>
                  <option value="GRIEVANCE">GRIEVANCE</option>
                </select>
              </div>

              {/* Keyword */}
              <div className="space-y-1.5">
                <label className="font-semibold text-app-text-secondary">Trigger Keyword / Phrase</label>
                <input
                  type="text"
                  placeholder="e.g. fire, electric spark, flood, medical emergency"
                  value={formKeyword}
                  onChange={(e) => setFormKeyword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-app-surface-raised border border-app-border-subtle text-app-text-primary font-mono focus:outline-none focus:border-app-accent-primary"
                />
              </div>

              {/* Severity Tier */}
              <div className="space-y-1.5">
                <label className="font-semibold text-app-text-secondary">Severity Tier</label>
                <div className="grid grid-cols-4 gap-2">
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setFormSeverity(sev)}
                      className={`py-1.5 rounded-lg text-center font-mono font-bold text-[10px] transition-colors border ${
                        formSeverity === sev
                          ? 'bg-app-accent-primary text-app-base border-app-accent-primary'
                          : 'bg-app-surface-raised text-app-text-secondary border-app-border-subtle hover:text-app-text-primary'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              {/* Escalation Cadence */}
              <div className="space-y-1.5">
                <label className="font-semibold text-app-text-secondary">
                  Escalation Cadence (Minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={formCadence}
                  onChange={(e) => setFormCadence(parseInt(e.target.value) || 30)}
                  className="w-full px-3 py-2 rounded-xl bg-app-surface-raised border border-app-border-subtle text-app-text-primary font-mono focus:outline-none focus:border-app-accent-primary"
                />
              </div>

              {/* Feedback */}
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
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-app-text-secondary hover:text-app-text-primary hover:bg-app-surface-raised"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={!formKeyword.trim() || createRuleMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-app-accent-primary text-app-base text-xs font-bold shadow-md hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {createRuleMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Rule</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SeverityRulesSection;
