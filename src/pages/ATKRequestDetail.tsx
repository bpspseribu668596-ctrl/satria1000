import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  db,
  type ATKRequest,
  type ATKRequestItem,
  type Settings,
} from "../lib/db";
import { useAuth } from "../context/AuthContext";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  MessageCircle,
  ExternalLink,
  Printer,
} from "lucide-react";
import { useDialog } from "../hooks/useDialog";
import Dialog from "../components/Dialog";

interface RequestWithItems extends ATKRequest {
  items: ATKRequestItem[];
  requester_name: string;
}

export default function ATKRequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dialogState, closeDialog, alert, confirm } = useDialog();

  const [request, setRequest] = useState<RequestWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingItems, setEditingItems] = useState<ATKRequestItem[]>([]);
  const [reviewNotes, setReviewNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    loadRequest();
    db.settings.get(1).then((s: Settings | undefined) => setSettings(s || null));
  }, [id]);

  const loadRequest = async () => {
    if (!id) return;

    const requestData = await db.atk_requests.get(parseInt(id));
    if (!requestData) {
      await alert("Request tidak ditemukan");
      navigate("/app/atk-requests");
      return;
    }

    const items = await db.atk_request_items
      .where("request_id")
      .equals(parseInt(id))
      .toArray();

    const requester = await db.users.get(requestData.requester_id);

    setRequest({
      ...requestData,
      items,
      requester_name: requester?.name || "Unknown",
    });

    setEditingItems(items);
    setLoading(false);
  };

  const handlePrint = () => {
    window.print();
  };

  const updateEditingItem = (
    index: number,
    field: keyof ATKRequestItem,
    value: string,
  ) => {
    const updated = [...editingItems];
    updated[index] = { ...updated[index], [field]: value };
    setEditingItems(updated);
  };

  const handleApprove = async () => {
    if (!request || !user) return;
    const ok = await confirm("Yakin ingin menyetujui request ini?", { confirmLabel: "Ya, Setujui" });
    if (!ok) return;
    setProcessing(true);
    try {
      // Ambil semua Master ATK yang ada untuk cek duplikat
      const existingMaster = await db.atk_items.toArray();
      const masterNames = new Set(existingMaster.map(m => m.name.toLowerCase()));

      let addedCount = 0;

      for (const item of editingItems) {
        const finalName = (item.final_item_name || item.item_name).trim();

        // Update final_item_name
        await db.atk_request_items.update(item.id!, { final_item_name: finalName });

        // Auto-add ke Master ATK jika belum ada
        if (finalName && !masterNames.has(finalName.toLowerCase())) {
          await db.atk_items.add({
            item_code: "",
            name: finalName,
            unit: item.unit || "pcs",
            created_at: new Date().toISOString(),
          });
          masterNames.add(finalName.toLowerCase());
          addedCount++;
        }
      }

      await db.atk_requests.update(request.id!, {
        status: "approved", reviewed_by: user.id!, reviewed_at: new Date().toISOString(), review_notes: reviewNotes || null,
      });

      await alert(
        addedCount > 0
          ? `Request berhasil disetujui! ${addedCount} item baru otomatis ditambahkan ke Master ATK.\n\nCatatan: Stok item masih 0. Silakan catat Pembelian, Transfer Masuk, atau Saldo Awal untuk memberi stok.`
          : "Request berhasil disetujui! Semua item sudah terdaftar di Master ATK."
      );
      navigate("/app/atk-requests");
    } catch (err) {
      await alert("Gagal menyetujui: " + (err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!request || !user) return;
    if (!reviewNotes.trim()) {
      await alert("Harap isi alasan penolakan");
      return;
    }
    const ok = await confirm("Yakin ingin menolak request ini?", { destructive: true, confirmLabel: "Ya, Tolak" });
    if (!ok) return;
    setProcessing(true);
    try {
      await db.atk_requests.update(request.id!, {
        status: "rejected", reviewed_by: user.id!, reviewed_at: new Date().toISOString(), review_notes: reviewNotes,
      });
      await alert("Request ditolak");
      navigate("/app/atk-requests");
    } catch (err) {
      await alert("Gagal menolak: " + (err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const sendWhatsAppReminder = async () => {
    if (!request || !settings?.whatsapp_number) {
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
${request.reference_link ? `\n*Link Referensi:*\n${request.reference_link}` : ""}

Mohon segera ditindaklanjuti. Terima kasih.`;

    const waNumber = settings.whatsapp_number.replace(/\D/g, "");
    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Request tidak ditemukan</p>
      </div>
    );
  }

  const isAdmin = user?.role?.includes("admin") || user?.role?.includes("operator");
  const canEdit = isAdmin && request.status === "pending";

  return (
    <div>
      <Dialog state={dialogState} onClose={closeDialog} />
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate("/app/atk-requests")}
          className="p-2 hover:bg-slate-100 rounded-lg"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">
          Detail Request ATK
        </h1>
      </div>

      {/* Request Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-slate-500 text-sm mb-1">Nomor Request</div>
            <div className="font-bold text-slate-800">
              {request.document_number}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-sm mb-1">Pemohon</div>
            <div className="font-semibold text-slate-800">
              {request.requester_name}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-sm mb-1">Tanggal</div>
            <div className="text-sm text-slate-600">
              {new Date(request.created_at).toLocaleDateString("id-ID")}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-sm mb-1">Status</div>
            <div className="font-semibold text-slate-800 capitalize">
              {request.status}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="text-slate-500 text-sm mb-1">Alasan Request</div>
          <div className="text-slate-700">{request.reason}</div>
        </div>

        {request.reference_link && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="text-slate-500 text-sm mb-2">Link Referensi</div>
            <div className="flex flex-col gap-2">
              {request.reference_link.split("\n").map((link, idx) => (
                <a
                  key={idx}
                  href={link.startsWith("http") ? link : `https://${link}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-blue-600 hover:underline text-sm font-medium w-fit"
                >
                  <ExternalLink size={14} />
                  {link}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* WA Reminder Button */}
        <div className="mt-4 pt-4 border-t border-slate-200 flex gap-2 print:hidden">
          <button
            onClick={sendWhatsAppReminder}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
          >
            <MessageCircle size={18} />
            Kirim Reminder WA
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg font-semibold hover:bg-slate-700"
          >
            <Printer size={18} />
            Cetak PDF
          </button>
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-800">Daftar Item</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                  No
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                  Nama Barang
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                  Kategori
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                  Satuan
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                  Jumlah
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {editingItems.map((item, index) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {index + 1}
                  </td>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <input
                        type="text"
                        value={item.final_item_name || item.item_name}
                        onChange={(e) =>
                          updateEditingItem(
                            index,
                            "final_item_name",
                            e.target.value,
                          )
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                        placeholder="Edit nama barang..."
                      />
                    ) : (
                      <div className="text-sm font-medium text-slate-800">
                        {item.final_item_name || item.item_name}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {item.category}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {item.unit}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-right">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.is_new_item ? (
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-semibold">
                        Item Baru
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                        Dari Master
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin Review Section */}
      {canEdit && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Review Admin
          </h2>
          <textarea
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
            rows={3}
            placeholder="Catatan approve/reject (opsional untuk approve, wajib untuk reject)"
          />

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleReject}
              disabled={processing}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 disabled:opacity-60"
            >
              <XCircle size={20} />
              Tolak Request
            </button>
            <button
              onClick={handleApprove}
              disabled={processing}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-60"
            >
              <CheckCircle size={20} />
              Setujui Request
            </button>
          </div>
        </div>
      )}

      {/* Review Result (for non-pending requests) */}
      {request.status !== "pending" && request.review_notes && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Catatan{" "}
            {request.status === "approved" ? "Persetujuan" : "Penolakan"}
          </h2>
          <div className="text-slate-700">{request.review_notes}</div>
          <div className="text-sm text-slate-500 mt-2">
            {new Date(request.reviewed_at!).toLocaleString("id-ID")}
          </div>
        </div>
      )}
    </div>
  );
}
