/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db, type Purchase, type PurchaseItem, type Settings, type ATKItem } from "../lib/db";
import {
  ArrowLeft,
  Calendar,
  Store,
  FileText,
  DollarSign,
  Eye,
  Printer,
  X,
  Pencil,
  Check,
  Upload,
  Plus,
  Trash2,
  Search,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useDialog } from "../hooks/useDialog";
import Dialog from "../components/Dialog";

interface PurchaseWithItems extends Purchase {
  items: PurchaseItem[];
}

interface EditableItem extends Omit<PurchaseItem, "id" | "purchase_id"> {
  id?: number;
  purchase_id?: number;
}

export default function PurchaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dialogState, closeDialog, alert } = useDialog();

  const [purchase, setPurchase] = useState<PurchaseWithItems | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [masterItems, setMasterItems] = useState<ATKItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  
  // Modal states
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showEditHeaderModal, setShowEditHeaderModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);

  // Header editing state
  const [headerForm, setHeaderForm] = useState({
    document_number: "",
    vendor_name: "",
    document_date: "",
    book_date: "",
    notes: "",
  });

  // Items editing state
  const [isEditingItems, setIsEditingItems] = useState(false);
  const [tempItems, setTempItems] = useState<EditableItem[]>([]);
  const [deletedItemIds, setDeletedItemIds] = useState<number[]>([]);

  const canEdit = Boolean(
    user?.role?.some((r: string) => ["admin", "operator", "verifikator", "penanggungjawab"].includes(r))
  );
  const isAdmin = canEdit;

  const loadData = async () => {
    if (!id) return;
    try {
      const [purchaseData, items, sett, mItems] = await Promise.all([
        db.purchases.get(parseInt(id)),
        db.purchase_items.where("purchase_id").equals(parseInt(id)).toArray(),
        db.settings.get(1),
        db.atk_items.toArray(),
      ]);

      if (!purchaseData) {
        await alert("Data pembelian tidak ditemukan");
        navigate("/app/purchases");
        return;
      }

      setPurchase({ ...purchaseData, items });
      setSettings(sett || null);
      setMasterItems(mItems || []);

      setHeaderForm({
        document_number: purchaseData.document_number || "",
        vendor_name: purchaseData.vendor_name || "",
        document_date: purchaseData.document_date || purchaseData.purchase_date || "",
        book_date: purchaseData.book_date || purchaseData.purchase_date || "",
        notes: purchaseData.notes || "",
      });
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  // --- HEADER EDIT HANDLERS ---
  const handleOpenEditHeader = () => {
    if (!purchase) return;
    setHeaderForm({
      document_number: purchase.document_number || "",
      vendor_name: purchase.vendor_name || "",
      document_date: purchase.document_date || purchase.purchase_date || "",
      book_date: purchase.book_date || purchase.purchase_date || "",
      notes: purchase.notes || "",
    });
    setShowEditHeaderModal(true);
  };

  const handleSaveHeader = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchase) return;
    if (!headerForm.document_number.trim()) { await alert("Nomor nota tidak boleh kosong"); return; }
    if (!headerForm.vendor_name.trim()) { await alert("Nama toko/vendor tidak boleh kosong"); return; }

    setUpdating(true);
    try {
      await db.purchases.update(purchase.id!, {
        document_number: headerForm.document_number.trim(),
        vendor_name: headerForm.vendor_name.trim(),
        purchase_date: headerForm.document_date,
        document_date: headerForm.document_date,
        book_date: headerForm.book_date,
        notes: headerForm.notes ? headerForm.notes.trim() : null,
      });

      setPurchase({
        ...purchase,
        document_number: headerForm.document_number.trim(),
        vendor_name: headerForm.vendor_name.trim(),
        purchase_date: headerForm.document_date,
        document_date: headerForm.document_date,
        book_date: headerForm.book_date,
        notes: headerForm.notes ? headerForm.notes.trim() : null,
      });

      setShowEditHeaderModal(false);
      await alert("Data transaksi pembelian berhasil diperbarui!");
    } catch (err) {
      await alert("Gagal memperbarui data: " + (err as Error).message);
    } finally {
      setUpdating(false);
    }
  };

  // --- ITEM EDIT HANDLERS ---
  const handleStartEditItems = () => {
    if (!purchase) return;
    setTempItems(purchase.items.map((it) => ({ ...it })));
    setDeletedItemIds([]);
    setIsEditingItems(true);
  };

  const handleCancelEditItems = () => {
    setIsEditingItems(false);
    setDeletedItemIds([]);
    setTempItems([]);
  };

  const handleRemoveTempItem = async (index: number) => {
    if (tempItems.length <= 1) {
      await alert("Minimal harus ada 1 barang dalam nota pembelian");
      return;
    }
    const itemToRemove = tempItems[index];
    if (itemToRemove.id) {
      setDeletedItemIds((prev) => [...prev, itemToRemove.id!]);
    }
    setTempItems(tempItems.filter((_, i) => i !== index));
  };

  const handleOpenItemSelector = (index: number | null) => {
    setSelectedItemIndex(index);
    setSearchQuery("");
    setShowItemModal(true);
  };

  const handleSelectItem = (atk: ATKItem) => {
    if (selectedItemIndex !== null && selectedItemIndex >= 0) {
      // Editing existing row item name and unit
      const updated = [...tempItems];
      updated[selectedItemIndex] = {
        ...updated[selectedItemIndex],
        item_name: atk.name,
        unit: atk.unit,
      };
      setTempItems(updated);
    } else {
      // Adding as new row
      setTempItems([
        ...tempItems,
        {
          item_name: atk.name,
          quantity: 1,
          unit: atk.unit,
          unit_price: 0,
          total: 0,
        },
      ]);
    }
    setShowItemModal(false);
    setSelectedItemIndex(null);
  };

  const updateTempItemField = (
    index: number,
    field: keyof EditableItem,
    value: string | number
  ) => {
    const updated = [...tempItems];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      const q = Number(field === "quantity" ? value : updated[index].quantity) || 0;
      const p = Number(field === "unit_price" ? value : updated[index].unit_price) || 0;
      updated[index].total = q * p;
    }
    setTempItems(updated);
  };

  const handleSaveItems = async () => {
    if (!purchase) return;

    // Validation
    const invalidItems = tempItems.filter(
      (it) => !it.item_name.trim() || Number(it.quantity) <= 0
    );
    if (invalidItems.length > 0) {
      await alert("Pastikan semua nama barang terisi dan jumlah lebih dari 0!");
      return;
    }

    setUpdating(true);
    try {
      // 1. Delete removed items
      for (const delId of deletedItemIds) {
        await db.purchase_items.delete(delId);
      }

      // 2. Update existing items or insert new items
      let grandTotal = 0;
      for (const item of tempItems) {
        const itemTotal = Number(item.quantity) * Number(item.unit_price);
        grandTotal += itemTotal;

        if (item.id) {
          await db.purchase_items.update(item.id, {
            item_name: item.item_name.trim(),
            quantity: Number(item.quantity),
            unit: item.unit,
            unit_price: Number(item.unit_price),
            total: itemTotal,
          });
        } else {
          await db.purchase_items.add({
            purchase_id: purchase.id!,
            item_name: item.item_name.trim(),
            quantity: Number(item.quantity),
            unit: item.unit,
            unit_price: Number(item.unit_price),
            total: itemTotal,
          });
        }
      }

      // 3. Update header total_amount
      await db.purchases.update(purchase.id!, { total_amount: grandTotal });

      // 4. Reload data
      await loadData();
      setIsEditingItems(false);
      setDeletedItemIds([]);
      await alert("Rincian barang berhasil diperbarui!");
    } catch (err) {
      await alert("Gagal memperbarui rincian barang: " + (err as Error).message);
    } finally {
      setUpdating(false);
    }
  };

  // File replacement
  const handleFileUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !purchase) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        setUpdating(true);
        await db.purchases.update(purchase.id!, {
          receipt_file: base64,
          receipt_filename: file.name,
        });
        setPurchase({
          ...purchase,
          receipt_file: base64,
          receipt_filename: file.name,
        });
        await alert("Nota/Bukti pembelian berhasil diperbarui");
      } catch (err) {
        await alert("Gagal memperbarui file: " + (err as Error).message);
      } finally {
        setUpdating(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat("id-ID", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatIndoDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!purchase) {
    return (
      <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
        <p className="text-slate-500 italic">Data tidak ditemukan</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <Dialog state={dialogState} onClose={closeDialog} />
      {/* ========================================================================= */}
      {/* HEADER ACTIONS (HIDDEN ON PRINT) */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/app/purchases")}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Detail Pembelian</h1>
            <p className="text-xs text-slate-500">Pencatatan nota & bukti pembelian barang persediaan</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={handleOpenEditHeader}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl font-bold text-sm shadow-sm transition-all active:scale-95"
            >
              <Pencil size={16} /> Edit Data Dokumen
            </button>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 shadow-md transition-all active:scale-95"
          >
            <Printer size={18} /> Cetak Dokumen Resmi
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* OFFICIAL BPS PRINT TEMPLATE (DISPLAYED ONLY WHEN PRINTING) */}
      {/* ========================================================================= */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 8mm 10mm;
        }
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-form-container {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>
      <div className="hidden print:block font-sans text-black leading-normal print-form-container">
        {/* KOP RESMI DOKUMEN BPS */}
        <div className="flex items-center gap-4 pb-2 border-b-2 border-black">
          <img
            src={settings?.logo_url || "/bpslogo.svg"}
            alt="Logo BPS"
            className="h-16 w-16 object-contain"
          />
          <div className="flex-1 text-center">
            <h1 className="text-sm font-extrabold uppercase tracking-widest text-black">
              {settings?.org_name || "BADAN PUSAT STATISTIK KEPULAUAN SERIBU"}
            </h1>
            <h2 className="text-base font-black uppercase tracking-wide text-black mt-0.5">
              BUKTI PENERIMAAN HASIL PENGADAAN BARANG (BAPP)
            </h2>
            <p className="text-[11px] font-medium text-slate-800 mt-0.5">
              Tahun Anggaran {settings?.budget_year || new Date().getFullYear()}
              {settings?.address ? ` • ${settings.address}` : ""}
              {settings?.city ? `, ${settings.city}` : ""}
            </p>
          </div>
          <div className="w-16 hidden sm:block"></div>
        </div>
        <div className="border-b border-black mt-[1.5px] mb-4"></div>

        {/* TABEL IDENTITAS TRANSAKSI PEMBELIAN */}
        <table className="w-full text-xs mb-4 border-collapse">
          <tbody>
            <tr>
              <td className="w-36 py-1 font-semibold text-slate-800">Nomor Dokumen / Nota</td>
              <td className="w-3 py-1 text-center font-bold">:</td>
              <td className="py-1 font-bold font-mono text-black">{purchase.document_number}</td>

              <td className="w-36 py-1 font-semibold text-slate-800">Tanggal Nota / Faktur</td>
              <td className="w-3 py-1 text-center font-bold">:</td>
              <td className="py-1 font-semibold text-black">
                {formatIndoDate(purchase.document_date || purchase.purchase_date)}
              </td>
            </tr>
            <tr>
              <td className="py-1 font-semibold text-slate-800">Nama Toko / Vendor</td>
              <td className="py-1 text-center font-bold">:</td>
              <td className="py-1 font-bold text-black uppercase">{purchase.vendor_name}</td>

              <td className="py-1 font-semibold text-slate-800">Tanggal Buku (SAKTI)</td>
              <td className="py-1 text-center font-bold">:</td>
              <td className="py-1 font-semibold text-black">
                {formatIndoDate(purchase.book_date || purchase.purchase_date)}
              </td>
            </tr>
            <tr>
              <td className="py-1 font-semibold text-slate-800">Catatan / Keterangan</td>
              <td className="py-1 text-center font-bold">:</td>
              <td className="py-1 text-black" colSpan={4}>
                {purchase.notes || "Pengadaan Pembelian Langsung Barang Persediaan / ATK"}
              </td>
            </tr>
          </tbody>
        </table>

        {/* TABEL RINCIAN BARANG */}
        <div className="mb-4">
          <div className="text-xs font-bold uppercase tracking-wide mb-1.5 text-black">
            Rincian Barang yang Diterima:
          </div>
          <table className="w-full text-xs border border-black border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-black">
                <th className="border-r border-black py-1.5 px-2 text-center w-10 font-bold uppercase">No</th>
                <th className="border-r border-black py-1.5 px-3 text-left font-bold uppercase">Nama Barang / Spesifikasi</th>
                <th className="border-r border-black py-1.5 px-3 text-center w-20 font-bold uppercase">Jumlah</th>
                <th className="border-r border-black py-1.5 px-3 text-center w-20 font-bold uppercase">Satuan</th>
                <th className="border-r border-black py-1.5 px-3 text-right w-28 font-bold uppercase">Harga Satuan (Rp)</th>
                <th className="py-1.5 px-3 text-right w-32 font-bold uppercase">Total (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {purchase.items.map((item, idx) => (
                <tr key={idx} className="border-b border-black">
                  <td className="border-r border-black py-1.5 px-2 text-center font-medium">{idx + 1}</td>
                  <td className="border-r border-black py-1.5 px-3 font-semibold text-black">{item.item_name}</td>
                  <td className="border-r border-black py-1.5 px-3 text-center font-bold text-black">{item.quantity}</td>
                  <td className="border-r border-black py-1.5 px-3 text-center uppercase text-black">{item.unit}</td>
                  <td className="border-r border-black py-1.5 px-3 text-right font-mono text-black">
                    {formatCurrency(item.unit_price)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-bold font-mono text-black">
                    {formatCurrency(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black bg-slate-50 font-bold">
                <td colSpan={5} className="border-r border-black py-2 px-3 text-right uppercase">
                  Total Nilai Perolehan:
                </td>
                <td className="py-2 px-3 text-right font-mono text-black text-sm">
                  Rp {formatCurrency(purchase.total_amount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* KOTAK TANDA TANGAN RESMI */}
        <div className="mt-8 pt-4">
          <div className="flex justify-between items-start text-xs text-black">
            <div className="text-center w-64">
              <p className="font-semibold text-slate-700">Penyedia / Toko,</p>
              <p className="font-bold text-black uppercase mt-0.5">{purchase.vendor_name}</p>
              <div className="h-20"></div>
              <p className="font-bold border-b border-black inline-block min-w-[180px] pb-0.5">
                ( .................................................. )
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">Cap / Tanda Tangan Toko</p>
            </div>

            <div className="text-center w-72">
              <p className="font-semibold text-slate-700">
                {settings?.city || "Jakarta"}, {formatIndoDate(purchase.document_date || purchase.purchase_date)}
              </p>
              <p className="font-bold text-black mt-0.5">
                {settings?.official_job || "Pejabat Pembuat Komitmen / Pengurus Barang"}
              </p>
              <div className="h-20"></div>
              <p className="font-bold border-b border-black inline-block min-w-[200px] pb-0.5">
                {settings?.official_name || "( .................................................. )"}
              </p>
              <p className="text-[11px] font-mono text-slate-700 mt-0.5">
                {settings?.official_nip ? `NIP. ${settings.official_nip}` : "NIP. ........................................"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SCREEN VIEW (WEB DISPLAY) */}
      {/* ========================================================================= */}

      {/* Purchase Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm print:hidden">
        <div className="p-6 bg-slate-50/50 border-b border-slate-200">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                  <FileText size={14} /> Nomor Nota
                </div>
                {isAdmin && (
                  <button
                    onClick={handleOpenEditHeader}
                    className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1"
                  >
                    <Pencil size={12} /> Ubah
                  </button>
                )}
              </div>
              <div className="font-bold text-slate-800 text-lg">{purchase.document_number}</div>
            </div>

            <div>
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                  <Store size={14} /> Vendor / Toko
                </div>
                {isAdmin && (
                  <button
                    onClick={handleOpenEditHeader}
                    className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1"
                  >
                    <Pencil size={12} /> Ubah
                  </button>
                )}
              </div>
              <div className="font-bold text-slate-800 text-lg">{purchase.vendor_name}</div>
            </div>

            <div>
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                  <Calendar size={14} /> Tanggal Dokumen
                </div>
                {isAdmin && (
                  <button
                    onClick={handleOpenEditHeader}
                    className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1"
                  >
                    <Pencil size={12} /> Ubah
                  </button>
                )}
              </div>
              <div className="font-bold text-slate-800">
                {formatIndoDate(purchase.document_date || purchase.purchase_date)}
              </div>
              <div className="text-xs text-blue-600 font-semibold mt-0.5">
                Buku (SAKTI): {formatIndoDate(purchase.book_date || purchase.purchase_date)}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">
                <DollarSign size={14} /> Total Bayar
              </div>
              <div className="font-black text-green-600 text-xl">
                Rp {formatCurrency(purchase.total_amount)}
              </div>
            </div>
          </div>
        </div>

        {purchase.notes && (
          <div className="p-6 bg-blue-50/30">
            <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Catatan Tambahan</div>
            <div className="text-slate-700 text-sm whitespace-pre-wrap">{purchase.notes}</div>
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm print:hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Rincian Barang</h2>
            <p className="text-xs text-slate-500">
              {isEditingItems ? "Mode edit aktif: Anda bisa menambah, menghapus, atau mengubah item" : "Daftar komoditas dalam nota ini"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && !isEditingItems && (
              <button
                onClick={handleStartEditItems}
                className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-bold text-xs transition-colors shadow-sm"
              >
                <Pencil size={14} /> Edit Rincian Barang
              </button>
            )}

            {isEditingItems && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenItemSelector(null)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-bold text-xs transition-colors shadow-sm"
                >
                  <Plus size={14} /> Tambah Barang dari Master
                </button>
                <button
                  onClick={handleSaveItems}
                  disabled={updating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white hover:bg-green-700 rounded-lg font-bold text-xs transition-colors shadow-sm disabled:opacity-50"
                >
                  <Check size={14} /> {updating ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
                <button
                  onClick={handleCancelEditItems}
                  disabled={updating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 text-slate-600 hover:bg-slate-300 rounded-lg font-bold text-xs transition-colors"
                >
                  <X size={14} /> Batal
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase w-12">No</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Nama Barang</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase w-32">Jumlah</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase w-24">Satuan</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase w-40">Harga Satuan</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase w-40">Subtotal</th>
                {isEditingItems && <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase w-16">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {(isEditingItems ? tempItems : purchase.items).map((item, index) => (
                <tr key={item.id || `temp-${index}`} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-400 font-mono">{index + 1}</td>
                  <td className="px-4 py-3 text-sm text-slate-800 font-bold">
                    {isEditingItems ? (
                      <button
                        type="button"
                        onClick={() => handleOpenItemSelector(index)}
                        className="w-full text-left px-3 py-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-400 rounded-xl flex items-center justify-between group transition-colors"
                        title="Klik untuk memilih atau mengganti barang dari Master ATK"
                      >
                        <span className="font-bold text-slate-800 group-hover:text-blue-700 truncate pr-2">
                          {item.item_name || <span className="text-slate-400 italic">Pilih dari Master...</span>}
                        </span>
                        <span className="shrink-0 text-[11px] bg-white border border-slate-200 text-blue-600 font-semibold px-2 py-0.5 rounded shadow-xs group-hover:bg-blue-600 group-hover:text-white transition-colors flex items-center gap-1">
                          <Search size={12} /> Ganti
                        </span>
                      </button>
                    ) : (
                      item.item_name
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-right">
                    {isEditingItems ? (
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => updateTempItemField(index, "quantity", parseFloat(e.target.value) || 0)}
                        className="w-24 px-2 py-1.5 border border-slate-300 rounded-lg text-right font-bold focus:border-blue-500 focus:outline-none"
                      />
                    ) : (
                      <span className="font-bold text-slate-800">{item.quantity}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    <span className="inline-block px-2.5 py-1 bg-slate-100 rounded-lg text-xs uppercase font-bold text-slate-600">
                      {item.unit || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-right">
                    {isEditingItems ? (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={item.unit_price}
                        onChange={(e) => updateTempItemField(index, "unit_price", parseFloat(e.target.value) || 0)}
                        className="w-32 px-2 py-1.5 border border-slate-300 rounded-lg text-right font-bold focus:border-blue-500 focus:outline-none"
                      />
                    ) : (
                      <span>Rp {formatCurrency(item.unit_price)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-slate-800">
                    Rp {formatCurrency(item.total)}
                  </td>
                  {isEditingItems && (
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveTempItem(index)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Hapus baris ini"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
              <tr>
                <td colSpan={5} className="px-4 py-4 text-sm text-slate-700 text-right uppercase">
                  Total Keseluruhan:
                </td>
                <td className="px-4 py-4 text-lg text-blue-600 text-right">
                  Rp {formatCurrency(
                    isEditingItems
                      ? tempItems.reduce((s, it) => s + Number(it.total || 0), 0)
                      : purchase.total_amount
                  )}
                </td>
                {isEditingItems && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Receipt View */}
      {purchase.receipt_file ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 print:hidden shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">Bukti Nota Pembelian</h2>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <div className="relative">
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleFileUpdate}
                    title="Ganti Nota"
                  />
                  <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl font-bold text-sm transition-colors">
                    <Upload size={18} /> Ganti Nota
                  </button>
                </div>
              )}
              <button
                onClick={() => setShowReceiptModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl font-bold text-sm transition-colors"
              >
                <Eye size={18} /> Lihat Layar Penuh
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 flex justify-center">
            {purchase.receipt_file.startsWith("data:application/pdf") ? (
              <iframe src={purchase.receipt_file} className="w-full h-96" title="Receipt Preview" />
            ) : (
              <img src={purchase.receipt_file} alt="Receipt" className="max-h-[500px] object-contain" />
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 print:hidden shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Bukti Nota Pembelian</h2>
              <p className="text-sm text-slate-500">Belum ada file bukti nota/kwitansi fisik yang diunggah (opsional).</p>
            </div>
            {isAdmin && (
              <div className="relative">
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={handleFileUpdate}
                  title="Upload Nota"
                />
                <button className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-100 transition-all">
                  <Upload size={18} /> Upload Nota Fisik (PDF / Foto)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDIT DATA DOKUMEN / HEADER */}
      {/* ========================================================================= */}
      {showEditHeaderModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
                  <Pencil size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Edit Data Dokumen Pembelian</h3>
                  <p className="text-xs text-slate-500">Perbarui nomor nota, vendor, dan tanggal SAKTI</p>
                </div>
              </div>
              <button
                onClick={() => setShowEditHeaderModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveHeader} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                  Nomor Nota / Faktur <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={headerForm.document_number}
                  onChange={(e) => setHeaderForm({ ...headerForm, document_number: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white focus:border-blue-500 outline-none"
                  placeholder="Contoh: NOTA-2026/03/001"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                  Nama Toko / Vendor <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={headerForm.vendor_name}
                  onChange={(e) => setHeaderForm({ ...headerForm, vendor_name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white focus:border-blue-500 outline-none"
                  placeholder="Contoh: Toko ATK Sejahtera"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                    Tanggal Dokumen / Nota <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={headerForm.document_date}
                    onChange={(e) => setHeaderForm({ ...headerForm, document_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white focus:border-blue-500 outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                    Tanggal Buku (SAKTI) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={headerForm.book_date}
                    onChange={(e) => setHeaderForm({ ...headerForm, book_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-blue-600 focus:bg-white focus:border-blue-500 outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                  Catatan Tambahan
                </label>
                <textarea
                  rows={3}
                  value={headerForm.notes}
                  onChange={(e) => setHeaderForm({ ...headerForm, notes: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:border-blue-500 outline-none"
                  placeholder="Keterangan transaksi jika ada..."
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditHeaderModal(false)}
                  className="px-5 py-2.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl font-bold text-sm transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="px-6 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  {updating ? "Menyimpan..." : "Simpan Dokumen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SELECT MASTER ATK */}
      {/* ========================================================================= */}
      {showItemModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                  <Search size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Pilih Master ATK</h3>
                  <p className="text-sm text-slate-500 font-medium">
                    {selectedItemIndex !== null ? "Ganti barang pada baris terpilih" : "Tambah barang baru ke nota"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowItemModal(false)}
                className="p-3 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-2xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Search Bar */}
            <div className="p-4 bg-white border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  autoFocus
                  type="text"
                  placeholder="Cari nama barang atau kode BMN..."
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-xl transition-all outline-none text-slate-700 font-bold text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/30">
              {masterItems
                .filter(
                  (i) =>
                    i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (i.item_code && i.item_code.toLowerCase().includes(searchQuery.toLowerCase()))
                )
                .map((atk) => (
                  <button
                    key={atk.id}
                    type="button"
                    onClick={() => handleSelectItem(atk)}
                    className="w-full flex items-center justify-between p-4 bg-white hover:bg-blue-50 rounded-2xl text-left transition-all border border-slate-100 hover:border-blue-200 hover:shadow-md group"
                  >
                    <div className="flex-1">
                      <div className="font-bold text-slate-800 group-hover:text-blue-700 text-base mb-0.5">
                        {atk.name}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-black uppercase rounded">
                          {atk.item_code || "TANPA KODE"}
                        </span>
                        <span className="text-xs text-slate-400 font-semibold">Satuan: {atk.unit}</span>
                      </div>
                    </div>
                    <div className="p-2 bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white rounded-xl transition-all">
                      <Plus size={18} />
                    </div>
                  </button>
                ))}

              {masterItems.filter(
                (i) =>
                  i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  (i.item_code && i.item_code.toLowerCase().includes(searchQuery.toLowerCase()))
              ).length === 0 && (
                <div className="text-center py-12">
                  <p className="font-bold text-slate-400">Barang tidak ditemukan</p>
                  <p className="text-xs text-slate-300 mt-1">Coba masukkan kata kunci yang berbeda</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: FULL SCREEN RECEIPT PREVIEW */}
      {/* ========================================================================= */}
      {showReceiptModal && purchase.receipt_file && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white/50 backdrop-blur-sm sticky top-0">
              <h3 className="font-bold text-slate-800 ml-4 line-clamp-1">
                {purchase.receipt_filename || "Nota Pembelian"}
              </h3>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="p-3 hover:bg-slate-100 rounded-full text-slate-400 group"
              >
                <X size={24} className="group-hover:rotate-90 transition-transform" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 p-4 flex justify-center">
              {purchase.receipt_file.startsWith("data:application/pdf") ? (
                <iframe
                  src={purchase.receipt_file}
                  className="w-full h-full min-h-[700px] rounded-xl shadow-lg bg-white"
                  title="Receipt PDF"
                />
              ) : (
                <img
                  src={purchase.receipt_file}
                  alt="Receipt"
                  className="max-w-full h-auto mx-auto rounded-xl shadow-lg"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
