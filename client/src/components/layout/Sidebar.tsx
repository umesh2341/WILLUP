import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  PlusCircle, 
  Ticket, 
  CheckCircle2, 
  SlidersHorizontal, 
  LogOut, 
  UserCheck, 
  PanelLeftClose, 
  PanelLeftOpen, 
  Sparkles,
  ShieldCheck
} from 'lucide-react';

import { NavDestination } from './PlaceholderView';
import { useAuth } from '../../hooks/useAuth';
import { useRoleAssignments } from '../../hooks/useRoleAssignments';

interface SidebarProps {
  activeDestination: NavDestination;
  onNavigate: (dest: NavDestination) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  pendingCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeDestination,
  onNavigate,
  isExpanded,
  onToggleExpand,
  pendingCount = 0,
}) => {
  const { logout, user } = useAuth();
  const { isStaff, isAdmin, roleNames } = useRoleAssignments();

  const navItems = [
    {
      id: 'new_query' as NavDestination,
      label: 'New Query',
      icon: PlusCircle,
      isPrimaryAction: true,
      badge: null,
    },
    {
      id: 'active_tickets' as NavDestination,
      label: 'Active Tickets',
      icon: Ticket,
      isPrimaryAction: false,
      badge: isStaff && pendingCount > 0 ? pendingCount : null,
      badgeVariant: 'critical' as const,
    },
    // Conditionally show "Pending Approvals" ONLY for staff users per §14
    ...(isStaff
      ? [
          {
            id: 'pending_approvals' as NavDestination,
            label: 'Pending Approvals',
            icon: UserCheck,
            isPrimaryAction: false,
            badge: pendingCount > 0 ? pendingCount : null,
            badgeVariant: 'critical' as const,
          },
        ]
      : []),
    {
      id: 'resolved_tickets' as NavDestination,
      label: 'Resolved Tickets',
      icon: CheckCircle2,
      isPrimaryAction: false,
      badge: null,
    },
    // Conditionally show "Admin Panel" ONLY for admin users per §13.6 and §14
    ...(isAdmin
      ? [
          {
            id: 'admin' as NavDestination,
            label: 'Admin Panel',
            icon: ShieldCheck,
            isPrimaryAction: false,
            badge: null,
          },
        ]
      : []),
    {
      id: 'profile_settings' as NavDestination,
      label: 'Profile & Settings',
      icon: SlidersHorizontal,
      isPrimaryAction: false,
      badge: null,
    },
  ];


  return (
    <motion.aside
      animate={{ width: isExpanded ? 240 : 72 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className="hidden md:flex flex-col justify-between h-screen fixed left-0 top-0 z-30 bg-app-surface border-r border-app-border-subtle select-none overflow-hidden"
    >
      {/* Top Section: Logo & Primary Navigation */}
      <div className="flex flex-col flex-1 min-h-0">
        
        {/* Brand / Logo Header */}
        <div className="h-16 flex items-center px-4.5 border-b border-app-border-subtle/70 justify-between">
          <button
            onClick={() => onNavigate('new_query')}
            className="flex items-center gap-3 text-left focus:outline-none group overflow-hidden"
            title="WILLUP Platform"
          >
            <div className="w-9 h-9 rounded-xl bg-app-accent-primary flex items-center justify-center flex-shrink-0 text-app-base shadow-md shadow-app-accent-primary/20 group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5 fill-app-base" />
            </div>
            
            <AnimatePresence mode="wait">
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col overflow-hidden"
                >
                  <span className="font-bold text-base tracking-tight text-app-text-primary">
                    WILLUP
                  </span>
                  <span className="text-[10px] font-mono text-app-text-secondary -mt-0.5 truncate">
                    Autonomous Desk
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </button>

          {isExpanded && (
            <button
              onClick={onToggleExpand}
              className="p-1.5 rounded-lg text-app-text-secondary hover:text-app-text-primary hover:bg-app-surface-raised transition-colors"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Toggle button when collapsed */}
        {!isExpanded && (
          <div className="flex justify-center py-2 border-b border-app-border-subtle/50">
            <button
              onClick={onToggleExpand}
              className="p-1.5 rounded-lg text-app-text-secondary hover:text-app-text-primary hover:bg-app-surface-raised transition-colors"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Navigation Items List */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeDestination === item.id;

            if (item.isPrimaryAction) {
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  title={!isExpanded ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all mb-3 shadow-sm ${
                    isActive
                      ? 'bg-app-accent-primary text-app-base shadow-app-accent-primary/20'
                      : 'bg-app-accent-primary/10 text-app-accent-primary border border-app-accent-primary/30 hover:bg-app-accent-primary/20'
                  } ${!isExpanded ? 'justify-center px-0' : ''}`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <AnimatePresence mode="wait">
                    {isExpanded && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="truncate text-left flex-1"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                title={!isExpanded ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors relative group ${
                  isActive
                    ? 'bg-app-surface-raised text-app-text-primary border border-app-border-subtle font-semibold shadow-sm'
                    : 'text-app-text-secondary hover:text-app-text-primary hover:bg-app-surface-raised/60'
                } ${!isExpanded ? 'justify-center px-0' : ''}`}
              >
                {/* Active Indicator Strip */}
                {isActive && (
                  <motion.div
                    layoutId="activeNavIndicator"
                    className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-app-accent-primary rounded-r-full"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}

                <div className="relative flex items-center justify-center flex-shrink-0">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-app-accent-primary' : 'text-app-text-secondary group-hover:text-app-text-primary'}`} />
                  
                  {/* Collapsed Badge Pill */}
                  {!isExpanded && item.badge !== null && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-app-accent-critical text-app-base text-[9px] font-bold font-mono flex items-center justify-center ring-2 ring-app-surface">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </div>

                <AnimatePresence mode="wait">
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="flex items-center justify-between flex-1 overflow-hidden"
                    >
                      <span className="truncate text-left">{item.label}</span>
                      
                      {item.badge !== null && (
                        <span className="px-2 py-0.5 rounded-full bg-app-accent-critical/15 text-app-accent-critical border border-app-accent-critical/30 text-xs font-bold font-mono ml-2">
                          {item.badge}
                        </span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: User Info / Role Status & Logout */}
      <div className="p-3 border-t border-app-border-subtle space-y-2">
        {/* User Card when expanded */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-2.5 rounded-xl bg-app-surface-raised/70 border border-app-border-subtle text-left overflow-hidden space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-app-text-primary truncate">
                  {user?.email?.split('@')[0] || 'User'}
                </span>
                {isStaff ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-app-accent-info/10 text-app-accent-info border border-app-accent-info/30 font-mono">
                    Staff
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-app-surface text-app-text-secondary font-mono">
                    Student
                  </span>
                )}
              </div>
              {roleNames.length > 0 && (
                <div className="text-[10px] text-app-text-secondary truncate font-mono">
                  {roleNames.join(', ')}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logout Button */}
        <button
          onClick={() => logout()}
          title={!isExpanded ? 'Log Out' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-app-text-secondary hover:text-app-accent-critical hover:bg-app-accent-critical/10 transition-colors ${
            !isExpanded ? 'justify-center px-0' : ''
          }`}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <AnimatePresence mode="wait">
            {isExpanded && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="truncate text-left flex-1"
              >
                Log Out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
};
