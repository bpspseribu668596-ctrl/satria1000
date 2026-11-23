import { useState, useEffect } from "react";
import { db, type Settings } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  ExternalLink,
  MessageCircle,
  CheckCircle,
  LinkIcon,
} from "lucide-react";

interface ItemRow {
  item_name: string;
  unit: string;
  quantity: number;
}

export default function NewATKRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [reason, setReason] = useState("");
  const [referenceLinks, setReferenceLinks] = useState<string[]>([""]);
  const [fungsiBagian, setFungsiBagian] = useState("");
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
  }, []);

  const addRow = () => {
    setItems([...items, { item_name: "", unit: "pcs", quantity: 1 }]);
  };

  const removeRow = (index: number) => {
    if (items.length === 1) {
      alert("Minimal harus ada 1 item");
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
      alert("Minimal harus ada 1 item dengan nama dan jumlah yang valid");
      return;
    }

    setSaving(true);
    try {
      const docNumber = generateDocumentNumber();

      // Save ATK request header
      const combinedLinks = referenceLinks
        .map((l) => l.trim())
        .filter((l) => l !== "")
        .join("\n");

      const requestId = await db.atk_requests.add({
        document_number: docNumber,
        requester_id: user.id!,
        reason: reason || "-",
        reference_link: combinedLinks || null,
        fungsi_bagian: fungsiBagian || null,
        status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
        created_at: new Date().toISOString(),
      });

      // Save request items
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
      alert("Gagal menyimpan: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const sendWhatsAppReminder = () => {
    if (!savedRequest || !settings?.whatsapp_number) {
      alert("Nomor WhatsApp admin belum diatur di Pengaturan");
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

  // Success State
  if (savedRequest) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            Permohonan Berhasil Disimpan!
          </h1>
          <p className="text-slate-500 mb-6">
            No. Dokumen:{" "}
            <span className="font-mono font-bold">
              {savedRequest.docNumber}
            </span>
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button 
              onClick={sendWhatsAppReminder}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700"
            >
              <MessageCircle size={20} />
              Kirim Reminder WA
            </button>
            <button 
              onClick={() => navigate("/app/atk-requests")}
              className="flex items-center justify-center gap-2 px-6 py-3 border-2 border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft size={20} />
              Kembali ke List
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={() => navigate("/app/atk-requests")}
          className="p-2 hover:bg-slate-100 rounded-lg"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-slate-800">
          Permohonan Pengadaan ATK Baru
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start justify-between gap-3">
          <div className="text-sm text-blue-800">
            <strong>Petunjuk:</strong> Isi nama item, satuan, dan jumlah yang
            dibutuhkan.
          </div>
          {(user?.role?.includes("admin") || user?.role?.includes("operator")) && (
            <Link
              to="/app/atk-items"
              target="_blank"
              className="flex items-center gap-1 text-sm text-blue-600 hover:underline whitespace-nowrap"
            >
              <ExternalLink size={14} />
              Lihat Master ATK
            </Link>
          )}
        </div>

        {/* Items Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">
              Daftar Item yang Dimohonkan
            </h2>
            <button 
              type="button"
              onClick={addRow}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 text-sm"
            >
              <Plus size={16} />
              Tambah Baris
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 w-8">
                    No
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600">
                    Nama Item
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 w-28">
                    Satuan
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 w-24">
                    Jumlah
                  </th>
                  <th className="px-3 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-sm text-slate-600">
                      {index + 1}
                    </td>
                    <td className="px-3 py-2">
                      <input 
                        type="text"
                        value={item.item_name}
                        onChange={(e) =>
                          updateItem(index, "item_name", e.target.value)
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                        placeholder="Nama item ATK..."
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input 
                        type="text"
                        value={item.unit}
                        onChange={(e) =>
                          updateItem(index, "unit", e.target.value)
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                        placeholder="pcs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input 
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(
                            index,
                            "quantity",
                            parseInt(e.target.value) || 0,
                          )
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-right focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button 
                        type="button"
                        onClick={() => removeRow(index)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                        disabled={items.length === 1}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Fungsi/Bagian */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Fungsi/Bagian <span className="text-red-500">*</span>
          </h2>
          <select 
            value={fungsiBagian}
            onChange={(e) => setFungsiBagian(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
            required
          >
            <option value="">-- Pilih Fungsi/Bagian --</option>
            <option value="Subbagian Umum">Subbagian Umum</option>
            <option value="Fungsi Sosial">Fungsi Sosial</option>
            <option value="Fungsi Distribusi">Fungsi Distribusi</option>
            <option value="Fungsi Produksi">Fungsi Produksi</option>
            <option value="Fungsi Nerwilis">Fungsi Nerwilis</option>
            <option value="Fungsi IPDS">Fungsi IPDS</option>
          </select>
        </div>

        {/* Reference Link */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <LinkIcon size={20} />
              Link Referensi ATK
            </h2>
            <button
              type="button"
              onClick={() => setReferenceLinks([...referenceLinks, ""])}
              className="text-blue-600 hover:text-blue-700 font-bold text-xs flex items-center gap-1"
            >
              <Plus size={14} /> Tambah Link
            </button>
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
                  className="flex-1 px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                  placeholder="https://example.com/referensi-atk"
                />
                {referenceLinks.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setReferenceLinks(referenceLinks.filter((_, i) => i !== idx))
                    }
                    className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-500 mt-2">
            Opsional: Link ke katalog atau referensi item ATK
          </p>
        </div>

        {/* Reason */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Alasan Request
          </h2>
          <textarea 
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
            rows={4}
            placeholder="Jelaskan alasan mengapa item ini dibutuhkan (opsional)..."
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end">
          <button 
            type="button"
            onClick={() => navigate("/app/atk-requests")}
            className="px-6 py-3 border-2 border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50"
          >
            Batal
          </button>
          <button 
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            <Save size={20} />
            {saving ? "Menyimpan..." : "Simpan Request"}
          </button>
        </div>
      </form>
    </div>
  );
}
