import { useEffect, useState, useRef } from "react";
import { db, type PurchaseItem, type ATKItem } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  Upload,
  Download,
  Trash2,
  Plus,
  Save,
  ArrowLeft,
  FileSpreadsheet,
  FileText,
  Search,
  X,
} from "lucide-react";

type ItemRow = Omit<PurchaseItem, "id" | "purchase_id">;

export default function NewPurchase() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Header form
  const [documentNumber, setDocumentNumber] = useState("");
  const [documentDate, setDocumentDate] = useState(new Date().toISOString().split("T")[0]);
  const [bookDate, setBookDate] = useState(new Date().toISOString().split("T")[0]);
  const [vendorName, setVendorName] = useState("");
  const [notes, setNotes] = useState("");

  // Items
  const [items, setItems] = useState<ItemRow[]>([
    { item_name: "", quantity: 1, unit: "pcs", unit_price: 0, total: 0 },
  ]);

  // Receipt
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [masterItems, setMasterItems] = useState<ATKItem[]>([]);
  const [showItemModal, setShowItemModal] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadMasterItems();
  }, []);

  async function loadMasterItems() {
    const items = await db.atk_items.toArray();
    setMasterItems(items);
  }

  const addRow = () => {
    setItems([...items, { item_name: "", quantity: 1, unit: "pcs", unit_price: 0, total: 0 }]);
  };

  const removeRow = (index: number) => {
    if (items.length === 1) {
      alert("Minimal harus ada 1 barang");
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ItemRow, value: string | number) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      updated[index].total = Number(updated[index].quantity) * Number(updated[index].unit_price);
    }
    setItems(updated);
  };

  const openItemSelector = (index: number) => {
    setSelectedIndex(index);
    setSearchQuery("");
    setShowItemModal(true);
  };

  const selectItem = (atk: ATKItem) => {
    const updated = [...items];
    updated[selectedIndex] = {
      ...updated[selectedIndex],
      item_name: atk.name,
      unit: atk.unit,
    };
    setItems(updated);
    setShowItemModal(false);
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (jsonData.length < 2) {
        alert("File Excel kosong atau tidak sesuai template");
        return;
      }

      const masterNames = new Map(
        masterItems.map(i => [i.name.toLowerCase(), i])
      );

      const importedItems: ItemRow[] = [];
      const skippedItems: string[] = [];

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;

        const itemName = String(row[0] || "").trim();
        const quantity = parseFloat(row[1]) || 0;
        const unitPrice = parseFloat(row[3]) || 0;

        if (!itemName || quantity <= 0) continue;

        // Validasi: hanya item yang ada di Master ATK yang boleh masuk
        const masterItem = masterNames.get(itemName.toLowerCase());
        if (!masterItem) {
          skippedItems.push(itemName);
          continue;
        }

        importedItems.push({
          item_name: masterItem.name,       // pakai nama dari master agar konsisten
          quantity,
          unit: masterItem.unit,            // pakai satuan dari master
          unit_price: unitPrice,
          total: quantity * unitPrice,
        });
      }

      if (importedItems.length > 0) {
        setItems(importedItems);
      }

      // Pesan ringkasan
      const lines: string[] = [];
      if (importedItems.length > 0) lines.push(`✅ ${importedItems.length} barang berhasil diimpor.`);
      if (skippedItems.length > 0) lines.push(`⚠️ ${skippedItems.length} barang dilewati karena tidak ada di Master ATK:\n  - ${skippedItems.join("\n  - ")}`);
      if (importedItems.length === 0 && skippedItems.length === 0) lines.push("Tidak ada data valid yang ditemukan di file Excel.");
      alert(lines.join("\n\n"));
    } catch (err) {
      alert("Gagal membaca file Excel: " + (err as Error).message);
    } finally {
      if (excelInputRef.current) excelInputRef.current.value = "";
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Nama Barang", "Jumlah", "Satuan", "Harga Satuan"],
      ["KERTAS HVS A4 70GSM", 10, "RIM", 55000],
      ["PULPEN STANDARD AE7", 2, "LUSIN", 24000],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_pembelian_atk.xlsx");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!documentNumber.trim()) return alert("Nomor nota harus diisi");
    if (!vendorName.trim()) return alert("Nama toko/vendor harus diisi");

    const validItems = items.filter((item) => item.item_name.trim() && item.quantity > 0);
    if (validItems.length === 0) {
      alert("Minimal harus ada 1 barang yang valid");
      return;
    }

    setSaving(true);
    try {
      let receiptBase64 = null;
      let receiptFilename = null;

      if (receiptFile) {
        receiptFilename = receiptFile.name;
        receiptBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(receiptFile);
        });
      }
      const totalAmount = validItems.reduce((sum, item) => sum + item.total, 0);

      const purchaseId = await db.purchases.add({
        document_number: documentNumber,
        purchase_date: documentDate,
        document_date: documentDate,
        book_date: bookDate,
        vendor_name: vendorName,
        total_amount: totalAmount,
        receipt_file: receiptBase64,
        receipt_filename: receiptFilename,
        notes: notes || null,
        created_by: user.id!,
        created_at: new Date().toISOString(),
      });

      for (const item of validItems) {
        await db.purchase_items.add({
          purchase_id: purchaseId as number,
          item_name: item.item_name,
          quantity: Number(item.quantity),
          unit: item.unit,
          unit_price: Number(item.unit_price),
          total: Number(item.total),
        });
      }

      alert("Pembelian berhasil disimpan!");
      navigate("/app/purchases");
    } catch (err) {
      alert("Gagal menyimpan: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat("id-ID", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-4 mb-2">
        <button onClick={() => navigate("/app/purchases")} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-slate-800"> Input Pembelian Baru </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Info Nota */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"> <FileText size={20} /> </div>
            <h2 className="text-lg font-bold text-slate-800"> Detail Nota & Transaksi (SAKTI) </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2"> Nomor Nota / Invoice </label>
              <input type="text" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl transition-all font-bold text-slate-800 text-sm" placeholder="Contoh: INV-2024-001" required />
            </div>
            <div>
              <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2"> Tanggal Dokumen (Nota) </label>
              <input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl transition-all font-bold text-slate-800 text-sm" required />
            </div>
            <div>
              <label className="block text-xs font-black uppercase text-purple-700 tracking-widest mb-2"> Tanggal Buku (SAKTI) </label>
              <input type="date" value={bookDate} onChange={(e) => setBookDate(e.target.value)}
                className="w-full px-4 py-3 bg-purple-50/50 border-2 border-purple-200 focus:bg-white focus:border-purple-500 rounded-xl transition-all font-bold text-purple-900 text-sm" required />
            </div>
            <div>
              <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2"> Nama Toko / Vendor </label>
              <input type="text" value={vendorName} onChange={(e) => setVendorName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-xl transition-all font-bold text-slate-800 text-sm" placeholder="Nama Toko ATK..." required />
            </div>
          </div>
        </div>

        {/* Excel Import */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm border-l-4 border-l-green-500">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 text-green-600 rounded-lg"> <FileSpreadsheet size={20} /> </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800"> Import Data Cepat </h2>
                <p className="text-xs text-slate-500 font-medium"> Malas input manual? Gunakan format Excel </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => excelInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all shadow-md shadow-green-100">
                <Upload size={18} /> Import Excel
              </button>
              <button type="button" onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all">
                <Download size={18} /> Template
              </button>
              <input ref={excelInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelImport} className="hidden" />
            </div>
          </div>
        </div>

        {/* Item List */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800"> Daftar Rincian Barang </h2>
            <button type="button" onClick={addRow} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 text-sm shadow-md shadow-blue-100 transition-all active:scale-95">
              <Plus size={16} /> Tambah Item
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/50">
                <tr className="border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  <th className="px-4 py-4 text-left w-12">No</th>
                  <th className="px-4 py-4 text-left">Nama Barang</th>
                  <th className="px-4 py-4 text-center w-28">Jumlah</th>
                  <th className="px-4 py-4 text-center w-28">Satuan</th>
                  <th className="px-4 py-4 text-right w-44">Harga Satuan</th>
                  <th className="px-4 py-4 text-right w-44">Total</th>
                  <th className="px-4 py-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item, index) => (
                  <tr key={index} className="group hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-400 font-mono text-center">{index + 1}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openItemSelector(index)}
                        className="w-full px-4 py-2 bg-white border-2 border-slate-100 hover:border-blue-400 focus:border-blue-500 rounded-xl text-sm font-bold text-slate-800 text-left transition-all"
                      >
                        {item.item_name || <span className="text-slate-400">Pilih dari Master...</span>}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 0)}
                        className="w-full px-4 py-2 bg-white border-2 border-slate-100 focus:border-blue-500 rounded-xl text-sm font-black text-center text-slate-800" />
                    </td>
                    <td className="px-4 py-3">
                      <input type="text" value={item.unit} readOnly
                        className="w-full px-4 py-2 bg-slate-50 border-2 border-transparent rounded-xl text-sm font-bold text-center text-slate-500 uppercase cursor-not-allowed" placeholder="pcs" />
                    </td>
                    <td className="px-4 py-3 font-mono">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-bold">Rp</span>
                        <input type="number" min="0" value={item.unit_price} onChange={(e) => updateItem(index, "unit_price", parseInt(e.target.value) || 0)}
                          className="w-full pl-8 pr-3 py-2 bg-white border-2 border-slate-100 focus:border-blue-500 rounded-xl text-sm font-black text-right text-slate-800" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-black text-slate-900 pr-2">Rp {formatCurrency(item.total)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button type="button" onClick={() => removeRow(index)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" disabled={items.length === 1}>
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-right text-xs font-black text-slate-400 uppercase tracking-widest"> Total Pembelian: </td>
                  <td className="px-4 py-6 text-right text-2xl font-black text-blue-600"> Rp {formatCurrency(totalAmount)} </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Upload Nota */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-4"> Upload Nota / Kwitansi (Opsional) </h2>
            <div onClick={() => receiptInputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group">
              <div className="p-3 bg-slate-50 text-slate-400 rounded-full w-fit mx-auto mb-3 group-hover:bg-white group-hover:text-blue-500 transition-colors">
                <Upload size={24} />
              </div>
              <p className="text-sm font-bold text-slate-600 group-hover:text-blue-600 transition-colors"> {receiptFile ? receiptFile.name : "Klik untuk pilih file atau Drag & Drop"} </p>
              <p className="text-[10px] font-medium text-slate-400 mt-1"> PDF, JPG, PNG (Maks 5MB) </p>
              <input ref={receiptInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} className="hidden" />
            </div>
          </div>

          {/* Catatan */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-4"> Catatan Tambahan </h2>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-2xl transition-all text-sm font-medium text-slate-700" rows={5} placeholder="Ketik catatan di sini jika ada..." />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4 items-center justify-end pt-6">
          <button type="button" onClick={() => navigate("/app/purchases")} className="px-8 py-3.5 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"> Batal </button>
          <button type="submit" disabled={saving} className="flex items-center gap-3 px-10 py-3.5 bg-blue-600 text-white rounded-2xl font-black text-sm hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-200 transition-all active:scale-95 disabled:opacity-50">
            {saving ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Save size={18} />}
            {saving ? "Menyimpan Data..." : "Simpan Pembelian"}
          </button>
        </div>
      </form>

      {/* Item Selection Modal */}
      {showItemModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-2xl">
                  <Search size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight"> Pilih Master ATK </h3>
                  <p className="text-sm text-slate-500 font-medium"> Pilih barang yang dibeli dari daftar aset </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowItemModal(false)}
                className="p-3 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-2xl transition-all"
              >
                <X size={24} />
              </button>
            </div>

            {/* Search Bar */}
            <div className="p-6 bg-white border-b border-slate-50">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                <input
                  autoFocus
                  type="text"
                  placeholder="Cari nama barang atau kode barang..."
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-blue-500 rounded-2xl transition-all outline-none text-slate-700 font-bold"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/30 scrollbar-hide">
              {masterItems
                .filter(i =>
                  i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  (i.item_code && i.item_code.toLowerCase().includes(searchQuery.toLowerCase()))
                )
                .map((atk) => (
                  <button
                    key={atk.id}
                    type="button"
                    onClick={() => selectItem(atk)}
                    className="w-full flex items-center justify-between p-5 bg-white hover:bg-blue-50 rounded-2xl text-left transition-all border border-slate-100 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-100/50 group"
                  >
                    <div className="flex-1">
                      <div className="font-black text-slate-800 group-hover:text-blue-700 text-lg mb-1 leading-tight">
                        {atk.name}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-black uppercase rounded-md"> {atk.item_code || "TANPA KODE"} </span>
                        <span className="text-xs text-slate-400 font-bold"> • Satuan: {atk.unit} </span>
                      </div>
                    </div>
                    <div className="p-2 bg-slate-50 text-slate-300 group-hover:bg-white group-hover:text-blue-500 rounded-xl transition-all">
                      <Plus size={20} />
                    </div>
                  </button>
                ))}

              {masterItems.filter(i =>
                i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (i.item_code && i.item_code.toLowerCase().includes(searchQuery.toLowerCase()))
              ).length === 0 && (
                <div className="text-center py-16">
                  <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-200">
                    <Search size={32} className="text-slate-300" />
                  </div>
                  <p className="font-bold text-slate-400">Barang tidak ditemukan</p>
                  <p className="text-xs text-slate-300 mt-1">Coba masukkan kata kunci yang berbeda</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
