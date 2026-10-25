import React, { useEffect, useState } from "react";
import {
  FileText,
  Download,
  Share2,
  LogOut,
  ShieldCheck,
  Upload,
  HardDrive,
  Activity,
  X,
  Eye,
  Lock
} from "lucide-react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

interface DocumentItem {
  id: string;
  title: string;
  category: string;
  description: string;
  original_filename: string;
  file_size_bytes: number;
  sha256_checksum: string;
  created_at: string;
}

interface SharedDocumentItem {
  share_id: string;
  permission: string;
  expires_at: string | null;
  max_downloads: number | null;
  download_count: number;
  document_id: string;
  title: string;
  category: string;
  original_filename: string;
  file_size_bytes: number;
  shared_by: string;
}

interface AuditLogItem {
  id: string;
  action: string;
  actor_email: string;
  document_title: string;
  ip_address: string;
  current_hash: string;
  created_at: string;
}

export const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<"my-docs" | "shared" | "audit">("my-docs");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [sharedDocs, setSharedDocs] = useState<SharedDocumentItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload modal state
  const [isUploading, setIsUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Confidential");
  const [description, setDescription] = useState("");

  // Share modal state
  const [sharingDoc, setSharingDoc] = useState<DocumentItem | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [sharePermission, setSharePermission] = useState<"VIEW" | "DOWNLOAD">("DOWNLOAD");
  const [maxDownloads, setMaxDownloads] = useState<number>(3);
  const [expiryDays, setExpiryDays] = useState<number>(7);
  const [shareSubmitting, setShareSubmitting] = useState(false);

  // Secure Preview Viewer state
  const [viewingBlobUrl, setViewingBlobUrl] = useState<string | null>(null);
  const [viewingDocTitle, setViewingDocTitle] = useState<string>("");
  const [viewingMimeType, setViewingMimeType] = useState<string>("");

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [docsRes, sharedRes, auditRes] = await Promise.all([
        api.get("/documents"),
        api.get("/documents/shared-with-me"),
        api.get("/audit")
      ]);
      setDocuments(docsRes.data.documents || []);
      setSharedDocs(sharedRes.data.sharedDocuments || []);
      setAuditLogs(auditRes.data.logs || []);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleDownload = async (docId: string, filename: string) => {
    try {
      const response = await api.get(`/documents/${docId}/download`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      loadDashboardData();
    } catch (err: any) {
      alert(err.response?.data?.error || "Download failed: Access denied or file corrupted.");
    }
  };

  const handleView = async (docId: string, docTitle: string) => {
    try {
      const response = await api.get(`/documents/${docId}/download`, {
        responseType: "blob",
      });
      const mime = String(response.headers["content-type"] || "application/pdf");
      const fileBlob = new Blob([response.data], { type: mime });
      const fileUrl = window.URL.createObjectURL(fileBlob);

      setViewingBlobUrl(fileUrl);
      setViewingDocTitle(docTitle);
      setViewingMimeType(mime);
    } catch (err: any) {
      alert(err.response?.data?.error || "View failed: Access denied or link expired.");
    }
  };

  const closeViewer = () => {
    if (viewingBlobUrl) {
      window.URL.revokeObjectURL(viewingBlobUrl);
    }
    setViewingBlobUrl(null);
    setViewingDocTitle("");
    setViewingMimeType("");
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("category", category);
    formData.append("description", description);

    try {
      await api.post("/documents", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setIsUploading(false);
      setFile(null);
      setTitle("");
      setDescription("");
      loadDashboardData();
    } catch (err) {
      alert("Upload and encryption failed.");
    }
  };

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sharingDoc || !shareEmail) return;

    setShareSubmitting(true);
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Number(expiryDays));

      await api.post(`/documents/${sharingDoc.id}/share`, {
        recipientEmail: shareEmail,
        permission: sharePermission,
        maxDownloads: sharePermission === "VIEW" ? null : Number(maxDownloads),
        expiresAt: expiresAt.toISOString(),
      });

      alert(`Access successfully delegated to ${shareEmail}`);
      setSharingDoc(null);
      setShareEmail("");
      loadDashboardData();
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to share document.");
    } finally {
      setShareSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1 className="font-bold text-white text-lg leading-tight">Trust Vault</h1>
            <p className="text-xs text-slate-400">Encrypted Repository</p>
          </div>
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-right">
            <div className="text-sm font-medium text-white">{user?.fullName || user?.email}</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider">{user?.role || "Authorized User"}</div>
          </div>
          <button
            onClick={logout}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
            title="Sign Out"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex space-x-2 bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab("my-docs")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition cursor-pointer ${activeTab === "my-docs" ? "bg-emerald-500 text-slate-950 font-semibold" : "text-slate-400 hover:text-white"
                }`}
            >
              My Vault ({documents.length})
            </button>
            <button
              onClick={() => setActiveTab("shared")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition cursor-pointer ${activeTab === "shared" ? "bg-emerald-500 text-slate-950 font-semibold" : "text-slate-400 hover:text-white"
                }`}
            >
              Shared with Me ({sharedDocs.length})
            </button>
            <button
              onClick={() => setActiveTab("audit")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition cursor-pointer ${activeTab === "audit" ? "bg-emerald-500 text-slate-950 font-semibold" : "text-slate-400 hover:text-white"
                }`}
            >
              Audit Trail ({auditLogs.length})
            </button>
          </div>

          <button
            onClick={() => setIsUploading(true)}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-4 py-2.5 rounded-xl text-sm flex items-center space-x-2 shadow-lg transition cursor-pointer"
          >
            <Upload size={16} />
            <span>Encrypt & Upload</span>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-500">Loading secure records...</div>
        ) : activeTab === "my-docs" ? (
          documents.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl">
              <HardDrive className="mx-auto text-slate-600 mb-3" size={40} />
              <p className="text-slate-400 font-medium">No encrypted files stored yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {documents.map((doc) => (
                <div key={doc.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-2.5 bg-slate-800 text-emerald-400 rounded-lg">
                        <FileText size={20} />
                      </div>
                      <span className="text-[11px] font-semibold tracking-wider uppercase px-2.5 py-1 bg-slate-800 text-slate-300 rounded-full border border-slate-700">
                        {doc.category}
                      </span>
                    </div>
                    <h3 className="font-semibold text-white truncate mb-1">{doc.title}</h3>
                    <p className="text-xs text-slate-400 line-clamp-2 mb-4 h-8">{doc.description || "No description provided."}</p>

                    <div className="border-t border-slate-800/80 pt-3 text-[11px] text-slate-500 space-y-1 mb-4 font-mono">
                      <div className="truncate">SHA: {doc.sha256_checksum.slice(0, 16)}...</div>
                      <div>SIZE: {(doc.file_size_bytes / 1024).toFixed(1)} KB</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownload(doc.id, doc.original_filename)}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium py-2 rounded-lg flex items-center justify-center space-x-1.5 transition cursor-pointer"
                    >
                      <Download size={14} />
                      <span>Download</span>
                    </button>
                    <button
                      onClick={() => setSharingDoc(doc)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 rounded-lg transition cursor-pointer"
                      title="Share Document"
                    >
                      <Share2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeTab === "shared" ? (
          sharedDocs.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl">
              <Share2 className="mx-auto text-slate-600 mb-3" size={40} />
              <p className="text-slate-400 font-medium">No documents shared with your account.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sharedDocs.map((s) => (
                <div key={s.share_id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                        <Share2 size={20} />
                      </div>
                      <span className="text-[11px] font-semibold tracking-wider uppercase px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                        {s.permission}
                      </span>
                    </div>
                    <h3 className="font-semibold text-white truncate mb-1">{s.title}</h3>
                    <p className="text-xs text-slate-400 mb-3">Shared by: <span className="text-slate-300">{s.shared_by}</span></p>

                    <div className="border-t border-slate-800/80 pt-3 text-[11px] text-slate-400 space-y-1 mb-4 font-mono">
                      <div>Downloads: <span className="text-white">{s.download_count}</span> / {s.max_downloads ?? "∞"}</div>
                      {s.expires_at && <div>Expires: {new Date(s.expires_at).toLocaleDateString()}</div>}
                    </div>
                  </div>

                  {s.permission === "VIEW" ? (
                    <button
                      onClick={() => handleView(s.document_id, s.title)}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold text-xs py-2 rounded-lg flex items-center justify-center space-x-1.5 transition cursor-pointer border border-emerald-500/20"
                    >
                      <Eye size={14} />
                      <span>View (Protected)</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDownload(s.document_id, s.original_filename)}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs py-2 rounded-lg flex items-center justify-center space-x-1.5 transition cursor-pointer"
                    >
                      <Download size={14} />
                      <span>Download Shared File</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          auditLogs.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl">
              <Activity className="mx-auto text-slate-600 mb-3" size={40} />
              <p className="text-slate-400 font-medium">No audit entries recorded yet.</p>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase font-mono tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Timestamp</th>
                      <th className="px-6 py-3.5">Action</th>
                      <th className="px-6 py-3.5">Actor</th>
                      <th className="px-6 py-3.5">Resource</th>
                      <th className="px-6 py-3.5">Tamper-Evident Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/40 transition">
                        <td className="px-6 py-4 whitespace-nowrap text-slate-400">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-sans text-white">
                          {log.actor_email || "System"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-sans text-slate-300">
                          {log.document_title || "Key/Vault Management"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-mono">
                          {log.current_hash ? `${log.current_hash.slice(0, 16)}...` : "GENESIS"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </main>

      {/* SECURE PROTECTED VIEWER MODAL */}
      {viewingBlobUrl && (
        <div
          className="fixed inset-0 bg-black/85 backdrop-blur-md flex flex-col z-50 select-none"
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'p')) {
              e.preventDefault();
            }
          }}
        >
          <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                <Lock size={12} />
                VIEW-ONLY SESSION (DOWNLOAD RESTRICTED)
              </span>
              <span className="text-white text-sm font-semibold truncate max-w-md">{viewingDocTitle}</span>
            </div>
            <button
              onClick={closeViewer}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer"
            >
              <X size={14} />
              <span>Close Viewer</span>
            </button>
          </div>

          <div className="flex-1 w-full bg-slate-950 p-4 flex items-center justify-center overflow-hidden">
            {viewingMimeType.startsWith("image/") ? (
              <img
                src={viewingBlobUrl}
                alt={viewingDocTitle}
                className="max-h-full max-w-full object-contain pointer-events-none rounded-lg"
              />
            ) : (
              <iframe
                src={`${viewingBlobUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                title="Protected Viewer"
                className="w-full h-full border border-slate-800 rounded-lg bg-slate-900"
              />
            )}
          </div>
        </div>
      )}

      {/* Share Document Modal */}
      {sharingDoc && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setSharingDoc(null)}
              className="absolute right-5 top-5 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>
            <h2 className="text-lg font-bold text-white mb-1">Delegate Access</h2>
            <p className="text-xs text-slate-400 mb-5">
              Securely share <span className="text-emerald-400 font-medium">"{sharingDoc.title}"</span>
            </p>

            <form onSubmit={handleShareSubmit} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-medium text-slate-400 mb-1">Recipient Email</label>
                <input
                  type="email"
                  required
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="auditor@vault.local"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase font-medium text-slate-400 mb-1">Permission</label>
                  <select
                    value={sharePermission}
                    onChange={(e) => setSharePermission(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="DOWNLOAD">Download</option>
                    <option value="VIEW">View Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase font-medium text-slate-400 mb-1">Download Limit</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    disabled={sharePermission === "VIEW"}
                    value={sharePermission === "VIEW" ? "" : maxDownloads}
                    onChange={(e) => setMaxDownloads(Number(e.target.value))}
                    placeholder={sharePermission === "VIEW" ? "N/A (View Only)" : "3"}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase font-medium text-slate-400 mb-1">Valid For (Days)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setSharingDoc(null)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2.5 rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={shareSubmitting}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs py-2.5 rounded-lg transition cursor-pointer disabled:opacity-50"
                >
                  {shareSubmitting ? "Delegating..." : "Grant Access"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Encrypt & Upload Modal */}
      {isUploading && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsUploading(false)}
              className="absolute right-5 top-5 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>
            <h2 className="text-lg font-bold text-white mb-4">Encrypt & Upload Document</h2>
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-medium text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Q3 Audit Report"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs uppercase font-medium text-slate-400 mb-1">Category</label>
                <input
                  type="text"
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Confidential, Finance"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs uppercase font-medium text-slate-400 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional brief notes..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs uppercase font-medium text-slate-400 mb-1">File Payload</label>
                <input
                  type="file"
                  required
                  onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-emerald-400 hover:file:bg-slate-700"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsUploading(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2.5 rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs py-2.5 rounded-lg transition cursor-pointer"
                >
                  Stream Encrypt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
