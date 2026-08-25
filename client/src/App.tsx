import React, { useState } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { PlaceholderView, NavDestination } from './components/layout/PlaceholderView';
import { 
  Palette, 
  UserCheck, 
  KeyRound, 
  Activity, 
  RefreshCw, 
  LogOut, 
  LogIn,
  ArrowRight,
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  ShieldCheck,
  Zap,
  Clock3,
  UserRound
} from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { useRoleAssignments } from './hooks/useRoleAssignments';
import { useTicketRealtime } from './hooks/useTicketRealtime';

interface ColorSwatch {
  name: string;
  token: string;
  hex: string;
  bgClass: string;
  textClass?: string;
  borderClass?: string;
  description: string;
  category: 'Backgrounds & Surfaces' | 'Borders & Text' | 'Status & Accents' | 'Workflow';
}

const colorTokens: ColorSwatch[] = [
  // Backgrounds & Surfaces
  {
    name: 'Base Background',
    token: 'bg-app-base',
    hex: '#0E1013',
    bgClass: 'bg-app-base',
    textClass: 'text-app-text-primary',
    borderClass: 'border-app-border-subtle',
    description: 'Primary application viewport & dark background canvas',
    category: 'Backgrounds & Surfaces',
  },
  {
    name: 'Surface',
    token: 'bg-app-surface',
    hex: '#171A1F',
    bgClass: 'bg-app-surface',
    textClass: 'text-app-text-primary',
    borderClass: 'border-app-border-subtle',
    description: 'Cards, sidebar panels, modals, and container surfaces',
    category: 'Backgrounds & Surfaces',
  },
  {
    name: 'Surface Raised',
    token: 'bg-app-surface-raised',
    hex: '#1F2329',
    bgClass: 'bg-app-surface-raised',
    textClass: 'text-app-text-primary',
    borderClass: 'border-app-border-subtle',
    description: 'Hover states, elevated dropdowns, dialogs, and popovers',
    category: 'Backgrounds & Surfaces',
  },

  // Borders & Text
  {
    name: 'Subtle Border',
    token: 'border-app-border-subtle',
    hex: '#2A2F37',
    bgClass: 'bg-app-border-subtle',
    textClass: 'text-app-text-primary',
    description: '1px divider lines, card boundaries, table cell borders',
    category: 'Borders & Text',
  },
  {
    name: 'Primary Text',
    token: 'text-app-text-primary',
    hex: '#EDEEF0',
    bgClass: 'bg-app-text-primary',
    textClass: 'text-app-base',
    description: 'High-contrast primary typography for headings & body copy',
    category: 'Borders & Text',
  },
  {
    name: 'Secondary Text',
    token: 'text-app-text-secondary',
    hex: '#9AA1AC',
    bgClass: 'bg-app-text-secondary',
    textClass: 'text-app-base',
    description: 'Muted captions, metadata labels, timestamps, placeholders',
    category: 'Borders & Text',
  },

  // Status & Accents
  {
    name: 'Primary Accent',
    token: 'bg-app-accent-primary',
    hex: '#E08A3C',
    bgClass: 'bg-app-accent-primary',
    textClass: 'text-app-base',
    description: 'Brand identity, primary buttons, highlighted active states',
    category: 'Status & Accents',
  },
  {
    name: 'Active / Pending Accent',
    token: 'bg-app-accent-active',
    hex: '#F2B84B',
    bgClass: 'bg-app-accent-active',
    textClass: 'text-app-base',
    description: 'In-progress workflow nodes, warnings, active pending actions',
    category: 'Status & Accents',
  },
  {
    name: 'Complete Accent',
    token: 'bg-app-accent-complete',
    hex: '#3FA66A',
    bgClass: 'bg-app-accent-complete',
    textClass: 'text-app-base',
    description: 'Success states, completed stages, approvals, verified badges',
    category: 'Status & Accents',
  },
  {
    name: 'Critical Accent',
    token: 'bg-app-accent-critical',
    hex: '#D9564B',
    bgClass: 'bg-app-accent-critical',
    textClass: 'text-app-base',
    description: 'SLA breach warnings, critical severity tiers, errors, rejections',
    category: 'Status & Accents',
  },
  {
    name: 'Info Accent',
    token: 'bg-app-accent-info',
    hex: '#4F8FE0',
    bgClass: 'bg-app-accent-info',
    textClass: 'text-app-base',
    description: 'Informational badges, tooltips, system notices, links',
    category: 'Status & Accents',
  },

  // Workflow
  {
    name: 'Future Node',
    token: 'text-app-future-node on bg-app-future-node-bg',
    hex: '#3A3F47 / #1B1E23',
    bgClass: 'bg-app-future-node-bg',
    textClass: 'text-app-future-node',
    borderClass: 'border-app-future-node',
    description: 'Upcoming pipeline nodes (#3A3F47 text/border on #1B1E23 surface)',
    category: 'Workflow',
  },
];

const categories = [
  'Backgrounds & Surfaces',
  'Borders & Text',
  'Status & Accents',
  'Workflow',
] as const;

export const App: React.FC = () => {
  const { user, loading: authLoading, login, logout, isAuthenticated } = useAuth();
  const { roles, refetch: refetchRoles } = useRoleAssignments();
  
  // Realtime Ticket subscription state
  const [targetTicketId, setTargetTicketId] = useState<string>('');
  const [activeSubscriptionId, setActiveSubscriptionId] = useState<string>('');
  const [receivedEvents, setReceivedEvents] = useState<any[]>([]);

  // Auth form state
  const [emailInput, setEmailInput] = useState<string>(
    import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEMO_ENABLED === 'true'
      ? import.meta.env.VITE_LOCAL_STUDENT_EMAIL
      : 'student1@test.com'
  );
  const [passwordInput, setPasswordInput] = useState<string>(
    import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEMO_ENABLED === 'true'
      ? import.meta.env.VITE_LOCAL_STUDENT_PASSWORD
      : 'password123'
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginMode, setLoginMode] = useState<'student' | 'admin'>('student');
  const [showPassword, setShowPassword] = useState(false);

  // Hook subscription for target ticket
  useTicketRealtime({
    ticketId: activeSubscriptionId || undefined,
    onUpdate: (payload) => {
      setReceivedEvents((prev) => [
        {
          timestamp: new Date().toLocaleTimeString(),
          eventType: payload.eventType,
          table: payload.table,
          new: payload.new,
          old: payload.old,
        },
        ...prev.slice(0, 10),
      ]);
    },
  });

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      await login(emailInput, passwordInput);
      window.history.replaceState({}, '', loginMode === 'admin' ? '/admin' : '/#new_query');
    } catch (err: any) {
      setAuthError(err.message || 'Login failed');
    }
  };

  const selectLoginMode = (mode: 'student' | 'admin') => {
    setLoginMode(mode);
    setAuthError(null);
    if (import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEMO_ENABLED === 'true') {
      setEmailInput(mode === 'admin' ? import.meta.env.VITE_LOCAL_ADMIN_EMAIL : import.meta.env.VITE_LOCAL_STUDENT_EMAIL);
      setPasswordInput(mode === 'admin' ? import.meta.env.VITE_LOCAL_ADMIN_PASSWORD : import.meta.env.VITE_LOCAL_STUDENT_PASSWORD);
    }
  };

  const handleStartSubscription = (e: React.FormEvent) => {
    e.preventDefault();
    if (targetTicketId.trim()) {
      setActiveSubscriptionId(targetTicketId.trim());
    }
  };

  return !isAuthenticated && !authLoading ? (
      <main className="min-h-screen bg-app-base text-app-text-primary login-shell">
        <div className="login-brand">
          <div className="login-brand-mark"><ShieldCheck className="w-5 h-5" /></div>
          <span>WILLUP</span>
        </div>

        <div className="login-layout">
          <section className="login-intro">
            <p className="login-kicker">Institutional service delivery</p>
            <h1>Smarter requests.<br /><em>Stronger institutions.</em></h1>
            <p className="login-lead">The unified operating system for campus workflows, issue resolution, and human-guided AI service delivery.</p>
            <div className="login-highlights">
              <div><span className="login-highlight-icon"><Zap className="w-4 h-4" /></span><span><strong>Instant triage</strong><small>Requests reach the right department quickly.</small></span></div>
              <div><span className="login-highlight-icon"><Clock3 className="w-4 h-4" /></span><span><strong>Real-time tracking</strong><small>See every SLA status and approval step.</small></span></div>
              <div><span className="login-highlight-icon"><ShieldCheck className="w-4 h-4" /></span><span><strong>Governed access</strong><small>Role-based permissions and audit trails.</small></span></div>
            </div>
          </section>

          <section className="login-card" aria-label="WILLUP login">
            <div className="login-card-heading">
              <h2>Welcome back</h2>
              <p>Enter your details to sign in.</p>
            </div>
            <div className="login-tabs" role="tablist" aria-label="Login type">
              <button type="button" role="tab" aria-selected={loginMode === 'student'} className={loginMode === 'student' ? 'active' : ''} onClick={() => selectLoginMode('student')}><UserRound className="w-3.5 h-3.5" /> Student Login</button>
              <button type="button" role="tab" aria-selected={loginMode === 'admin'} className={loginMode === 'admin' ? 'active' : ''} onClick={() => selectLoginMode('admin')}><ShieldCheck className="w-3.5 h-3.5" /> Admin Login</button>
            </div>
            <form onSubmit={handleLoginSubmit} className="login-form">
              <label>Email address<input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} required autoComplete="email" /><Mail className="field-icon" /></label>
              <label>Password<span className="password-label"><button type="button" onClick={() => setAuthError('Use your configured Supabase or local demo password.')} className="forgot-link">Forgot password?</button></span><span className="password-field"><input type={showPassword ? 'text' : 'password'} value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} required autoComplete="current-password" /><LockKeyhole className="field-icon" /><button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></span></label>
              {authError && <p className="login-error">{authError}</p>}
              <button type="submit" disabled={authLoading} className="login-submit">{authLoading ? 'Signing in...' : 'Sign in'} <ArrowRight className="w-4 h-4" /></button>
            </form>
            <div className="login-divider"><span>or</span></div>
            <button type="button" className="login-google" onClick={() => setAuthError('Google sign-in requires a configured Supabase OAuth provider.')}><span className="google-g">G</span> Sign in with Google</button>
            <p className="login-signup">New here? <button type="button" onClick={() => setAuthError('Account creation is managed by your institution.')}>Create an account</button></p>
          </section>
        </div>
      </main>
    ) : (
    <AppLayout>
      {({ activeDestination, onNavigate, pendingCount }: { activeDestination: NavDestination; onNavigate: (d: NavDestination) => void; pendingCount: number }) => {
        if (activeDestination === 'profile_settings') {
          return (
            <div className="p-6 md:p-12 max-w-6xl mx-auto space-y-12 animate-in fade-in duration-300">
              <PlaceholderView destination="profile_settings" onNavigate={onNavigate} pendingCount={pendingCount} />

              {/* Interactive Auth, Roles & Realtime Testbed Panel */}
              <section className="space-y-6 pt-8 border-t border-app-border-subtle">
                <div className="flex items-center gap-2 border-b border-app-border-subtle/60 pb-3">
                  <Activity className="w-5 h-5 text-app-accent-active" />
                  <h2 className="text-xl font-semibold text-app-text-primary">
                    Live Auth &amp; Realtime Verification Console
                  </h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Auth Card */}
                  <div className="bg-app-surface border border-app-border-subtle rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-app-accent-primary" />
                        <h3 className="text-sm font-semibold text-app-text-primary">useAuth State</h3>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                        isAuthenticated
                          ? 'bg-app-accent-complete/20 text-app-accent-complete border border-app-accent-complete/40'
                          : 'bg-app-accent-critical/20 text-app-accent-critical border border-app-accent-critical/40'
                      }`}>
                        {isAuthenticated ? 'Authenticated' : 'Logged Out'}
                      </span>
                    </div>

                    {isAuthenticated ? (
                      <div className="space-y-3 text-xs">
                        <div>
                          <span className="text-app-text-secondary">Email:</span>
                          <p className="font-mono text-app-text-primary mt-0.5 truncate">{user?.email}</p>
                        </div>
                        <div>
                          <span className="text-app-text-secondary">User ID:</span>
                          <p className="font-mono text-app-text-secondary mt-0.5 truncate">{user?.id}</p>
                        </div>
                        <button
                          onClick={() => logout()}
                          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-app-accent-critical/10 text-app-accent-critical border border-app-accent-critical/30 font-semibold hover:bg-app-accent-critical/20 transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Sign Out
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleLoginSubmit} className="space-y-3">
                        <div>
                          <label className="text-[11px] text-app-text-secondary">Email</label>
                          <input
                            type="email"
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-app-surface-raised border border-app-border-subtle text-xs text-app-text-primary focus:outline-none focus:border-app-accent-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-app-text-secondary">Password</label>
                          <input
                            type="password"
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-app-surface-raised border border-app-border-subtle text-xs text-app-text-primary focus:outline-none focus:border-app-accent-primary"
                          />
                        </div>
                        {authError && <p className="text-[11px] text-app-accent-critical">{authError}</p>}
                        <button
                          type="submit"
                          disabled={authLoading}
                          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-app-accent-primary text-app-base font-semibold text-xs hover:opacity-90 transition-opacity"
                        >
                          <LogIn className="w-3.5 h-3.5" />
                          {authLoading ? 'Signing in...' : 'Sign In'}
                        </button>
                      </form>
                    )}
                  </div>

                  {/* Role Assignments Card */}
                  <div className="bg-app-surface border border-app-border-subtle rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-app-accent-info" />
                        <h3 className="text-sm font-semibold text-app-text-primary">useRoleAssignments</h3>
                      </div>
                      <button
                        onClick={() => refetchRoles()}
                        className="p-1 rounded text-app-text-secondary hover:text-app-text-primary"
                        title="Refetch"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {roles.length === 0 ? (
                        <p className="text-xs text-app-text-secondary italic">No roles assigned (Regular student)</p>
                      ) : (
                        roles.map((role) => (
                          <div key={role.id} className="p-2 rounded bg-app-surface-raised border border-app-border-subtle text-xs space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-app-text-primary">{role.name}</span>
                              <span className="text-[10px] font-mono text-app-accent-info">{role.domain}</span>
                            </div>
                            <p className="text-[10px] text-app-text-secondary font-mono">Order: {role.order}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Realtime Subscription Card */}
                  <div className="bg-app-surface border border-app-border-subtle rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-app-accent-active" />
                        <h3 className="text-sm font-semibold text-app-text-primary">useTicketRealtime</h3>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                        activeSubscriptionId ? 'bg-app-accent-complete/20 text-app-accent-complete' : 'bg-app-surface-raised text-app-text-secondary'
                      }`}>
                        {activeSubscriptionId ? 'SUBSCRIBED' : 'IDLE'}
                      </span>
                    </div>

                    <form onSubmit={handleStartSubscription} className="space-y-2">
                      <input
                        type="text"
                        placeholder="Enter Ticket UUID"
                        value={targetTicketId}
                        onChange={(e) => setTargetTicketId(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-app-surface-raised border border-app-border-subtle text-xs text-app-text-primary font-mono"
                      />
                      <button
                        type="submit"
                        className="w-full py-1.5 px-3 rounded-lg bg-app-surface-raised border border-app-border-subtle text-xs font-semibold text-app-text-primary hover:border-app-accent-primary"
                      >
                        Subscribe to Ticket CDC
                      </button>
                    </form>

                    <div className="text-xs space-y-1">
                      <span className="text-app-text-secondary text-[11px]">Recent CDC Events:</span>
                      <div className="bg-app-base p-2 rounded border border-app-border-subtle font-mono text-[10px] max-h-28 overflow-y-auto space-y-1">
                        {receivedEvents.length === 0 ? (
                          <p className="text-app-text-secondary italic">No events received yet</p>
                        ) : (
                          receivedEvents.map((ev, i) => (
                            <div key={i} className="text-app-accent-active truncate">
                              [{ev.timestamp}] {ev.eventType} on {ev.table}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Design Tokens Swatches Panel */}
              <section className="space-y-6 pt-8 border-t border-app-border-subtle">
                <div className="flex items-center gap-2 border-b border-app-border-subtle/60 pb-3">
                  <Palette className="w-5 h-5 text-app-accent-primary" />
                  <h2 className="text-xl font-semibold text-app-text-primary">
                    Design Tokens &amp; Dark Theme Palette (§11.1)
                  </h2>
                </div>

                <div className="space-y-8">
                  {categories.map((cat) => (
                    <div key={cat} className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-app-text-secondary">
                        {cat}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {colorTokens
                          .filter((c) => c.category === cat)
                          .map((token) => (
                            <div
                              key={token.name}
                              className="bg-app-surface border border-app-border-subtle rounded-xl p-4 space-y-3 shadow-sm hover:border-app-border-subtle/80 transition-colors"
                            >
                              <div
                                className={`h-14 rounded-lg flex items-center justify-center font-mono text-xs font-semibold ${token.bgClass} ${
                                  token.textClass || 'text-app-text-primary'
                                } ${token.borderClass ? `border ${token.borderClass}` : 'border border-app-border-subtle/50'}`}
                              >
                                {token.hex}
                              </div>
                              <div>
                                <h4 className="font-semibold text-sm text-app-text-primary">{token.name}</h4>
                                <code className="text-xs text-app-accent-primary font-mono block mt-0.5">{token.token}</code>
                                <p className="text-xs text-app-text-secondary mt-1 line-clamp-2">{token.description}</p>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          );
        }

        return <PlaceholderView destination={activeDestination} onNavigate={onNavigate} pendingCount={pendingCount} />;
      }}
    </AppLayout>
    );
};

export default App;
