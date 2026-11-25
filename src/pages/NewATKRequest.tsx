import { useState, useEffect } from "react";
import { db, type Settings } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { UNIT_OPTIONS } from "../lib/units";
import { useDialog } from "../hooks/useDialog";
import Dialog from "../components/Dialog";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  ExternalLink,
  MessageCircle,
  CheckCircle,
  LinkIcon,
  AlignLeft,
} from "lucide-react";

interface ItemRow {
  item_name: string;
  unit: string;
  quantity: number;
}

export default function NewATKRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { dialogState, closeDialog, alert } = useDialog();

  const [reason, setReason] = useState("");
  const [referenceLinks, setReferenceLinks] = useState<string[]>([""]);
  const [items, setItems] = useState<ItemRow[]>([
    { item_name: "", unit: "pcs", quantity: 1 },
  ]);
  const [saving, setSaving] = useState(false);
  const [savedRequest, setSavedRequest] = useState<{
    id: number;
    docNumber: string;
  } | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    db.settings.get(1).then(setSettings);
  }, [user]);

  const addRow = () => {
    setItems([...items, { item_name: "", unit: "pcs", quantity: 1 }]);
  };

  const removeRow = async (index: number) => {
    if (items.length === 1) {
      await alert("Minimal harus ada 1 item");
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (
    index: number,
    field: keyof ItemRow,
    value: string | number,
  ) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const generateDocumentNumber = () => {
    const date = new Date();
    const dateStr = date.toISOString().split("T")[0].replace(/-/g, "");
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `REQ-${dateStr}-${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const validItems = items.filter(
      (item) => item.item_name.trim() && item.quantity > 0,
    );
    if (validItems.length === 0) {
      await alert("Minimal harus ada 1 item dengan nama dan jumlah yang valid");
      return;
    }

    setSaving(true);
    try {
      const docNumber = generateDocumentNumber();

      const combinedLinks = referenceLinks
        .map((l) => l.trim())
        .filter((l) => l !== "")
        .join("\n");

      const requestId = await db.atk_requests.add({
        document_number: docNumber,
        requester_id: user.id!,
        reason: reason || "-",
        reference_link: combinedLinks || null,
        fungsi_bagian: null,
        status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
        created_at: new Date().toISOString(),
      });

      for (const item of validItems) {
        await db.atk_request_items.add({
          request_id: requestId as number,
          item_name: item.item_name,
          category: "",
          unit: item.unit,
          quantity: item.quantity,
          is_new_item: true,
          final_item_name: null,
          atk_item_id: null,
        });
      }

      setSavedRequest({ id: requestId as number, docNumber });
    } catch (err) {
      await alert("Gagal menyimpan: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const sendWhatsAppReminder = async () => {
    if (!savedRequest || !settings?.whatsapp_number) {
      await alert("Nomor WhatsApp admin belum diatur di Pengaturan");
      return;
    }

    const itemList = items
      .filter((i) => i.item_name.trim())
      .map((i) => `• ${i.item_name} - ${i.quantity} ${i.unit}`)
      .join("\n");

    const combinedLinks = referenceLinks
      .map((l) => l.trim())
      .filter((l) => l !== "")
      .join("\n");

    const message = `📦 *REQUEST ATK BARU*

No. Dokumen: ${savedRequest.docNumber}
Pemohon: ${user?.name || ""}
Unit Kerja: ${user?.work_unit || ""}

*Daftar Item:*
${itemList}

*Alasan:*
${reason || "-"}
${combinedLinks ? `\n*Link Referensi:*\n${combinedLinks}` : ""}

Mohon segera diproses. Terima kasih.`;

    const waNumber = settings.whatsapp_number.replace(/\D/g, "");
    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank");
  };

  // --- Success State ---
  if (savedRequest) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-sm">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle size={40} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 mb-2">
            Permohonan Berhasil Disimpan!
          </h1>
          <p className="text-slate-500 mb-8">
            No. Dokumen:{" "}
            <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg">
              {savedRequest.docNumber}
            </span>
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {settings?.whatsapp_number && (
              <button
                onClick={sendWhatsAppReminder}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-md shadow-green-100"
              >
                <MessageCircle size={20} />
                Kirim Reminder WA
              </button>
            )}
            <button
              onClick={() => navigate("/app/atk-requests")}
              className="flex items-center justify-center gap-2 px-6 py-3 border-2 border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
            >
              <ArrowLeft size={20} />
              Kembali ke List
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Form ---
  return (
    <div className="space-y-6 pb-12">
      <Dialog state={dialogState} onClose={closeDialog} />
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/app/atk-requests")}
          className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">
          Permohonan Pengadaan ATK Baru
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Info Petunjuk */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start justify-between gap-3">
          <p className="text-sm text-blue-800">
            <strong>Petunjuk:</strong> Isi nama item, satuan, dan jumlah yang dibutuhkan. Item yang diajukan akan direview oleh admin/operator sebelum ditambahkan ke katalog.
          </p>
          {(user?.role?.includes("admin") || user?.role?.includes("operator")) && (
            <Link
              to="/app/atk-items"
              target="_blank"
              className="flex items-center gap-1 text-sm text-blue-600 hover:underline whitespace-nowrap font-semibold"
            >
              <ExternalLink size={14} />
              Lihat Master ATK
            </Link>
          )}
        </div>

        {/* Daftar Item */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">Daftar Item yang Dimohonkan</h2>
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 text-sm shadow-md shadow-blue-100 transition-all active:scale-95"
            >
              <Plus size={16} />
              Tambah Baris
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/50">
                <tr className="border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  <th className="px-4 py-4 text-left w-12">No</th>
                  <th className="px-4 py-4 text-left">Nama Barang</th>
                  <th className="px-4 py-4 text-center w-32">Satuan</th>
                  <th className="px-4 py-4 text-center w-32">Jumlah</th>
                  <th className="px-4 py-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item, index) => (
                  <tr key={index} className="group hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-400 font-mono text-center">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={item.item_name}
                        onChange={(e) => updateItem(index, "item_name", e.target.value)}
                        className="w-full px-4 py-2 bg-white border-2 border-slate-100 focus:border-blue-500 rounded-xl text-sm font-bold text-slate-800 outline-none transition-all"
                        placeholder="Nama item ATK yang dibutuhkan..."
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={item.unit}
                        onChange={(e) => updateItem(index, "unit", e.target.value)}
                        className="w-full px-4 py-2 bg-white border-2 border-slate-100 focus:border-blue-500 rounded-xl text-sm font-bold text-center text-slate-800 outline-none transition-all"
                      >
                        {UNIT_OPTIONS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 0)}
                        className="w-full px-4 py-2 bg-white border-2 border-slate-100 focus:border-blue-500 rounded-xl text-sm font-black text-center text-slate-800 outline-none transition-all"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        disabled={items.length === 1}
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Link Referensi */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                <LinkIcon size={20} />
              </div>
              <div className="flex-1 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800">Link Referensi</h2>
                <button
                  type="button"
                  onClick={() => setReferenceLinks([...referenceLinks, ""])}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-bold"
                >
                  <Plus size={14} /> Tambah Link
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {referenceLinks.map((link, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="url"
                    value={link}
                    onChange={(e) => {
                      const updated = [...referenceLinks];
                      updated[idx] = e.target.value;
                      setReferenceLinks(updated);
                    }}
                    className="flex-1 px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl transition-all text-sm font-medium text-slate-700 outline-none"
                    placeholder="https://contoh.com/referensi-atk"
                  />
                  {referenceLinks.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setReferenceLinks(referenceLinks.filter((_, i) => i !== idx))
                      }
                      className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 font-medium mt-3">
              Opsional — link ke katalog atau referensi item ATK
            </p>
          </div>

          {/* Alasan */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <AlignLeft size={20} />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Alasan Permohonan</h2>
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-2xl transition-all text-sm font-medium text-slate-700 outline-none resize-none"
              rows={5}
              placeholder="Jelaskan alasan mengapa item ini dibutuhkan (opsional)..."
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 items-center justify-end pt-2">
          <button
            type="button"
            onClick={() => navigate("/app/atk-requests")}
            className="px-8 py-3.5 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-3 px-10 py-3.5 bg-blue-600 text-white rounded-2xl font-black text-sm hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-200 transition-all active:scale-95 disabled:opacity-50"
          >
            {saving
              ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              : <Save size={18} />
            }
            {saving ? "Menyimpan..." : "Simpan Permohonan"}
          </button>
        </div>
      </form>
    </div>
  );
}
