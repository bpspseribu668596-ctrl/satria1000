/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db, type TransferKeluar, type TransferKeluarItem, type Settings, type ATKItem } from "../lib/db";
import {
  ArrowLeft,
  FileText,
  Calendar,
  Building2,
  Eye,
  X,
  Pencil,
  Check,
  Upload,
  Printer,
  Plus,
  Trash2,
  Search,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface EditableTransferItem extends Omit<TransferKeluarItem, "id" | "transfer_id"> {
  id?: number;
  transfer_id?: number;
}

export default function TransferKeluarDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [transfer, setTransfer] = useState<TransferKeluar | null>(null);
  const [items, setItems] = useState<TransferKeluarItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [masterItemsWithStock, setMasterItemsWithStock] = useState<(ATKItem & { stock: number })[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  
  // Modals
  const [showBASTModal, setShowBASTModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showEditHeaderModal, setShowEditHeaderModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);

  // Header form
  const [headerForm, setHeaderForm] = useState({
    document_number: "",
    destination_satker: "",
    document_date: "",
    book_date: "",
    notes: "",
  });

  // Items editing
  const [isEditingItems, setIsEditingItems] = useState(false);
  const [tempItems, setTempItems] = useState<EditableTransferItem[]>([]);
  const [deletedItemIds, setDeletedItemIds] = useState<number[]>([]);

  const canEdit = Boolean(
    user?.role?.some((r: string) => ["admin", "operator", "verifikator", "penanggungjawab"].includes(r))
  );
  const isAdmin = canEdit;

  const loadDetail = async () => {
    if (!id) return;
    try {
      const [transferData, itemData, sett, mItems, pItems, aReqs, aReqItems, rNew, initBals, tMasukItems, tKeluarItems] = await Promise.all([
        db.transfer_keluar.get(parseInt(id)),
        db.transfer_keluar_items.where("transfer_id").equals(parseInt(id)).toArray(),
        db.settings.get(1),
        db.atk_items.toArray(),
        db.purchase_items.toArray(),
        db.atk_requests.where("status").equals("approved").toArray(),
        db.atk_request_items.toArray(),
        db.requests.where("status").equals("approved").toArray(),
        db.initial_balances.where("year").equals(new Date().getFullYear()).toArray(),
        db.transfer_masuk_items.toArray(),
        db.transfer_keluar_items.toArray(),
      ]);

      if (transferData) {
        setTransfer(transferData);
        setItems(itemData);
        setSettings(sett || null);

        setHeaderForm({
          document_number: transferData.document_number || "",
          destination_satker: transferData.destination_satker || "",
          document_date: transferData.document_date || transferData.transfer_date || "",
          book_date: transferData.book_date || transferData.transfer_date || "",
          notes: transferData.notes || "",
        });

        // Compute stock ledger map
        const stockMap = new Map<string, number>();
        const add = (name: string, qty: any) => {
          const key = name.toLowerCase();
          stockMap.set(key, (stockMap.get(key) || 0) + (Number(qty) || 0));
        };
        const sub = (name: string, qty: any) => {
          const key = name.toLowerCase();
          stockMap.set(key, (stockMap.get(key) || 0) - (Number(qty) || 0));
        };

        initBals.forEach((b: any) => add(b.item_name, b.quantity));
        pItems.forEach((pi: any) => add(pi.item_name, pi.quantity));
        tMasukItems.forEach((ti: any) => add(ti.item_name, ti.quantity));
        tKeluarItems.forEach((ti: any) => sub(ti.item_name, ti.quantity));

        const appIds = new Set(aReqs.map((r: any) => r.id));
        aReqItems.forEach((ri: any) => {
          if (appIds.has(ri.request_id)) sub(ri.final_item_name || ri.item_name, ri.quantity);
        });
        rNew.forEach((r: any) => (r.items || []).forEach((ri: any) => sub(ri.name, ri.quantity)));

        // Gabungkan seluruh katalog item dari Master ATK, Transfer Masuk, Pembelian, dan Saldo Awal
        const itemCatalog = new Map<string, { id?: number; item_code?: string; name: string; unit: string }>();

        mItems.forEach((m: any) => {
          if (m && m.name) {
            itemCatalog.set(m.name.trim().toLowerCase(), {
              id: m.id,
              item_code: m.item_code || "",
              name: m.name.trim(),
              unit: m.unit || "pcs",
            });
          }
        });

        tMasukItems.forEach((ti: any) => {
          if (ti && ti.item_name) {
            const key = ti.item_name.trim().toLowerCase();
            if (!itemCatalog.has(key)) {
              itemCatalog.set(key, {
                id: -(itemCatalog.size + 1),
                item_code: "TM",
                name: ti.item_name.trim(),
                unit: ti.unit || "pcs",
              });
            }
          }
        });

        pItems.forEach((pi: any) => {
          if (pi && pi.item_name) {
            const key = pi.item_name.trim().toLowerCase();
            if (!itemCatalog.has(key)) {
              itemCatalog.set(key, {
                id: -(itemCatalog.size + 1),
                item_code: "BELI",
                name: pi.item_name.trim(),
                unit: pi.unit || "pcs",
              });
            }
          }
        });

        initBals.forEach((bi: any) => {
          if (bi && bi.item_name) {
            const key = bi.item_name.trim().toLowerCase();
            if (!itemCatalog.has(key)) {
              itemCatalog.set(key, {
                id: -(itemCatalog.size + 1),
                item_code: "SA",
                name: bi.item_name.trim(),
                unit: bi.unit || "pcs",
              });
            }
          }
        });

        const currentItemNames = new Set((itemData || []).map((i: any) => i.item_name.trim().toLowerCase()));

        // Filter: hanya yang memiliki stock > 0 atau yang memang sudah ada di dokumen ini
        const withStock = Array.from(itemCatalog.values()).map((item: any) => ({
          ...item,
          stock: stockMap.get(item.name.toLowerCase()) || 0,
        })).filter((m: any) => m.stock > 0 || currentItemNames.has(m.name.toLowerCase()));

        setMasterItemsWithStock(withStock);
      }
    } catch (err) {
      console.error("Error loading detail transfer keluar:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [id]);

  // --- HEADER EDIT HANDLERS ---
  const handleOpenEditHeader = () => {
    if (!transfer) return;
    setHeaderForm({
      document_number: transfer.document_number || "",
      destination_satker: transfer.destination_satker || "",
      document_date: transfer.document_date || transfer.transfer_date || "",
      book_date: transfer.book_date || transfer.transfer_date || "",
      notes: transfer.notes || "",
    });
    setShowEditHeaderModal(true);
  };

  const handleSaveHeader = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transfer) return;
    if (!headerForm.document_number.trim()) return alert("Nomor BAST tidak boleh kosong");
    if (!headerForm.destination_satker.trim()) return alert("Satker tujuan tidak boleh kosong");

    setUpdating(true);
    try {
      await db.transfer_keluar.update(transfer.id!, {
        document_number: headerForm.document_number.trim(),
        destination_satker: headerForm.destination_satker.trim(),
        transfer_date: headerForm.document_date,
        document_date: headerForm.document_date,
        book_date: headerForm.book_date,
        notes: headerForm.notes ? headerForm.notes.trim() : null,
      });

      setTransfer({
        ...transfer,
        document_number: headerForm.document_number.trim(),
        destination_satker: headerForm.destination_satker.trim(),
        transfer_date: headerForm.document_date,
        document_date: headerForm.document_date,
        book_date: headerForm.book_date,
        notes: headerForm.notes ? headerForm.notes.trim() : null,
      });

      setShowEditHeaderModal(false);
      alert("Data dokumen transfer keluar berhasil diperbarui!");
    } catch (err) {
      alert("Gagal memperbarui data: " + (err as Error).message);
    } finally {
      setUpdating(false);
    }
  };

  // --- ITEMS EDIT HANDLERS ---
  const handleStartEditItems = () => {
    setTempItems(items.map((it) => ({ ...it })));
    setDeletedItemIds([]);
    setIsEditingItems(true);
  };

  const handleCancelEditItems = () => {
    setIsEditingItems(false);
    setDeletedItemIds([]);
    setTempItems([]);
  };

  const handleRemoveTempItem = (index: number) => {
    if (tempItems.length <= 1) {
      alert("Minimal harus ada 1 barang dalam daftar transfer keluar");
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
      const updated = [...tempItems];
      updated[selectedItemIndex] = {
        ...updated[selectedItemIndex],
        item_name: atk.name,
        unit: atk.unit,
      };
      setTempItems(updated);
    } else {
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
    field: keyof EditableTransferItem,
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
    if (!transfer) return;

    const invalidItems = tempItems.filter(
      (it) => !it.item_name.trim() || Number(it.quantity) <= 0
    );
    if (invalidItems.length > 0) {
      alert("Pastikan semua nama barang terisi dan jumlah lebih dari 0!");
      return;
    }

    setUpdating(true);
    try {
      // 1. Delete removed items
      for (const delId of deletedItemIds) {
        await db.transfer_keluar_items.delete(delId);
      }

      // 2. Update existing or insert new
      let grandTotal = 0;
      for (const item of tempItems) {
        const itemTotal = Number(item.quantity) * Number(item.unit_price);
        grandTotal += itemTotal;

        if (item.id) {
          await db.transfer_keluar_items.update(item.id, {
            item_name: item.item_name.trim(),
            quantity: Number(item.quantity),
            unit: item.unit,
            unit_price: Number(item.unit_price),
            total: itemTotal,
          });
        } else {
          await db.transfer_keluar_items.add({
            transfer_id: transfer.id!,
            item_name: item.item_name.trim(),
            quantity: Number(item.quantity),
            unit: item.unit,
            unit_price: Number(item.unit_price),
            total: itemTotal,
          });
        }
      }

      // 3. Update header total_amount
      await db.transfer_keluar.update(transfer.id!, { total_amount: grandTotal });

      await loadDetail();
      setIsEditingItems(false);
      setDeletedItemIds([]);
      alert("Rincian barang transfer keluar berhasil diperbarui!");
    } catch (err) {
      alert("Gagal memperbarui item: " + (err as Error).message);
    } finally {
      setUpdating(false);
    }
  };

  // BAST file replacement
  const handleFileUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !transfer) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        setUpdating(true);
        await db.transfer_keluar.update(transfer.id!, {
          bast_file: base64,
          bast_filename: file.name,
        });
        setTransfer({
          ...transfer,
          bast_file: base64,
          bast_filename: file.name,
        });
        alert("Dokumen BAST berhasil diperbarui");
      } catch (err) {
        alert("Gagal memperbarui dokumen: " + (err as Error).message);
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

  if (!transfer) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
        <p className="text-slate-500 italic">Data tidak ditemukan</p>
        <button
          onClick={() => navigate("/app/transfer-keluar")}
          className="mt-4 text-blue-600 font-semibold hover:underline"
        >
          Kembali ke Daftar
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-12 space-y-6">
      {/* ========================================================================= */}
      {/* HEADER ACTIONS (HIDDEN ON PRINT) */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/app/transfer-keluar")}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Detail Transfer Keluar</h1>
            <p className="text-xs text-slate-500">Pencatatan serah terima mutasi barang persediaan ke satker lain</p>
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
            <Printer size={18} /> Cetak BAST Resmi
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
              BERITA ACARA SERAH TERIMA BARANG (BAST)
            </h2>
            <p className="text-[11px] font-semibold text-slate-800 uppercase tracking-wider">
              MUTASI KELUAR BARANG MILIK NEGARA / PERSEDIAAN
            </p>
            <p className="text-[11px] font-medium text-slate-800 mt-0.5">
              Tahun Anggaran {settings?.budget_year || new Date().getFullYear()}
              {settings?.address ? ` • ${settings.address}` : ""}
              {settings?.city ? `, ${settings.city}` : ""}
            </p>
          </div>
          <div className="w-16 hidden sm:block"></div>
        </div>
        <div className="border-b border-black mt-[1.5px] mb-4"></div>

        {/* PARAGRAF PEMBUKA BAST DINAS */}
        <div className="text-xs mb-3 text-justify leading-relaxed">
          <p className="mb-2">
            Pada hari ini, tanggal <strong>{formatIndoDate(transfer.document_date || transfer.transfer_date)}</strong>,
            bertempat di Kantor Badan Pusat Statistik Kepulauan Seribu, kami yang bertanda tangan di bawah ini:
          </p>
          <table className="w-full text-xs mb-3 border-collapse">
            <tbody>
              <tr>
                <td className="w-6 py-0.5 font-bold">1.</td>
                <td className="w-28 py-0.5 font-semibold">Nama</td>
                <td className="w-3 py-0.5 text-center font-bold">:</td>
                <td className="py-0.5 font-bold">{settings?.official_name || "Pejabat Penanggung Jawab BMN"}</td>
              </tr>
              <tr>
                <td></td>
                <td className="py-0.5 font-semibold">NIP</td>
                <td className="py-0.5 text-center font-bold">:</td>
                <td className="py-0.5 font-mono">{settings?.official_nip || "-"}</td>
              </tr>
              <tr>
                <td></td>
                <td className="py-0.5 font-semibold">Jabatan</td>
                <td className="py-0.5 text-center font-bold">:</td>
                <td className="py-0.5">
                  {settings?.official_job || "Pejabat Pembuat Komitmen / Pengurus Barang"}, BPS Kepulauan Seribu
                </td>
              </tr>
              <tr>
                <td></td>
                <td className="py-0.5 font-semibold" colSpan={3}>
                  selanjutnya disebut <strong>PIHAK KESATU (Yang Menyerahkan)</strong>.
                </td>
              </tr>
              <tr>
                <td className="pt-2 font-bold">2.</td>
                <td className="pt-2 font-semibold">Satker Penerima</td>
                <td className="pt-2 text-center font-bold">:</td>
                <td className="pt-2 font-bold uppercase">{transfer.destination_satker}</td>
              </tr>
              <tr>
                <td></td>
                <td className="py-0.5 font-semibold" colSpan={3}>
                  selanjutnya disebut <strong>PIHAK KEDUA (Yang Menerima)</strong>.
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            PIHAK KESATU telah menyerahkan kepada PIHAK KEDUA, dan PIHAK KEDUA telah menerima dari PIHAK KESATU
            barang milik negara/persediaan berdasarkan Nomor BAST <strong>{transfer.document_number}</strong>{" "}
            (Tanggal Buku SAKTI: {formatIndoDate(transfer.book_date || transfer.transfer_date)}) dengan rincian sebagai berikut:
          </p>
        </div>

        {/* TABEL RINCIAN BARANG */}
        <div className="mb-4">
          <table className="w-full text-xs border border-black border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-black">
                <th className="border-r border-black py-1.5 px-2 text-center w-10 font-bold uppercase">No</th>
                <th className="border-r border-black py-1.5 px-3 text-left font-bold uppercase">Nama Barang / Spesifikasi</th>
                <th className="border-r border-black py-1.5 px-3 text-center w-20 font-bold uppercase">Jumlah</th>
                <th className="border-r border-black py-1.5 px-3 text-center w-20 font-bold uppercase">Satuan</th>
                <th className="border-r border-black py-1.5 px-3 text-right w-28 font-bold uppercase">Harga Satuan (Rp)</th>
                <th className="py-1.5 px-3 text-right w-32 font-bold uppercase">Total Nilai (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
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
                  Total Nilai Transfer Keluar:
                </td>
                <td className="py-2 px-3 text-right font-mono text-black text-sm">
                  Rp {formatCurrency(transfer.total_amount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="text-xs text-justify mb-6">
          Demikian Berita Acara Serah Terima ini dibuat dengan sebenarnya dalam rangkap secukupnya untuk dapat
          dipergunakan sebagaimana mestinya.
        </p>

        {/* KOTAK TANDA TANGAN RESMI 2 PIHAK + MENGETAHUI */}
        <div className="mt-6 pt-2">
          <div className="flex justify-between items-start text-xs text-black mb-8">
            <div className="text-center w-64">
              <p className="font-semibold text-slate-700">PIHAK KEDUA (Yang Menerima),</p>
              <p className="font-bold text-black uppercase mt-0.5">{transfer.destination_satker}</p>
              <div className="h-20"></div>
              <p className="font-bold border-b border-black inline-block min-w-[180px] pb-0.5">
                ( .................................................. )
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">Nama & NIP Petugas Penerima</p>
            </div>

            <div className="text-center w-64">
              <p className="font-semibold text-slate-700">PIHAK KESATU (Yang Menyerahkan),</p>
              <p className="font-bold text-black uppercase mt-0.5">BPS KEPULAUAN SERIBU</p>
              <div className="h-20"></div>
              <p className="font-bold border-b border-black inline-block min-w-[180px] pb-0.5">
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 print:hidden">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="flex items-center gap-2">
              <FileText size={18} />
              <span className="text-xs font-bold uppercase tracking-wider">No BAST Keluar</span>
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
          <p className="text-lg font-bold text-slate-800 font-mono">{transfer.document_number}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="flex items-center gap-2">
              <Building2 size={18} />
              <span className="text-xs font-bold uppercase tracking-wider">Tujuan Satker</span>
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
          <p className="text-lg font-bold text-slate-800 uppercase">{transfer.destination_satker}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="flex items-center gap-2">
              <Calendar size={18} />
              <span className="text-xs font-bold uppercase tracking-wider">Tgl Dokumen</span>
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
          <p className="text-lg font-bold text-slate-800">
            {formatIndoDate(transfer.document_date || transfer.transfer_date)}
          </p>
          <p className="text-xs text-blue-600 font-semibold mt-1">
            Buku (SAKTI): {formatIndoDate(transfer.book_date || transfer.transfer_date)}
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Nilai Keluar</span>
          </div>
          <p className="text-xl font-black text-orange-600">
            Rp {formatCurrency(transfer.total_amount)}
          </p>
        </div>
      </div>

      {/* Item Transfer Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm print:hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Item Transfer Keluar</h2>
            <p className="text-xs text-slate-500">
              {isEditingItems ? "Mode edit aktif: Anda bisa menambah, menghapus, atau mengubah item" : "Daftar komoditas yang diserahkan"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && !isEditingItems && (
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
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase w-40">Total</th>
                {isEditingItems && <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase w-16">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {(isEditingItems ? tempItems : items).map((item, idx) => (
                <tr key={item.id || `temp-tk-${idx}`} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-400 font-mono">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm text-slate-800 font-bold">
                    {isEditingItems ? (
                      <button
                        type="button"
                        onClick={() => handleOpenItemSelector(idx)}
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
                        onChange={(e) => updateTempItemField(idx, "quantity", parseFloat(e.target.value) || 0)}
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
                        onChange={(e) => updateTempItemField(idx, "unit_price", parseFloat(e.target.value) || 0)}
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
                        onClick={() => handleRemoveTempItem(idx)}
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
                <td className="px-4 py-4 text-lg text-orange-600 text-right">
                  Rp {formatCurrency(
                    isEditingItems
                      ? tempItems.reduce((s, it) => s + Number(it.total || 0), 0)
                      : transfer.total_amount
                  )}
                </td>
                {isEditingItems && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Catatan Box */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Catatan Tambahan</h3>
        <p className="text-slate-700 text-sm whitespace-pre-wrap">{transfer.notes || "-"}</p>
      </div>

      {/* BAST File View (Optional Attachment) */}
      {transfer.bast_file && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 print:hidden shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">Dokumen Lampiran BAST Bertandatangan</h2>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <div className="relative">
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleFileUpdate}
                    title="Ganti Dokumen"
                  />
                  <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl font-bold text-sm transition-colors">
                    <Upload size={18} /> Ganti Dokumen
                  </button>
                </div>
              )}
              <button
                onClick={() => setShowBASTModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl font-bold text-sm transition-colors"
              >
                <Eye size={18} /> Lihat Layar Penuh
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 flex justify-center">
            {transfer.bast_file.startsWith("data:application/pdf") ? (
              <iframe src={transfer.bast_file} className="w-full h-96" title="BAST Preview" />
            ) : (
              <img src={transfer.bast_file} alt="BAST" className="max-h-[500px] object-contain" />
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
                  <h3 className="text-lg font-bold text-slate-800">Edit Data Dokumen Transfer Keluar</h3>
                  <p className="text-xs text-slate-500">Perbarui nomor BAST, satker tujuan, dan tanggal SAKTI</p>
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
                  Nomor BAST Keluar <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={headerForm.document_number}
                  onChange={(e) => setHeaderForm({ ...headerForm, document_number: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white focus:border-blue-500 outline-none"
                  placeholder="Contoh: BAST-TK-2026/001"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                  Satker Penerima / Tujuan <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={headerForm.destination_satker}
                  onChange={(e) => setHeaderForm({ ...headerForm, destination_satker: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:bg-white focus:border-blue-500 outline-none"
                  placeholder="Contoh: BPS Kabupaten Serang"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                    Tanggal Dokumen (BAST) <span className="text-red-500">*</span>
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
                  placeholder="Catatan penyerahan barang..."
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
      {/* MODAL: SELECT MASTER ATK (WITH CURRENT AVAILABLE STOCK) */}
      {/* ========================================================================= */}
      {showItemModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl">
                  <Search size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Pilih Master ATK</h3>
                  <p className="text-sm text-slate-500 font-medium">
                    {selectedItemIndex !== null ? "Ganti barang pada baris terpilih" : "Tambah barang transfer keluar"}
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
              {masterItemsWithStock
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
                    className="w-full flex items-center justify-between p-4 bg-white hover:bg-orange-50 rounded-2xl text-left transition-all border border-slate-100 hover:border-orange-200 hover:shadow-md group"
                  >
                    <div className="flex-1">
                      <div className="font-bold text-slate-800 group-hover:text-orange-700 text-base mb-0.5">
                        {atk.name}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-black uppercase rounded">
                          {atk.item_code || "TANPA KODE"}
                        </span>
                        <span className="text-xs text-slate-400 font-semibold">Satuan: {atk.unit}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          atk.stock > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                        }`}>
                          Sisa Stok: {atk.stock} {atk.unit}
                        </span>
                      </div>
                    </div>
                    <div className="p-2 bg-slate-50 text-slate-400 group-hover:bg-orange-600 group-hover:text-white rounded-xl transition-all">
                      <Plus size={18} />
                    </div>
                  </button>
                ))}

              {masterItemsWithStock.filter(
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
      {/* MODAL: FULL SCREEN BAST PREVIEW */}
      {/* ========================================================================= */}
      {showBASTModal && transfer.bast_file && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white/50 backdrop-blur-sm sticky top-0">
              <h3 className="font-bold text-slate-800 ml-4 line-clamp-1">
                {transfer.bast_filename || "Dokumen Lampiran BAST"}
              </h3>
              <button
                onClick={() => setShowBASTModal(false)}
                className="p-3 hover:bg-slate-100 rounded-full text-slate-400 group"
              >
                <X size={24} className="group-hover:rotate-90 transition-transform" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 p-4 flex justify-center">
              {transfer.bast_file.startsWith("data:application/pdf") ? (
                <iframe
                  src={transfer.bast_file}
                  className="w-full h-full min-h-[700px] rounded-xl shadow-lg bg-white"
                  title="BAST PDF"
                />
              ) : (
                <img
                  src={transfer.bast_file}
                  alt="BAST"
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
