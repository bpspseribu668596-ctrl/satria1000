/* eslint-disable react-hooks/set-state-in-effect */
 
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db, type Request } from "../lib/db";
import {
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  ListChecks,
  ShieldCheck,
} from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    const all = await db.requests.orderBy("created_at").reverse().toArray();
    setRequests(all);
    setLoading(false);
  };

    useEffect(() => {
    loadData();
  }, []);

  const myRequests = user?.role?.includes("pegawai")
    ? requests.filter((r) => r.requester_id === user.id)
    : requests;

  const stats = {
    total: myRequests.length,
    pending: myRequests.filter((r) =>
      ["pending_verification", "verified", "revision_requested"].includes(
        r.status,
      ),
    ).length,
    approved: myRequests.filter((r) => r.status === "approved").length,
    rejected: myRequests.filter((r) => r.status === "rejected").length,
    pendingVerify: requests.filter((r) => r.status === "pending_verification")
      .length,
    pendingApprove: requests.filter((r) => r.status === "verified").length,
  };

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
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        {user?.role?.includes("pegawai") && (
          <Link
            to="/app/new-request"
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Buat Permintaan ATK
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
            <FileText size={24} />
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-800">
              {stats.total}
            </div>
            <div className="text-sm text-slate-500">Total Permintaan</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4">
          <div className="w-12 h-12 bg-yellow-100 text-yellow-600 rounded-xl flex items-center justify-center">
            <Clock size={24} />
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-800">
              {stats.pending}
            </div>
            <div className="text-sm text-slate-500">Dalam Proses</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4">
          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
            <CheckCircle size={24} />
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-800">
              {stats.approved}
            </div>
            <div className="text-sm text-slate-500">Disetujui</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-xl flex items-center justify-center">
            <XCircle size={24} />
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-800">
              {stats.rejected}
            </div>
            <div className="text-sm text-slate-500">Ditolak</div>
          </div>
        </div>
      </div>

      {/* Role-specific cards */}
      {(user?.role?.includes("verifikator") ||
        user?.role?.includes("admin")) && (
        <Link
          to="/app/verification"
          className="block bg-white rounded-2xl border border-slate-200 p-5 mb-4 hover:border-yellow-400 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-yellow-100 text-yellow-600 rounded-xl flex items-center justify-center">
              <ListChecks size={24} />
            </div>
            <div className="flex-1">
              <div className="text-lg font-semibold text-slate-800">
                Menunggu Verifikasi
              </div>
              <div className="text-sm text-slate-500">
                {stats.pendingVerify} permintaan perlu diverifikasi
              </div>
            </div>
          </div>
        </Link>
      )}

      {(user?.role?.includes("penanggungjawab") ||
        user?.role?.includes("admin")) && (
        <Link
          to="/app/approval"
          className="block bg-white rounded-2xl border border-slate-200 p-5 mb-4 hover:border-blue-400 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
              <ShieldCheck size={24} />
            </div>
            <div className="flex-1">
              <div className="text-lg font-semibold text-slate-800">
                Menunggu Persetujuan
              </div>
              <div className="text-sm text-slate-500">
                {stats.pendingApprove} permintaan perlu disetujui
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* Recent Requests */}
      <div className="bg-white rounded-2xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Permintaan Terbaru</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {myRequests.slice(0, 5).map((req) => (
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
                  {req.items.length} item •{" "}
                  {new Date(req.submission_date).toLocaleDateString("id-ID")}
                </div>
              </div>
              {statusBadge(req.status)}
            </Link>
          ))}
          {myRequests.length === 0 && (
            <div className="px-5 py-8 text-center text-slate-500">
              Belum ada permintaan
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
