import { useEffect, useState, useRef } from "react";
import { db, type ATKItem } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import {
  Plus,
  Trash2,
  Upload,
  Download,
  FileSpreadsheet,
  Pencil,
  Search,
} from "lucide-react";
import * as XLSX from "xlsx";
import { UNIT_OPTIONS } from "../lib/units";
import { useDialog } from "../hooks/useDialog";
import Dialog from "../components/Dialog";

export default function ATKItems() {
  const { user } = useAuth();
  const { dialogState, closeDialog, alert, confirm } = useDialog();
  const [items, setItems] = useState<ATKItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ item_code: "", name: "", unit: "pcs" });
  const [editItem, setEditItem] = useState<ATKItem | null>(null);
  const [importing, setImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role?.includes("admin") || user?.role?.includes("operator");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const data = await db.atk_items.toArray();
    setItems(data);
    setLoading(false);
  };

  const filteredItems = items.filter(
    (item) =>
      item.item_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.unit.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) { await alert("Hanya Admin/Operator yang bisa mengubah Master ATK"); return; }
    try {
      if (editItem) {
        await db.atk_items.update(editItem.id!, { item_code: form.item_code, name: form.name, unit: form.unit });
      } else {
        await db.atk_items.add({ item_code: form.item_code, name: form.name, unit: form.unit, created_at: new Date().toISOString() });
      }
      closeModal();
      loadData();
    } catch (err) {
      await alert("Gagal: " + (err as Error).message);
    }
  };

  const handleEdit = (item: ATKItem) => {
    setForm({ item_code: item.item_code || "", name: item.name, unit: item.unit });
    setEditItem(item);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditItem(null);
    setForm({ item_code: "", name: "", unit: "pcs" });
  };

  const handleDelete = async (id: number) => {
    if (!isAdmin) { await alert("Hanya Admin/Operator yang bisa menghapus Master ATK"); return; }
    const ok = await confirm("Yakin hapus item ini?", { destructive: true, confirmLabel: "Ya, Hapus" });
    if (!ok) return;
    await db.atk_items.delete(id);
    loadData();
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Kode Barang", "Nama Barang", "Satuan"],
      ["1.01.03.02.001.000321", "KERTAS HVS A4 70GSM", "RIM"],
      ["1.01.03.01.001.000226", "MAP BPS JAKSEL", "PAK"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_master_atk.xlsx");
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) { await alert("Hanya Admin yang bisa import"); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<{ "Kode Barang": string; "Nama Barang": string; Satuan: string }>(sheet);
      let imported = 0;
      for (const row of data) {
        if (row["Kode Barang"] && row["Nama Barang"]) {
          await db.atk_items.add({ item_code: String(row["Kode Barang"]), name: row["Nama Barang"], unit: row["Satuan"] || "pcs", created_at: new Date().toISOString() });
          imported++;
        }
      }
      await alert(`Berhasil import ${imported} item!`);
      loadData();
    } catch (err) {
      await alert("Gagal import: " + (err as Error).message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
    </div>
  );

  return (
    <div>
      <Dialog state={dialogState} onClose={closeDialog} />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Master Data ATK</h1>
        {isAdmin && (
          <div className="flex gap-3">
            <button onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors">
              <Download size={18} /> Template Excel
            </button>
            <label className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-colors cursor-pointer">
              <Upload size={18} />
              {importing ? "Importing..." : "Import Excel"}
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelImport} className="hidden" disabled={importing} />
            </label>
            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors">
              <Plus size={20} /> Tambah Item
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-slate-800">{items.length}</div>
          <div className="text-sm text-slate-500">Total Item</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-slate-800">{new Set(items.map((i) => i.unit)).size}</div>
          <div className="text-sm text-slate-500">Jenis Satuan</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-slate-800">{items.filter((i) => i.item_code).length}</div>
          <div className="text-sm text-slate-500">Dengan Kode</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <div className="relative">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari berdasarkan kode barang, nama barang, atau satuan..."
            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none" />
        </div>
        {searchTerm && <div className="mt-2 text-sm text-slate-500">Menampilkan {filteredItems.length} dari {items.length} item</div>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Kode Barang</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Nama Barang</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Satuan</th>
              {isAdmin && <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Aksi</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-slate-500">
                  <FileSpreadsheet size={48} className="mx-auto mb-3 text-slate-300" />
                  <p>{searchTerm ? "Tidak ada item yang cocok" : "Belum ada data item"}</p>
                  {!searchTerm && <p className="text-sm">Klik "Import Excel" atau "Tambah Item"</p>}
                </td>
              </tr>
            ) : filteredItems.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-5 py-4 text-slate-600 font-mono text-sm">{item.item_code || "-"}</td>
                <td className="px-5 py-4 font-semibold text-slate-800">{item.name}</td>
                <td className="px-5 py-4 text-slate-600">{item.unit}</td>
                {isAdmin && (
                  <td className="px-5 py-4">
                    <div className="flex gap-1">
                      <button onClick={() => handleEdit(item)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg" title="Edit"><Pencil size={18} /></button>
                      <button onClick={() => handleDelete(item.id!)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Hapus"><Trash2 size={18} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">{editItem ? "Edit Item ATK" : "Tambah Item ATK"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Kode Barang</label>
                <input type="text" value={form.item_code} onChange={(e) => setForm({ ...form, item_code: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none font-mono" placeholder="1.01.03.02.001.000321" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nama Barang <span className="text-red-500">*</span></label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Satuan</label>
                <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none">
                  {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={closeModal} className="flex-1 py-2.5 border-2 border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50">Batal</button>
                <button type="submit" className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">{editItem ? "Update" : "Simpan"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
