import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  ShieldCheck, 
  Bell, 
  LogOut, 
  SlidersHorizontal, 
  Mail, 
  KeyRound, 
  CheckCircle2, 
  Building2
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useRoleAssignments } from '../../hooks/useRoleAssignments';


export const ProfileSettingsView: React.FC = () => {
  const { user, logout } = useAuth();
  const { roles, isStaff } = useRoleAssignments();

  // Username and display name formatting per §13.5
  const username = user?.email ? user.email.split('@')[0] : 'student_user';
  const displayName = 
    user?.user_metadata?.full_name || 
    user?.user_metadata?.name || 
    username
      .split(/[._-]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  // Local notification preferences (MVP in-app only, persisted in localStorage)
  const [notifTicketUpdates, setNotifTicketUpdates] = useState<boolean>(() => {
    const saved = localStorage.getItem('willup_pref_ticket_updates');
    return saved !== null ? saved === 'true' : true;
  });

  const [notifEscalations, setNotifEscalations] = useState<boolean>(() => {
    const saved = localStorage.getItem('willup_pref_escalations');
    return saved !== null ? saved === 'true' : true;
  });

  const [notifCollective, setNotifCollective] = useState<boolean>(() => {
    const saved = localStorage.getItem('willup_pref_collective');
    return saved !== null ? saved === 'true' : true;
  });

  const handleToggle = (key: string, val: boolean, setter: (v: boolean) => void) => {
    setter(val);
    localStorage.setItem(key, String(val));
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 antialiased animate-in fade-in duration-300">
      {/* ── Page Header ── */}
      <div className="border-b border-app-border-subtle pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-app-accent-info/10 border border-app-accent-info/30 flex items-center justify-center text-app-accent-info">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-app-text-primary">
              Profile &amp; Settings
            </h1>
            <p className="text-xs md:text-sm text-app-text-secondary mt-0.5">
              Account identity, active workflow role assignments (§14), and system preferences.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left Column: User Identity Card ── */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-app-surface border border-app-border-subtle rounded-2xl p-6 space-y-6 shadow-sm">
            {/* User Avatar & Badge */}
            <div className="flex flex-col items-center text-center space-y-3 pb-5 border-b border-app-border-subtle/70">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-app-accent-primary/20 via-app-accent-info/20 to-app-surface-raised border border-app-border-subtle flex items-center justify-center text-app-accent-primary text-2xl font-bold font-mono shadow-inner">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold text-app-text-primary">
                  {displayName}
                </h2>
                <div className="text-xs font-mono text-app-text-secondary flex items-center justify-center gap-1">
                  <span>@{username}</span>
                </div>
              </div>

              <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider border ${
                isStaff
                  ? 'bg-app-accent-info/15 text-app-accent-info border-app-accent-info/30'
                  : 'bg-app-surface-raised text-app-text-secondary border-app-border-subtle'
              }`}>
                {isStaff ? 'Staff / Authority' : 'Student Account'}
              </span>
            </div>

            {/* Account Details */}
            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <span className="text-app-text-secondary font-medium flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  Email Address
                </span>
                <p className="font-mono text-app-text-primary bg-app-base/70 px-3 py-2 rounded-xl border border-app-border-subtle truncate">
                  {user?.email || 'user@institute.edu'}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-app-text-secondary font-medium flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  Account User ID
                </span>
                <p className="font-mono text-[11px] text-app-text-secondary bg-app-base/70 px-3 py-2 rounded-xl border border-app-border-subtle truncate">
                  {user?.id || '—'}
                </p>
              </div>
            </div>

            {/* Log Out Action */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => logout()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-app-accent-critical/40 bg-app-accent-critical/10 text-app-accent-critical hover:bg-app-accent-critical/20 font-semibold text-xs transition-all shadow-sm active:scale-98"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out of Session</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Right Column: Roles & Notifications ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Roles & Authority Card */}
          <div className="bg-app-surface border border-app-border-subtle rounded-2xl p-6 space-y-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-app-border-subtle/70 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-app-accent-complete/15 text-app-accent-complete border border-app-accent-complete/30 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-app-text-primary">
                    Workflow Role Assignments (§14)
                  </h3>
                  <p className="text-[11px] text-app-text-secondary">
                    Active permissions and hierarchy stages assigned to this account.
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-app-surface-raised border border-app-border-subtle font-mono text-xs font-semibold text-app-text-secondary">
                {roles.length} {roles.length === 1 ? 'Role' : 'Roles'}
              </span>
            </div>

            {roles.length === 0 ? (
              <div className="p-5 rounded-xl bg-app-surface-raised border border-app-border-subtle text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold text-app-text-primary">
                  <CheckCircle2 className="w-4 h-4 text-app-accent-complete" />
                  <span>Standard Student Access</span>
                </div>
                <p className="text-app-text-secondary leading-relaxed">
                  Your account is registered as a student. You have full access to submit and track queries across Hostel Maintenance, Certificate Requests, Laboratory Access, and Grievance workflows.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {roles.map((role) => (
                  <div
                    key={role.id}
                    className="p-4 rounded-xl bg-app-surface-raised border border-app-border-subtle space-y-2 flex flex-col justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-app-text-primary">
                          {role.name}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-app-accent-info/15 text-app-accent-info border border-app-accent-info/30 font-mono text-[9px] font-bold uppercase">
                          STAGE {role.order + 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 font-mono text-[11px] text-app-text-secondary">
                        <Building2 className="w-3 h-3 text-app-accent-primary" />
                        <span>{role.domain}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-app-border-subtle/50 flex items-center justify-between text-[10px] font-mono text-app-text-secondary">
                      <span>SLA Escalation:</span>
                      <span className="font-semibold text-app-accent-active">
                        {role.escalationMinutes || 60}m timer
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notification Preferences Card (MVP In-App Only) */}
          <div className="bg-app-surface border border-app-border-subtle rounded-2xl p-6 space-y-5 shadow-sm">
            <div className="flex items-center gap-2.5 border-b border-app-border-subtle/70 pb-4">
              <div className="w-8 h-8 rounded-lg bg-app-accent-active/15 text-app-accent-active border border-app-accent-active/30 flex items-center justify-center">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-app-text-primary">
                  Notification Preferences
                </h3>
                <p className="text-[11px] text-app-text-secondary">
                  Configure in-app real-time alerts and workflow activity notifications.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Toggle 1: Ticket Updates */}
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-app-surface-raised border border-app-border-subtle">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-app-text-primary">
                    Ticket Status Updates
                  </div>
                  <div className="text-[11px] text-app-text-secondary">
                    Real-time CDC toast notifications when queries progress to the next stage.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('willup_pref_ticket_updates', !notifTicketUpdates, setNotifTicketUpdates)}
                  className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                    notifTicketUpdates ? 'bg-app-accent-primary' : 'bg-app-border-subtle'
                  }`}
                >
                  <motion.div
                    animate={{ x: notifTicketUpdates ? 22 : 3 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="w-4 h-4 rounded-full bg-white absolute top-1 shadow-sm"
                  />
                </button>
              </div>

              {/* Toggle 2: SLA Escalation Alerts */}
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-app-surface-raised border border-app-border-subtle">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-app-text-primary">
                    SLA Escalation Alerts
                  </div>
                  <div className="text-[11px] text-app-text-secondary">
                    High-priority alert banner when assigned tickets are auto-escalated.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('willup_pref_escalations', !notifEscalations, setNotifEscalations)}
                  className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                    notifEscalations ? 'bg-app-accent-primary' : 'bg-app-border-subtle'
                  }`}
                >
                  <motion.div
                    animate={{ x: notifEscalations ? 22 : 3 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="w-4 h-4 rounded-full bg-white absolute top-1 shadow-sm"
                  />
                </button>
              </div>

              {/* Toggle 3: Collective Queue Notifications */}
              <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-app-surface-raised border border-app-border-subtle">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-app-text-primary">
                    Collective Issue Batching Alerts
                  </div>
                  <div className="text-[11px] text-app-text-secondary">
                    Alerts when multi-room hostel maintenance windows expire and dispatch.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('willup_pref_collective', !notifCollective, setNotifCollective)}
                  className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                    notifCollective ? 'bg-app-accent-primary' : 'bg-app-border-subtle'
                  }`}
                >
                  <motion.div
                    animate={{ x: notifCollective ? 22 : 3 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="w-4 h-4 rounded-full bg-white absolute top-1 shadow-sm"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSettingsView;
