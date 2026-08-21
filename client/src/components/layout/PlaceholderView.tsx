import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { LandingView } from '../landing/LandingView';
import { ActiveTicketsView } from '../tickets/ActiveTicketsView';


// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ────────────────────────────────────────────────────────────────────────────

export type NavDestination = 
  | 'new_query' 
  | 'active_tickets' 
  | 'pending_approvals' 
  | 'resolved_tickets' 
  | 'profile_settings'
  | 'admin';

interface PlaceholderViewProps {
  destination: NavDestination;
  onNavigate?: (dest: NavDestination) => void;
  pendingCount?: number;
}

// ────────────────────────────────────────────────────────────────────────────

interface ErrorBoundaryState { hasError: boolean; error?: Error }

export class ContentErrorBoundary extends React.Component<
  React.PropsWithChildren<{ label?: string }>,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<{ label?: string }>) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ContentErrorBoundary]', this.props.label ?? '', error, info.componentStack);
  }
  reset() { this.setState({ hasError: false, error: undefined }); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-10 gap-5 text-center">
          <div className="w-14 h-14 rounded-2xl bg-app-accent-critical/10 border border-app-accent-critical/30 flex items-center justify-center text-app-accent-critical">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-app-text-primary">
              {this.props.label ?? 'Page'} crashed during render
            </h2>
            <p className="text-xs text-app-text-secondary font-mono max-w-md break-all">
              {this.state.error?.message ?? 'Unknown error'}
            </p>
          </div>
          <button
            onClick={() => this.reset()}
            className="px-4 py-2 rounded-lg bg-app-accent-primary text-app-base text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { ResolvedTicketsView } from '../tickets/ResolvedTicketsView';
import { ProfileSettingsView } from '../profile/ProfileSettingsView';
import { AdminPanel } from '../admin/AdminPanel';


export const PlaceholderView: React.FC<PlaceholderViewProps> = ({ 
  destination, 
  onNavigate,
}) => {

  switch (destination) {
    case 'new_query':
      return <LandingView />;

    case 'active_tickets':
      return <ActiveTicketsView initialTab="my_tickets" onNavigate={onNavigate} />;

    case 'pending_approvals':
      return <ActiveTicketsView initialTab="pending_approvals" onNavigate={onNavigate} />;

    case 'resolved_tickets':
      return <ResolvedTicketsView onNavigate={onNavigate} />;


    case 'profile_settings':
      return <ProfileSettingsView />;

    case 'admin':
      return <AdminPanel onNavigate={onNavigate} />;

    default:
      return null;
  }
};
