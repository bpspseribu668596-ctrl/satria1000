/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect } from "react";
import {
  db,
  type ATKRequest,
  type ATKRequestItem,
  type Settings,
} from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  MessageCircle,
  Trash2,
} from "lucide-react";
import { useDialog } from "../hooks/useDialog";
import Dialog from "../components/Dialog";

interface RequestWithItems extends ATKRequest {
  items: ATKRequestItem[];
  requester_name: string;
}

export default function ATKRequests() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { dialogState, closeDialog, alert, confirm } = useDialog();
  const [requests, setRequests] = useState<RequestWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");
  const [settings, setSettings] = useState<Settings | null>(null);

  const loadRequests = async () => {
    try {
      let requestData: ATKRequest[];

      if (
        user?.role?.includes("admin") ||
        user?.role?.includes("operator") ||
        user?.role?.includes("penanggungjawab")
      ) {
        // Admin/Operator/PJ see all requests
        requestData = await db.atk_requests
          .orderBy("created_at")
          .reverse()
          .toArray();
      } else {
        // Pemohon sees only their own requests
        requestData = await db.atk_requests
          .where("requester_id")
          .equals(user?.id || 0)
          .reverse()
          .toArray();
      }

      // Load items and requester name for each request
      const withDetails = await Promise.all(
        requestData.map(async (request: ATKRequest) => {
          const items = await db.atk_request_items
            .where("request_id")
            .equals(request.id!)
            .toArray();

          const requester = await db.users.get(request.requester_id);

          return {
            ...request,
            items,
            requester_name: requester?.name || "Unknown",
          };
        }),
      );

      setRequests(withDetails);
    } catch (err) {
      console.error("Gagal memuat permohonan pengadaan:", err);
    } finally {
      setLoading(false);
    }
  };

    useEffect(() => {
    loadRequests();
    db.settings.get(1).then((s: Settings | undefined) => setSettings(s || null));
  }, []);

  const filteredRequests = requests.filter((req) => {
    if (filter === "all") return true;
    return req.status === filter;
  });

  const sendWhatsAppReminder = async (e: React.MouseEvent, request: RequestWithItems) => {
    e.stopPropagation();
    if (!settings?.whatsapp_number) {
      await alert("Nomor WhatsApp admin belum diatur di Pengaturan");
      return;
    }

    const itemList = request.items
      .map((i) => `• ${i.item_name} - ${i.quantity} ${i.unit}`)
      .join("\n");

    const message = `📦 *REMINDER REQUEST ATK*

No. Dokumen: ${request.document_number}
Pemohon: ${request.requester_name}
Tanggal: ${new Date(request.created_at).toLocaleDateString("id-ID")}
Status: ${request.status.toUpperCase()}

*Daftar Item:*
${itemList}

*Alasan:*
${request.reason}

Mohon segera ditindaklanjuti. Terima kasih.`;

    const waNumber = settings.whatsapp_number.replace(/\D/g, "");
    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank");
  };

  const handleDelete = async (e: React.MouseEvent, request: RequestWithItems) => {
    e.stopPropagation();
    const ok = await confirm(`Yakin ingin menghapus request ${request.document_number}?`, { destructive: true, confirmLabel: "Ya, Hapus" });
    if (!ok) return;
    try {
      await db.atk_request_items.where("request_id").equals(request.id!).delete();
      await db.atk_requests.delete(request.id!);
      loadRequests();
    } catch (err) {
      await alert("Gagal menghapus: " + (err as Error).message);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-semibold">
            <Clock size={14} />
            Menunggu
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-semibold">
            <CheckCircle size={14} />
            Disetujui
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-semibold">
            <XCircle size={14} />
            Ditolak
          </span>
        );
    }
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
      <Dialog state={dialogState} onClose={closeDialog} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">
          {user?.role?.includes("admin") ||
          user?.role?.includes("operator") ||
          user?.role?.includes("penanggungjawab")
            ? "Permohonan Pengadaan ATK"
            : "Permohonan Pengadaan ATK Saya"}
        </h1>
        <button 
          onClick={() => navigate("/app/atk-requests/new")}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700"
        >
          <Plus size={20} />
          Buat Permohonan
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {["all", "pending", "approved", "rejected"].map((status) => (
          <button 
            key={status}
            onClick={() => setFilter(status as typeof filter)}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
              filter === status
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            {status === "all"
              ? "Semua"
              : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Requests List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {filteredRequests.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileText size={48} className="mx-auto mb-3 text-slate-300" />
            <p>Tidak ada request {filter !== "all" ? filter : ""}</p>
            <p className="text-sm">
              Klik "Request ATK Baru" untuk membuat request
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                    No Request
                  </th>
                  {user?.role?.includes("admin") && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                      Pemohon
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                    Tanggal
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                    Jumlah Item
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 w-16">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((request) => (
                  <tr
                    key={request.id}
                    onClick={() => navigate(`/app/atk-requests/${request.id}`)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">
                        {request.document_number}
                      </div>
                    </td>
                    {user?.role?.includes("admin") && (
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {request.requester_name}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {new Date(request.created_at).toLocaleDateString("id-ID")}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 text-right">
                      {request.items.length} item
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getStatusBadge(request.status)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button 
                          onClick={(e) => sendWhatsAppReminder(e, request)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                          title="Kirim Reminder WA"
                        >
                          <MessageCircle size={18} />
                        </button>
                        <button 
                          onClick={(e) => handleDelete(e, request)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                          title="Hapus Request"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
