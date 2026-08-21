import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  UserPlus, 
  Trash2, 
  Search, 
  Building2, 
  Clock, 
  AlertCircle, 
  Loader2, 
  X, 
  Check
} from 'lucide-react';
import { api } from '../../lib/api';

interface UserSearchItem {
  id: string;
  username: string;
  displayName: string;
  roleAssignments?: Array<{ role: { name: string; domain: string } }>;
}

interface RoleMemberItem {
  id: string;
  userId: string;
  roleId: string;
  user: {
    id: string;
    username: string;
    displayName: string;
  };
}

interface AdminRole {
  id: string;
  name: string;
  domain: string;
  order: number;
  escalationMinutes?: number | null;
  assignments: RoleMemberItem[];
}

export const RolesMembersSection: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedDomain, setSelectedDomain] = useState<string>('ALL');

  // Add Member Modal State
  const [activeRoleForAdd, setActiveRoleForAdd] = useState<AdminRole | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<UserSearchItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSearchItem | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch roles with assignments
  const { data: rolesData, isLoading, error } = useQuery({
    queryKey: ['adminRoles'],
    queryFn: async () => {
      const res = await api.admin.getRoles();
      return (res.roles || []) as AdminRole[];
    },
  });


  // Debounced search-as-you-type
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.admin.searchUsers(searchQuery.trim());
        setSearchResults(res.users || []);
      } catch (err) {
        console.error('Search users error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Mutation: Add Member
  const addMemberMutation = useMutation({
    mutationFn: async ({ roleId, username }: { roleId: string; username: string }) => {
      return api.admin.addRoleMember(roleId, username);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRoles'] });
      setFeedbackMsg({ type: 'success', text: `Successfully added ${selectedUser?.displayName || selectedUser?.username} to role.` });
      setTimeout(() => {
        setActiveRoleForAdd(null);
        setSelectedUser(null);
        setSearchQuery('');
        setFeedbackMsg(null);
      }, 1200);
    },
    onError: (err: any) => {
      setFeedbackMsg({ type: 'error', text: err?.message || 'Failed to add member to role' });
    },
  });

  // Mutation: Remove Member
  const removeMemberMutation = useMutation({
    mutationFn: async ({ roleId, userId }: { roleId: string; userId: string }) => {
      return api.admin.removeRoleMember(roleId, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRoles'] });
    },
    onError: (err: any) => {
      alert(`Could not remove member: ${err?.message || 'Unknown error'}`);
    },
  });

  const roles = rolesData || [];
  const domains = ['ALL', 'HOSTEL_MAINTENANCE', 'CERTIFICATE', 'LABORATORY', 'GRIEVANCE'];

  const filteredRoles = selectedDomain === 'ALL' 
    ? roles 
    : roles.filter((r) => r.domain === selectedDomain);

  // Group roles by domain
  const rolesByDomain = filteredRoles.reduce<Record<string, AdminRole[]>>((acc, role) => {
    if (!acc[role.domain]) acc[role.domain] = [];
    acc[role.domain].push(role);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* ── Filter Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-app-surface border border-app-border-subtle">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-app-accent-info" />
          <span className="text-xs font-semibold text-app-text-secondary uppercase tracking-wider">
            Filter by Domain:
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {domains.map((dom) => (
            <button
              key={dom}
              onClick={() => setSelectedDomain(dom)}
              className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors ${
                selectedDomain === dom
                  ? 'bg-app-accent-primary text-app-base font-bold shadow-sm'
                  : 'bg-app-surface-raised text-app-text-secondary hover:text-app-text-primary border border-app-border-subtle'
              }`}
            >
              {dom}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12 space-x-3 text-app-text-secondary">
          <Loader2 className="w-5 h-5 animate-spin text-app-accent-primary" />
          <span className="text-xs">Loading institutional roles and memberships...</span>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl bg-app-accent-critical/10 border border-app-accent-critical/30 text-app-accent-critical text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>Error loading role memberships: {(error as any)?.message || 'Failed to fetch roles'}</span>
        </div>
      ) : Object.keys(rolesByDomain).length === 0 ? (
        <div className="p-12 text-center text-xs text-app-text-secondary bg-app-surface border border-app-border-subtle rounded-xl">
          No roles found for the selected domain filter.
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(rolesByDomain).map(([domainName, domainRoles]) => (
            <div key={domainName} className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-app-border-subtle/70">
                <span className="text-xs font-mono font-bold text-app-accent-primary uppercase tracking-wider">
                  {domainName}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-app-surface-raised border border-app-border-subtle text-app-text-secondary font-mono">
                  {domainRoles.length} Hierarchy Stages
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {domainRoles.map((role) => (
                  <div
                    key={role.id}
                    className="p-5 rounded-2xl bg-app-surface border border-app-border-subtle flex flex-col justify-between space-y-4 shadow-sm hover:border-app-border-subtle/80 transition-colors"
                  >
                    {/* Header: Role Name & Stage Order */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-app-text-primary">
                            {role.name}
                          </h4>
                          <span className="px-2 py-0.5 rounded bg-app-accent-info/15 text-app-accent-info border border-app-accent-info/30 font-mono text-[9px] font-bold uppercase">
                            Stage {role.order + 1}
                          </span>
                        </div>
                        <p className="text-[11px] text-app-text-secondary font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3 text-app-accent-active" />
                          <span>Escalation SLA: {role.escalationMinutes || 60} minutes</span>
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveRoleForAdd(role);
                          setSelectedUser(null);
                          setSearchQuery('');
                          setSearchResults([]);
                          setFeedbackMsg(null);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-app-surface-raised border border-app-border-subtle text-xs font-semibold text-app-text-primary hover:bg-app-accent-primary hover:text-app-base transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Add Member</span>
                      </button>
                    </div>

                    {/* Members List */}
                    <div className="space-y-2 pt-2 border-t border-app-border-subtle/50">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-app-text-secondary">
                        <span>Assigned Personnel ({role.assignments?.length || 0})</span>
                      </div>

                      {(!role.assignments || role.assignments.length === 0) ? (
                        <div className="p-3 rounded-lg bg-app-surface-raised/50 border border-dashed border-app-border-subtle text-center text-xs text-app-text-secondary italic">
                          No members currently assigned to this role.
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {role.assignments.map((assignment) => (
                            <div
                              key={assignment.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-app-surface-raised border border-app-border-subtle text-xs group"
                            >
                              <div className="flex items-center gap-2 min-w-0 pr-2">
                                <div className="w-6 h-6 rounded-full bg-app-accent-info/20 text-app-accent-info font-bold text-[10px] flex items-center justify-center flex-shrink-0 font-mono">
                                  {(assignment.user?.displayName || assignment.user?.username || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div className="truncate">
                                  <div className="font-semibold text-app-text-primary truncate text-[11px]">
                                    {assignment.user?.displayName || assignment.user?.username}
                                  </div>
                                  <div className="text-[10px] text-app-text-secondary font-mono truncate">
                                    @{assignment.user?.username}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => removeMemberMutation.mutate({ roleId: role.id, userId: assignment.userId })}
                                disabled={removeMemberMutation.isPending}
                                className="p-1.5 rounded text-app-text-secondary hover:text-app-accent-critical hover:bg-app-accent-critical/10 transition-colors opacity-80 group-hover:opacity-100"
                                title="Remove member from role"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add Member Search Modal ── */}
      {activeRoleForAdd && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-app-surface border border-app-border-subtle rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setActiveRoleForAdd(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-app-text-secondary hover:text-app-text-primary hover:bg-app-surface-raised"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-app-text-primary flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-app-accent-primary" />
                Add Member to Role
              </h3>
              <p className="text-xs text-app-text-secondary font-mono">
                Role: <span className="text-app-text-primary font-bold">{activeRoleForAdd.name}</span> ({activeRoleForAdd.domain})
              </p>
            </div>

            {/* Search Input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-app-text-secondary">
                Search User (Username or Name)
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-app-text-secondary" />
                <input
                  type="text"
                  placeholder="Type username (e.g. biswajit, warden, caretaker)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-app-surface-raised border border-app-border-subtle text-xs text-app-text-primary placeholder:text-app-text-secondary focus:outline-none focus:border-app-accent-primary"
                  autoFocus
                />
                {isSearching && (
                  <Loader2 className="w-4 h-4 absolute right-3 top-3 animate-spin text-app-accent-primary" />
                )}
              </div>
            </div>

            {/* Search Results Dropdown List */}
            {searchQuery.length >= 2 && (
              <div className="space-y-1 max-h-48 overflow-y-auto p-1 rounded-xl bg-app-base border border-app-border-subtle">
                {searchResults.length === 0 && !isSearching ? (
                  <div className="p-3 text-center text-xs text-app-text-secondary italic">
                    No matching users found for "{searchQuery}".
                  </div>
                ) : (
                  searchResults.map((u) => {
                    const isSelected = selectedUser?.id === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setSelectedUser(u)}
                        className={`w-full text-left p-2 rounded-lg flex items-center justify-between text-xs transition-colors ${
                          isSelected
                            ? 'bg-app-accent-primary text-app-base font-semibold'
                            : 'hover:bg-app-surface-raised text-app-text-primary'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <div className="font-semibold truncate">{u.displayName || u.username}</div>
                          <div className={`text-[10px] font-mono ${isSelected ? 'text-app-base/80' : 'text-app-text-secondary'}`}>
                            @{u.username}
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 flex-shrink-0 text-app-base" />}
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {/* Feedback Message */}
            {feedbackMsg && (
              <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                feedbackMsg.type === 'success'
                  ? 'bg-app-accent-complete/15 text-app-accent-complete border border-app-accent-complete/30'
                  : 'bg-app-accent-critical/15 text-app-accent-critical border border-app-accent-critical/30'
              }`}>
                {feedbackMsg.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{feedbackMsg.text}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveRoleForAdd(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-app-text-secondary hover:text-app-text-primary hover:bg-app-surface-raised"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!selectedUser || addMemberMutation.isPending}
                onClick={() => {
                  if (selectedUser && activeRoleForAdd) {
                    addMemberMutation.mutate({
                      roleId: activeRoleForAdd.id,
                      username: selectedUser.username,
                    });
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-app-accent-primary text-app-base text-xs font-bold shadow-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {addMemberMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Assigning...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Assign to Role</span>
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

export default RolesMembersSection;
