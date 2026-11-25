/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db, type Request, type User, type Settings } from "../lib/db";
import { useDialog } from "../hooks/useDialog";
import Dialog from "../components/Dialog";
import { MessageSquare } from "lucide-react";

export default function ApprovedRequests() {
  const { dialogState, closeDialog, alert } = useDialog();

  const [requests, setRequests] = useState<Request[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const allReqs = await db.requests.orderBy("created_at").reverse().toArray();
      const reqs = allReqs.filter((r) => r.status === "approved");

      const [usrs, sett] = await Promise.all([
        db.users.toArray(),
        db.settings.get(1),
      ]);
      setRequests(reqs || []);
      setUsers(usrs || []);
      setSettings(sett || null);
    } catch (err) {
      console.error("Gagal memuat permintaan disetujui:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getUserName = (id: number) =>
    users.find((u) => u.id === id)?.name || "Unknown";

  const sendWhatsApp = async (req: Request, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!settings?.whatsapp_number) {
      await alert("Nomor WhatsApp belum diatur");
      return;
    }
    const requester = users.find((u) => u.id === req.requester_id);
    const message = encodeURIComponent(
      `📋 *Reminder ATK*\n` +
        `No: ${req.document_number}\n` +
        `Pemohon: ${requester?.name}\n` +
        `Status: Disetujui`
    );
    window.open(
      `https://wa.me/${settings.whatsapp_number}?text=${message}`,
      "_blank"
    );
  };

  const formatTableDate = (d?: string | null) => {
    if (!d) return "-";
    const clean = d.split("T")[0];
    const parts = clean.split("-");
    if (parts.length === 3) {
      const year = parts[0];
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(parseInt(year, 10))) {
        return `${day}/${month}/${year}`;
      }
    }
    try {
      return new Date(d).toLocaleDateString("id-ID");
    } catch {
      return d;
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Permintaan Disetujui</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar permintaan ATK yang telah disetujui
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  No. Dokumen
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Pemohon
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Tanggal (Dok / Buku)
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Item
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                  Status
                </th>
                {settings?.whatsapp_number && (
                  <th className="px-5 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                    Aksi
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.length === 0 ? (
                <tr>
                  <td
                    colSpan={settings?.whatsapp_number ? 6 : 5}
                    className="px-5 py-8 text-center text-slate-500 text-sm"
                  >
                    Belum ada permintaan yang disetujui
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <Link
                        to={`/app/request/${req.id}`}
                        className="text-blue-600 hover:underline font-bold text-sm"
                      >
                        {req.document_number}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-800 text-sm">
                        {getUserName(req.requester_id)}
                      </div>
                      <div className="text-xs text-slate-500">{req.fungsi_bagian || "-"}</div>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-600">
                      <div className="font-medium text-slate-800">
                        {formatTableDate(req.book_date || req.submission_date || req.document_date)}{" "}
                        <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold">
                          Buku
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Dok: {formatTableDate(req.document_date || req.submission_date)}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {req.items?.length || 0} item
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        Disetujui
                      </span>
                    </td>
                    {settings?.whatsapp_number && (
                      <td className="px-5 py-4 text-center">
                        <button
                          onClick={(e) => sendWhatsApp(req, e)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Kirim Pesan WhatsApp"
                        >
                          <MessageSquare size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
