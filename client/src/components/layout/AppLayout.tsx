import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { PlaceholderView, NavDestination, ContentErrorBoundary } from './PlaceholderView';
import { useRoleAssignments } from '../../hooks/useRoleAssignments';
import { api } from '../../lib/api';

export type LayoutRenderProps = {
  activeDestination: NavDestination;
  onNavigate: (dest: NavDestination) => void;
  pendingCount: number;
};

export interface AppLayoutProps {
  children?: React.ReactNode | ((props: LayoutRenderProps) => React.ReactNode);
  initialDestination?: NavDestination;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  initialDestination = 'new_query',
}) => {
  const getDestinationFromUrl = (): NavDestination => {
    const path = window.location.pathname.replace(/^\/+/, '').toLowerCase();
    const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    if (path === 'admin' || hash === 'admin') return 'admin';
    if (path === 'active_tickets' || hash === 'active_tickets' || hash === 'tickets') return 'active_tickets';
    if (path === 'pending_approvals' || hash === 'pending_approvals' || hash === 'approvals') return 'pending_approvals';
    if (path === 'resolved_tickets' || hash === 'resolved_tickets' || hash === 'resolved') return 'resolved_tickets';
    if (path === 'profile_settings' || hash === 'profile_settings' || hash === 'profile' || hash === 'settings') return 'profile_settings';
    return initialDestination;
  };

  const [activeDestination, setActiveDestination] = useState<NavDestination>(getDestinationFromUrl);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(false);
  const { isStaff } = useRoleAssignments();

  // Listen for browser popstate or hashchange
  React.useEffect(() => {
    const handleUrlChange = () => {
      setActiveDestination(getDestinationFromUrl());
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  // Query pending approvals for staff users to power navigation badge counters per §12 & §14
  const { data: pendingTickets = [] } = useQuery({
    queryKey: ['pendingTicketsCount'],
    queryFn: async () => {
      try {
        const res = await api.tickets.getPending();
        return Array.isArray(res) ? res : (res?.tickets || []);
      } catch (err) {
        console.warn('Could not fetch pending approvals count:', err);
        return [];
      }
    },
    enabled: isStaff,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const pendingCount = pendingTickets.length;

  const handleNavigate = (destination: NavDestination) => {
    setActiveDestination(destination);
    if (destination === 'admin') {
      window.history.pushState({}, '', '/admin');
    } else {
      window.history.pushState({}, '', `/#${destination}`);
    }
  };


  const handleToggleSidebar = () => {
    setIsSidebarExpanded((prev) => !prev);
  };

  return (
    <div className="min-h-screen bg-app-base text-app-text-primary font-sans flex flex-col md:flex-row antialiased selection:bg-app-accent-primary/20 selection:text-app-accent-primary">
      {/* Desktop Fixed Left Sidebar */}
      <Sidebar
        activeDestination={activeDestination}
        onNavigate={handleNavigate}
        isExpanded={isSidebarExpanded}
        onToggleExpand={handleToggleSidebar}
        pendingCount={pendingCount}
      />

      {/* Mobile Top Header & Bottom Tab Bar */}
      <MobileNav
        activeDestination={activeDestination}
        onNavigate={handleNavigate}
        pendingCount={pendingCount}
      />

      {/* Main Viewport Content Area (No top navbar on desktop) */}
      <main
        style={{
          transition: 'margin-left 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        className={`flex-1 min-h-screen pb-20 md:pb-0 overflow-y-auto ${
          isSidebarExpanded ? 'md:ml-[240px]' : 'md:ml-[72px]'
        }`}
      >
        <ContentErrorBoundary key={activeDestination} label={activeDestination}>
          {children ? (
            typeof children === 'function' ? (
              (children as any)({ activeDestination, onNavigate: handleNavigate, pendingCount })
            ) : (
              children
            )
          ) : (
            <PlaceholderView
              destination={activeDestination}
              onNavigate={handleNavigate}
              pendingCount={pendingCount}
            />
          )}
        </ContentErrorBoundary>
      </main>
    </div>
  );
};

export default AppLayout;
