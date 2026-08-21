import React from 'react';
import { 
  PlusCircle, 
  Ticket, 
  CheckCircle2, 
  SlidersHorizontal, 
  UserCheck, 
  LogOut, 
  Sparkles 
} from 'lucide-react';
import { NavDestination } from './PlaceholderView';
import { useAuth } from '../../hooks/useAuth';
import { useRoleAssignments } from '../../hooks/useRoleAssignments';

interface MobileNavProps {
  activeDestination: NavDestination;
  onNavigate: (dest: NavDestination) => void;
  pendingCount?: number;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeDestination,
  onNavigate,
  pendingCount = 0,
}) => {
  const { logout } = useAuth();
  const { isStaff, roleNames } = useRoleAssignments();

  const mobileTabs = [
    {
      id: 'new_query' as NavDestination,
      label: 'New Query',
      icon: PlusCircle,
      isPrimary: true,
      badge: null,
    },
    {
      id: 'active_tickets' as NavDestination,
      label: 'Active',
      icon: Ticket,
      isPrimary: false,
      badge: !isStaff && pendingCount > 0 ? pendingCount : null,
    },
    // Conditionally include "Approvals" tab for staff members per §14
    ...(isStaff
      ? [
          {
            id: 'pending_approvals' as NavDestination,
            label: 'Approvals',
            icon: UserCheck,
            isPrimary: false,
            badge: pendingCount > 0 ? pendingCount : null,
          },
        ]
      : []),
    {
      id: 'resolved_tickets' as NavDestination,
      label: 'Resolved',
      icon: CheckCircle2,
      isPrimary: false,
      badge: null,
    },
    {
      id: 'profile_settings' as NavDestination,
      label: 'Profile',
      icon: SlidersHorizontal,
      isPrimary: false,
      badge: null,
    },
  ];

  return (
    <>
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between h-14 px-4 bg-app-surface border-b border-app-border-subtle sticky top-0 z-20">
        <button
          onClick={() => onNavigate('new_query')}
          className="flex items-center gap-2.5"
        >
          <div className="w-7 h-7 rounded-lg bg-app-accent-primary flex items-center justify-center text-app-base shadow-sm">
            <Sparkles className="w-4 h-4 fill-app-base" />
          </div>
          <span className="font-bold text-base tracking-tight text-app-text-primary">
            WILLUP
          </span>
        </button>

        <div className="flex items-center gap-2">
          {isStaff ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-app-accent-info/15 text-app-accent-info border border-app-accent-info/30 font-mono font-semibold">
              {roleNames[0] || 'Staff'}
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-app-surface-raised text-app-text-secondary font-mono border border-app-border-subtle">
              Student
            </span>
          )}

          <button
            onClick={() => logout()}
            className="p-1.5 rounded-lg text-app-text-secondary hover:text-app-accent-critical transition-colors"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-app-surface/95 backdrop-blur border-t border-app-border-subtle px-2 py-1.5 pb-safe">
        <div className="flex items-center justify-around">
          {mobileTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeDestination === tab.id;

            if (tab.isPrimary) {
              return (
                <button
                  key={tab.id}
                  onClick={() => onNavigate(tab.id)}
                  className="flex flex-col items-center justify-center p-1 relative -top-3"
                >
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                    isActive
                      ? 'bg-app-accent-primary text-app-base ring-4 ring-app-base shadow-app-accent-primary/30'
                      : 'bg-app-accent-primary text-app-base shadow-app-accent-primary/20'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-semibold text-app-accent-primary mt-1">
                    {tab.label}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={tab.id}
                onClick={() => onNavigate(tab.id)}
                className={`flex flex-col items-center justify-center px-2 py-1 relative min-w-[56px] transition-colors ${
                  isActive
                    ? 'text-app-accent-primary font-semibold'
                    : 'text-app-text-secondary hover:text-app-text-primary'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {tab.badge !== null && tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 px-1 min-w-[14px] h-[14px] rounded-full bg-app-accent-critical text-app-base text-[9px] font-bold font-mono flex items-center justify-center ring-2 ring-app-surface">
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] mt-0.5 truncate max-w-[64px]">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
