import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  BookOpen, 
  UploadCloud, 
  FileText, 
  Layers, 
  Calendar, 
  Check, 
  X, 
  AlertCircle, 
  Loader2
} from 'lucide-react';
import { api } from '../../lib/api';


interface KnowledgeDoc {
  id: string;
  title: string;
  domain?: string | null;
  sourceUrl?: string | null;
  createdAt: string;
}

export const KnowledgeBaseSection: React.FC = () => {
  const queryClient = useQueryClient();

  // Ingestion Modal State
  const [isIngestOpen, setIsIngestOpen] = useState<boolean>(false);
  const [formTitle, setFormTitle] = useState<string>('');
  const [formDomain, setFormDomain] = useState<string>('HOSTEL_MAINTENANCE');
  const [formCategory, setFormCategory] = useState<string>('POLICY');
  const [formSourceUrl, setFormSourceUrl] = useState<string>('');
  const [formContent, setFormContent] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string; details?: any } | null>(null);

  // Fetch documents
  const { data: docsData, isLoading, error } = useQuery({
    queryKey: ['adminKnowledgeDocs'],
    queryFn: async () => {
      const res = await api.knowledge.getDocuments();
      return (res.documents || []) as KnowledgeDoc[];
    },
  });

  // Mutation: Ingest Document into Vector DB
  const ingestMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; domain: string; category: string; sourceUrl?: string }) => {
      return api.knowledge.ingest(data);
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['adminKnowledgeDocs'] });
      setFeedback({
        type: 'success',
        text: `Document ingested into RAG store! Generated ${res.chunkCount || 1} vector chunks with dimension ${res.embeddingDimension || 768}.`,
        details: res,
      });
      setTimeout(() => {
        setIsIngestOpen(false);
        setFormTitle('');
        setFormContent('');
        setFormSourceUrl('');
        setFeedback(null);
      }, 2000);
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', text: err?.message || 'Failed to ingest document' });
    },
  });

  const docs = docsData || [];

  return (
    <div className="space-y-6">
      {/* ── Section Header & Ingest Action ── */}
      <div className="p-4 rounded-xl bg-app-surface border border-app-border-subtle flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-5 h-5 text-app-accent-info flex-shrink-0" />
          <div className="text-xs">
            <h3 className="font-bold text-app-text-primary">
              RAG Knowledge Base &amp; Policy Ingestion (§13.6 &amp; Prompt 14)
            </h3>
            <p className="text-app-text-secondary">
              Ingest institutional regulations, hostel bylaws, lab safety guides, and certificate workflows into pgvector.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsIngestOpen(true);
            setFeedback(null);
          }}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-app-accent-primary text-app-base text-xs font-bold shadow-sm hover:opacity-90 transition-opacity"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Ingest New Document</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12 space-x-3 text-app-text-secondary">
          <Loader2 className="w-5 h-5 animate-spin text-app-accent-primary" />
          <span className="text-xs">Loading ingested knowledge documents...</span>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl bg-app-accent-critical/10 border border-app-accent-critical/30 text-app-accent-critical text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>Error loading documents: {(error as any)?.message || 'Failed to fetch'}</span>
        </div>
      ) : docs.length === 0 ? (
        <div className="p-12 text-center text-xs text-app-text-secondary bg-app-surface border border-app-border-subtle rounded-xl">
          No knowledge documents ingested yet. Click "Ingest New Document" to upload institutional policies.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="p-5 rounded-2xl bg-app-surface border border-app-border-subtle flex flex-col justify-between space-y-4 shadow-sm hover:border-app-border-subtle/80 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-app-accent-primary flex-shrink-0" />
                    <h4 className="text-sm font-bold text-app-text-primary line-clamp-1">
                      {doc.title}
                    </h4>
                  </div>
                  <span className="px-2.5 py-0.5 rounded bg-app-accent-info/15 text-app-accent-info border border-app-accent-info/30 font-mono text-[9px] font-bold uppercase flex-shrink-0">
                    {doc.domain || 'GLOBAL'}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-[11px] font-mono text-app-text-secondary">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-app-accent-active" />
                    <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Layers className="w-3 h-3 text-app-accent-complete" />
                    <span>Vector Embedded</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-app-border-subtle/50 flex items-center justify-between text-[10px] font-mono text-app-text-secondary">
                <span className="truncate max-w-[200px]">ID: {doc.id}</span>
                <span className="px-2 py-0.5 rounded bg-app-surface-raised border border-app-border-subtle text-app-accent-complete">
                  Active in RAG
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Ingest Document Modal ── */}
      {isIngestOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-app-surface border border-app-border-subtle rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsIngestOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-app-text-secondary hover:text-app-text-primary hover:bg-app-surface-raised"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-app-text-primary flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-app-accent-primary" />
                Ingest Institutional Policy Document
              </h3>
              <p className="text-xs text-app-text-secondary">
                Upload rules or guidelines to enrich the RAG knowledge retriever for student query resolution.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!formTitle.trim() || !formContent.trim()) return;
                ingestMutation.mutate({
                  title: formTitle.trim(),
                  domain: formDomain,
                  category: formCategory,
                  sourceUrl: formSourceUrl.trim() || undefined,
                  content: formContent.trim(),
                });
              }}
              className="space-y-4 text-xs"
            >
              {/* Document Title */}
              <div className="space-y-1.5">
                <label className="font-semibold text-app-text-secondary">Document Title</label>
                <input
                  type="text"
                  placeholder="e.g. Hostel Maintenance Standard Operating Procedures 2026"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-app-surface-raised border border-app-border-subtle text-xs text-app-text-primary focus:outline-none focus:border-app-accent-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Domain */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-app-text-secondary">Target Domain</label>
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

                {/* Category */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-app-text-secondary">Category</label>
                  <input
                    type="text"
                    placeholder="e.g. POLICY, SAFETY, BYLAWS"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-app-surface-raised border border-app-border-subtle text-xs text-app-text-primary font-mono focus:outline-none focus:border-app-accent-primary"
                  />
                </div>
              </div>

              {/* Source URL */}
              <div className="space-y-1.5">
                <label className="font-semibold text-app-text-secondary">Official Source URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://institute.edu/policies/hostel.pdf"
                  value={formSourceUrl}
                  onChange={(e) => setFormSourceUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-app-surface-raised border border-app-border-subtle text-xs text-app-text-primary font-mono focus:outline-none focus:border-app-accent-primary"
                />
              </div>

              {/* Document Content */}
              <div className="space-y-1.5">
                <label className="font-semibold text-app-text-secondary">
                  Document Text / Policy Content (Plaintext or Markdown)
                </label>
                <textarea
                  rows={6}
                  placeholder="Paste institutional policy text, rules, response guidelines, or workflow requirements..."
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  required
                  className="w-full p-3 rounded-xl bg-app-surface-raised border border-app-border-subtle text-xs text-app-text-primary font-mono focus:outline-none focus:border-app-accent-primary leading-relaxed"
                />
              </div>

              {/* Feedback Message */}
              {feedback && (
                <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  feedback.type === 'success'
                    ? 'bg-app-accent-complete/15 text-app-accent-complete border border-app-accent-complete/30'
                    : 'bg-app-accent-critical/15 text-app-accent-critical border border-app-accent-critical/30'
                }`}>
                  {feedback.type === 'success' ? <Check className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                  <span>{feedback.text}</span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsIngestOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-app-text-secondary hover:text-app-text-primary hover:bg-app-surface-raised"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={!formTitle.trim() || !formContent.trim() || ingestMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-app-accent-primary text-app-base text-xs font-bold shadow-md hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {ingestMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Embedding &amp; Ingesting...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Ingest into Knowledge Base</span>
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

export default KnowledgeBaseSection;
