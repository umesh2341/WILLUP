import { supabase } from './supabaseClient';

const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || process.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Base fetch wrapper that automatically attaches the active Supabase JWT session token.
 */
async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Set default JSON Content-Type if body is not FormData
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: response.statusText || 'An unexpected API error occurred' };
    }
    const error = new Error(errorData.error || errorData.message || `API error (${response.status})`);
    (error as any).status = response.status;
    (error as any).data = errorData;
    throw error;
  }

  return response.json();
}

export const api = {
  // Chat & Ingestion AI Agent Endpoints
  chat: {
    sendMessage: (data: { message: string; history?: any[]; isFollowUp?: boolean }) =>
      fetchWithAuth('/chat/message', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // Tickets & Workflow Endpoints
  tickets: {
    getMine: () => fetchWithAuth('/tickets?filter=mine'),
    getPending: () => fetchWithAuth('/tickets?filter=pending'),
    getResolved: () => fetchWithAuth('/tickets?filter=resolved'),
    getById: (id: string) => fetchWithAuth(`/tickets/${id}`),
    getCollectiveGroups: () => fetchWithAuth('/tickets/collective-groups'),
    getCollectiveGroup: (id: string) => fetchWithAuth(`/tickets/collective-groups/${id}`),

    
    uploadDocument: (id: string, file: File) => {
      const formData = new FormData();
      formData.append('document', file);
      return fetchWithAuth(`/tickets/${id}/documents`, {
        method: 'POST',
        body: formData,
      });
    },

    approve: (id: string, data: { stageId?: string; comment?: string } = {}) =>
      fetchWithAuth(`/tickets/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    reject: (id: string, data: { stageId?: string; comment?: string } = {}) =>
      fetchWithAuth(`/tickets/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // Audit Log Endpoints
  audit: {
    getByTicketId: (ticketId: string) => fetchWithAuth(`/audit/${ticketId}`),
  },


  // Admin Configuration & Governance Endpoints
  admin: {
    getDashboard: () => fetchWithAuth('/admin/dashboard'),
    getRoles: () => fetchWithAuth('/admin/roles'),
    searchUsers: (query: string) => fetchWithAuth(`/admin/users/search?q=${encodeURIComponent(query)}`),
    
    addRoleMember: (roleId: string, username: string) =>
      fetchWithAuth(`/admin/roles/${roleId}/members`, {
        method: 'POST',
        body: JSON.stringify({ username }),
      }),

    removeRoleMember: (roleId: string, userId: string) =>
      fetchWithAuth(`/admin/roles/${roleId}/members/${userId}`, {
        method: 'DELETE',
      }),

    getSeverityRules: () => fetchWithAuth('/admin/severity-rules'),
    createSeverityRule: (data: {
      domain: string;
      keyword: string;
      severity?: string;
      tier?: string;
      escalationCadenceMinutes?: number;
    }) =>
      fetchWithAuth('/admin/severity-rules', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deleteSeverityRule: (id: string) =>
      fetchWithAuth(`/admin/severity-rules/${id}`, {
        method: 'DELETE',
      }),

    updateRole: (id: string, data: { escalationMinutes?: number; order?: number; name?: string }) =>
      fetchWithAuth(`/admin/roles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    getCollectiveGroups: () => fetchWithAuth('/admin/collective-groups'),
    getWorkflows: () => fetchWithAuth('/admin/workflows'),
    getAuditLogs: () => fetchWithAuth('/admin/audit'),
    dispatchCollectiveGroup: (id: string) =>
      fetchWithAuth(`/admin/collective-groups/${id}/dispatch`, {
        method: 'POST',
      }),
  },


  // Knowledge Base & RAG Endpoints
  knowledge: {
    getDocuments: () => fetchWithAuth('/knowledge/documents'),
    search: (data: { query: string; domain?: string }) =>
      fetchWithAuth('/knowledge/search', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    ingest: (data: {
      title: string;
      content: string;
      domain: string;
      category: string;
      tags?: string[];
    }) =>
      fetchWithAuth('/knowledge/ingest', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // User Profile & Roles Endpoints
  users: {
    getMe: () => fetchWithAuth('/users/me'),
  },

  // Public/Student Workflow Definitions
  workflows: {
    getAll: () => fetchWithAuth('/workflows'),
  },
};

export default api;
