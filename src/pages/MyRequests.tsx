/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db, type Request } from "../lib/db";
import { FileText, Plus } from "lucide-react";

export default function MyRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const all = await db.requests
        .where("requester_id")
        .equals(user!.id)
        .toArray();

      // Urutkan terbaru di atas berdasarkan created_at
      all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setRequests(all || []);
    } catch (err) {
      console.error("Gagal memuat permintaan saya:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending_verification: "bg-yellow-100 text-yellow-700",
      verified: "bg-blue-100 text-blue-700",
      approved: "bg-green-100 text-green-700",
      rejected: "bg-red-100 text-red-700",
      revision_requested: "bg-orange-100 text-orange-700",
    };
    const labels: Record<string, string> = {
      pending_verification: "Menunggu Verifikasi",
      verified: "Terverifikasi",
      approved: "Disetujui",
      rejected: "Ditolak",
      revision_requested: "Perlu Revisi",
    };
    return (
      <span
        className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[status] || "bg-gray-100"}`}
      >
        {labels[status] || status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Permintaan Saya</h1>
        <Link
          to="/app/new-request"
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Buat Baru
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200">
        {requests.length === 0 ? (
          <div className="py-16 text-center">
            <FileText size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 mb-4">Belum ada permintaan</p>
            <Link
              to="/app/new-request"
              className="text-blue-600 font-semibold hover:underline"
            >
              Buat permintaan pertama →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {requests.map((req) => (
              <Link
                key={req.id}
                to={`/app/request/${req.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
              >
                <div>
                  <div className="font-semibold text-slate-800">
                    {req.document_number}
                  </div>
                  <div className="text-sm text-slate-500">
                    {req.items?.length || 0} item •{" "}
                    <span className="text-purple-700 font-medium">Buku: {new Date(req.book_date || req.submission_date).toLocaleDateString("id-ID")}</span> •{" "}
                    <span>Dok: {new Date(req.document_date || req.submission_date).toLocaleDateString("id-ID")}</span>
                  </div>
                </div>
                {statusBadge(req.status)}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
