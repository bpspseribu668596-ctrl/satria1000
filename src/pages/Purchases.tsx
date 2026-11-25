/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef } from "react";
import { db, type Purchase, type PurchaseItem, type ATKItem } from "../lib/db";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useDialog } from "../hooks/useDialog";
import Dialog from "../components/Dialog";
import * as XLSX from "xlsx";
import {
  FileText,
  Trash2,
  Plus,
  Package,
  DollarSign,
  FileSpreadsheet,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronRight,
  Layers,
  UploadCloud,
} from "lucide-react";

interface PurchaseWithItems extends Purchase {
  items: PurchaseItem[];
}

interface ParsedItem {
  item_code: string;
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  isNewItem: boolean;
}

interface ParsedDocGroup {
  document_number: string;
  document_date: string;
  book_date: string;
  vendor_name: string;
  total_amount: number;
  isDuplicate: boolean;
  items: ParsedItem[];
}

interface DetectedNewItem {
  item_code: string;
  name: string;
  unit: string;
}

const COMMON_UNITS = [
  "pcs",
  "Pak",
  "Rim",
  "Set",
  "Buku",
  "Buah",
  "Kotak",
  "Lusin",
  "Roll",
  "Dus",
  "Botol",
  "Lembar",
  "Box",
];

function parseExcelDate(val: any): string {
  if (!val) return new Date().toISOString().split("T")[0];
  if (typeof val === "number") {
    // Excel base date: 1899-12-30 (taking into account leap year 1900 bug)
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof val === "string") {
    const str = val.trim();
    // DD-MM-YYYY or DD/MM/YYYY
    const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    }
    // YYYY-MM-DD
    const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (ymd) {
      return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
    }
  }
  return new Date().toISOString().split("T")[0];
}

export default function Purchases() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dialogState, closeDialog, alert, confirm } = useDialog();
  const [purchases, setPurchases] = useState<PurchaseWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  // Import SAKTI Excel States
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [parsingExcel, setParsingExcel] = useState(false);
  const [isSavingImport, setIsSavingImport] = useState(false);
  const [saveProgress, setSaveProgress] = useState("");
  const [parsedGroups, setParsedGroups] = useState<ParsedDocGroup[]>([]);
  const [newItemsList, setNewItemsList] = useState<DetectedNewItem[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [expandedDocs, setExpandedDocs] = useState<Record<string, boolean>>({});

  const loadPurchases = async () => {
    try {
      const purchaseData = await db.purchases
        .orderBy("created_at")
        .reverse()
        .toArray();

      const withItems = await Promise.all(
        purchaseData.map(async (purchase: Purchase) => {
          const items = await db.purchase_items
            .where("purchase_id")
            .equals(purchase.id!)
            .toArray();
          return { ...purchase, items };
        }),
      );

      setPurchases(withItems);
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPurchases();
  }, []);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm("Yakin hapus data pembelian ini beserta semua item?", { destructive: true, confirmLabel: "Ya, Hapus" });
    if (!ok) return;
    try {
      await db.purchase_items.where("purchase_id").equals(id).delete();
      await db.purchases.delete(id);
      await loadPurchases();
    } catch (err) {
      await alert("Gagal hapus: " + (err as Error).message);
    }
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat("id-ID", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  // Handler for Excel File Upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingExcel(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);

      if (!rawRows || rawRows.length === 0) {
        await alert("File Excel kosong atau format tidak sesuai!");
        return;
      }

      // Fetch master items and existing purchases
      const [existingMaster, existingPurchases] = await Promise.all([
        db.atk_items.toArray(),
        db.purchases.toArray(),
      ]);

      const existingDocMap = new Set(
        existingPurchases.map((p: Purchase) => (p.document_number || "").trim().toLowerCase()),
      );

      // Maps for quick item lookup
      const masterByCode = new Map<string, ATKItem>();
      const masterByName = new Map<string, ATKItem>();
      for (const item of existingMaster) {
        if (item.item_code) masterByCode.set(item.item_code.trim().toLowerCase(), item);
        if (item.name) masterByName.set(item.name.trim().toLowerCase(), item);
      }

      const groupsMap = new Map<string, ParsedDocGroup>();
      const detectedNewMap = new Map<string, DetectedNewItem>();

      for (const row of rawRows) {
        // Handle various header column names flexibly
        const rawDocNum =
          row["NOMOR DOKUMEN"] ||
          row["Nomor Dokumen"] ||
          row["NO DOKUMEN"] ||
          row["No Dokumen"] ||
          "";
        const docNum = String(rawDocNum).trim();
        if (!docNum) continue;

        const rawItemName =
          row["NAMA BARANG"] ||
          row["Nama Barang"] ||
          row["NAMA ITEM"] ||
          row["Nama Item"] ||
          "";
        const itemName = String(rawItemName).trim();
        if (!itemName) continue;

        const rawItemCode =
          row["KODE BARANG"] ||
          row["Kode Barang"] ||
          row["KODE ITEM"] ||
          row["Kode Item"] ||
          "";
        const itemCode = String(rawItemCode).trim();

        const rawQty = row["JUMLAH"] ?? row["Jumlah"] ?? row["QTY"] ?? 0;
        const qty = typeof rawQty === "number" ? rawQty : parseFloat(String(rawQty).replace(/,/g, "")) || 0;

        const rawPrice =
          row["HARGA SATUAN"] ?? row["Harga Satuan"] ?? row["HARGA"] ?? row["Harga"] ?? 0;
        const unitPrice =
          typeof rawPrice === "number" ? rawPrice : parseFloat(String(rawPrice).replace(/,/g, "")) || 0;

        const rawTotal = row["TOTAL"] ?? row["Total"] ?? 0;
        const total =
          typeof rawTotal === "number"
            ? rawTotal
            : parseFloat(String(rawTotal).replace(/,/g, "")) || qty * unitPrice;

        const vendor = String(
          row["Vendor"] || row["VENDOR"] || row["Toko"] || row["TOKO"] || "Cek",
        ).trim();

        const tglDokParsed = parseExcelDate(
          row["TGL DOK"] ?? row["Tgl Dok"] ?? row["TANGGAL DOKUMEN"],
        );
        const tglBukuParsed = parseExcelDate(
          row["TGL BUKU"] ?? row["Tgl Buku"] ?? row["TANGGAL BUKU"] ?? tglDokParsed,
        );

        // Check if item exists in Master ATK
        let masterItem = masterByName.get(itemName.toLowerCase());
        if (!masterItem && itemCode) {
          masterItem = masterByCode.get(itemCode.toLowerCase());
        }

        const isNewItem = !masterItem;
        const defaultUnit = masterItem ? masterItem.unit : "pcs";

        if (isNewItem && !detectedNewMap.has(itemName.toLowerCase())) {
          detectedNewMap.set(itemName.toLowerCase(), {
            item_code: itemCode,
            name: itemName,
            unit: defaultUnit,
          });
        }

        const parsedItem: ParsedItem = {
          item_code: itemCode,
          item_name: itemName,
          quantity: qty,
          unit: defaultUnit,
          unit_price: unitPrice,
          total: total,
          isNewItem,
        };

        if (!groupsMap.has(docNum)) {
          groupsMap.set(docNum, {
            document_number: docNum,
            document_date: tglDokParsed,
            book_date: tglBukuParsed,
            vendor_name: vendor,
            total_amount: total,
            isDuplicate: existingDocMap.has(docNum.toLowerCase()),
            items: [parsedItem],
          });
        } else {
          const group = groupsMap.get(docNum)!;
          group.items.push(parsedItem);
          group.total_amount += total;
        }
      }

      const groups = Array.from(groupsMap.values());
      const newItems = Array.from(detectedNewMap.values());

      if (groups.length === 0) {
        await alert("Tidak ada data nota pembelian yang dapat diproses dari file Excel ini.");
        return;
      }

      setParsedGroups(groups);
      setNewItemsList(newItems);
      // Expand first doc by default
      if (groups.length > 0) {
        setExpandedDocs({ [groups[0].document_number]: true });
      }
      setShowPreviewModal(true);
    } catch (err) {
      console.error("Excel parse error:", err);
      await alert("Gagal membaca file Excel: " + (err as Error).message);
    } finally {
      setParsingExcel(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUnitChange = (itemName: string, newUnit: string) => {
    setNewItemsList((prev) =>
      prev.map((item) => (item.name === itemName ? { ...item, unit: newUnit } : item)),
    );
    setParsedGroups((prev) =>
      prev.map((group) => ({
        ...group,
        items: group.items.map((itm) =>
          itm.item_name.toLowerCase() === itemName.toLowerCase()
            ? { ...itm, unit: newUnit }
            : itm,
        ),
      })),
    );
  };

  const toggleDocExpand = (docNum: string) => {
    setExpandedDocs((prev) => ({
      ...prev,
      [docNum]: !prev[docNum],
    }));
  };

  const handleApproveImport = async () => {
    const validGroups = skipDuplicates
      ? parsedGroups.filter((g) => !g.isDuplicate)
      : parsedGroups;

    if (validGroups.length === 0) {
      await alert("Semua nota sudah ada di database atau tidak ada nota yang valid untuk disimpan.");
      return;
    }

    setIsSavingImport(true);
    try {
      // 1. Save new items to db.atk_items
      if (newItemsList.length > 0) {
        setSaveProgress(`Mendaftarkan ${newItemsList.length} master barang baru...`);
        for (const ni of newItemsList) {
          await db.atk_items.add({
            item_code: ni.item_code,
            name: ni.name,
            unit: ni.unit,
            created_at: new Date().toISOString(),
          });
        }
      }

      // 2. Create initial balance (qty 0) for each unique document year
      const docYears = Array.from(
        new Set(
          validGroups.map((g) => {
            const y = parseInt(g.book_date?.split("-")[0] || g.document_date?.split("-")[0]);
            return isNaN(y) ? new Date().getFullYear() : y;
          }),
        ),
      );

      const now = new Date().toISOString();
      for (const yr of docYears) {
        setSaveProgress(`Memperbarui Saldo Awal tahun ${yr}...`);
        const existingBalances = await db.initial_balances.where("year").equals(yr).toArray();
        const existingBalanceNames = new Set(
          existingBalances.map((b: any) => (b.item_name || "").trim().toLowerCase()),
        );

        for (const ni of newItemsList) {
          if (!existingBalanceNames.has(ni.name.trim().toLowerCase())) {
            await db.initial_balances.add({
              item_name: ni.name,
              unit: ni.unit,
              quantity: 0,
              unit_price: 0,
              year: yr,
              created_at: now,
              updated_at: now,
            });
            existingBalanceNames.add(ni.name.trim().toLowerCase());
          }
        }
      }

      // 3. Save purchases and purchase items
      let savedPurchasesCount = 0;
      for (let i = 0; i < validGroups.length; i++) {
        const group = validGroups[i];
        setSaveProgress(
          `Menyimpan nota ${i + 1} dari ${validGroups.length} (${group.document_number})...`,
        );

        const purchaseId = await db.purchases.add({
          document_number: group.document_number,
          purchase_date: group.document_date,
          document_date: group.document_date,
          book_date: group.book_date,
          vendor_name: group.vendor_name || "Cek",
          total_amount: group.total_amount,
          receipt_file: null,
          receipt_filename: null,
          notes: "Import dari SAKTI",
          created_by: user?.id || 1,
          created_at: new Date().toISOString(),
        });

        for (const itm of group.items) {
          // Resolve latest unit from newItemsList if applicable
          const matchedNew = newItemsList.find(
            (n) => n.name.toLowerCase() === itm.item_name.toLowerCase(),
          );
          const finalUnit = matchedNew ? matchedNew.unit : itm.unit;

          await db.purchase_items.add({
            purchase_id: purchaseId as number,
            item_name: itm.item_name,
            quantity: itm.quantity,
            unit: finalUnit,
            unit_price: itm.unit_price,
            total: itm.total,
          });
        }
        savedPurchasesCount++;
      }

      await alert(
        `Sukses! Berhasil mengimpor ${savedPurchasesCount} nota pembelian dari SAKTI` +
          (newItemsList.length > 0
            ? ` dan mendaftarkan ${newItemsList.length} barang baru ke Master ATK & Saldo Awal (qty: 0).`
            : "."),
      );

      setShowPreviewModal(false);
      setParsedGroups([]);
      setNewItemsList([]);
      await loadPurchases();
    } catch (err) {
      console.error("Save import error:", err);
      await alert("Terjadi kesalahan saat menyimpan import: " + (err as Error).message);
    } finally {
      setIsSavingImport(false);
      setSaveProgress("");
    }
  };

  const totalValue = purchases.reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0);
  const totalItems = purchases.length;

  // Preview stats
  const previewTotalNotas = parsedGroups.length;
  const previewValidNotas = skipDuplicates
    ? parsedGroups.filter((g) => !g.isDuplicate).length
    : parsedGroups.length;
  const previewDuplicateCount = parsedGroups.filter((g) => g.isDuplicate).length;
  const previewTotalItemRows = parsedGroups.reduce((sum, g) => sum + g.items.length, 0);
  const previewTotalAmount = parsedGroups.reduce(
    (sum, g) => (skipDuplicates && g.isDuplicate ? sum : sum + g.total_amount),
    0,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Dialog state={dialogState} onClose={closeDialog} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Menu Pembelian</h1>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate("/app/purchases/new")}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-md shadow-blue-200 transition-all active:scale-95 text-sm"
          >
            <Plus size={18} /> Tambah Pembelian
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={parsingExcel}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-md shadow-emerald-200 transition-all active:scale-95 text-sm disabled:opacity-50"
          >
            {parsingExcel ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            ) : (
              <FileSpreadsheet size={18} />
            )}
            {parsingExcel ? "Membaca Excel..." : "Import Excel SAKTI"}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-xl">
              <Package size={24} />
            </div>
            <div>
              <div className="text-blue-100 text-sm">Total Nota</div>
              <div className="text-2xl font-bold">{totalItems}</div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-5 text-white shadow-lg shadow-green-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-xl">
              <DollarSign size={24} />
            </div>
            <div>
              <div className="text-green-100 text-sm">Total Nilai</div>
              <div className="text-2xl font-bold"> Rp {formatCurrency(totalValue)} </div>
            </div>
          </div>
        </div>
      </div>

      {/* Purchase List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Data Pembelian ATK</h2>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
            {purchases.length} Dokumen
          </span>
        </div>

        {purchases.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileText size={48} className="mx-auto mb-3 text-slate-200" />
            <p className="font-medium">Belum ada data pembelian</p>
            <p className="text-sm">
              Klik "Tambah Pembelian" atau "Import Excel SAKTI" untuk mulai input data
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">
                    No Nota
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">
                    Tanggal (Dok / Buku)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">
                    Vendor
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">
                    Item
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">
                    Total
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchases.map((purchase) => (
                  <tr
                    key={purchase.id}
                    onClick={() => navigate(`/app/purchases/${purchase.id}`)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-4 font-bold text-slate-800 text-sm">
                      {purchase.document_number}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">
                      <div className="font-medium text-slate-800">
                        {new Date(
                          purchase.document_date || purchase.purchase_date,
                        ).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                      <div className="text-xs text-blue-600 flex items-center gap-1 mt-0.5">
                        <span className="bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                          Buku:{" "}
                          {new Date(
                            purchase.book_date || purchase.purchase_date,
                          ).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">{purchase.vendor_name}</td>
                    <td className="px-4 py-4 text-sm text-slate-600 text-right">
                      {purchase.items.length} item
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="font-bold text-green-600">
                        Rp {formatCurrency(purchase.total_amount)}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={(e) => handleDelete(purchase.id!, e)}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Hapus Pembelian"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200">
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-slate-700 text-right">
                    TOTAL KESELURUHAN:
                  </td>
                  <td className="px-4 py-4 text-blue-600 text-right text-lg">
                    Rp {formatCurrency(totalValue)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL PRATINJAU IMPORT EXCEL SAKTI */}
      {/* ========================================================================= */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
                  <FileSpreadsheet size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">
                    Pratinjau Import Data Pembelian SAKTI
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Periksa pengelompokan nomor nota dan registrasi barang persediaan baru
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/30">
              {/* Summary Stats Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs text-slate-500 font-medium">Total Dokumen / Nota</div>
                  <div className="text-xl font-bold text-slate-800 mt-1">
                    {previewTotalNotas} Nota
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs text-slate-500 font-medium">Total Baris Barang</div>
                  <div className="text-xl font-bold text-blue-600 mt-1">
                    {previewTotalItemRows} Item
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs text-slate-500 font-medium">Barang Baru Terdeteksi</div>
                  <div className="text-xl font-bold text-amber-600 mt-1 flex items-center gap-1.5">
                    {newItemsList.length} Barang
                    {newItemsList.length > 0 && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                        Auto Register
                      </span>
                    )}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs text-slate-500 font-medium">Total Nilai Disetujui</div>
                  <div className="text-xl font-bold text-emerald-600 mt-1">
                    Rp {formatCurrency(previewTotalAmount)}
                  </div>
                </div>
              </div>

              {/* Duplicate Warning Checkbox if duplicates found */}
              {previewDuplicateCount > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                    <div>
                      <h4 className="text-sm font-bold text-amber-900">
                        {previewDuplicateCount} Dokumen sudah pernah diimport sebelumnya
                      </h4>
                      <p className="text-xs text-amber-700">
                        Nomor dokumen yang sama sudah ada di sistem SATRIA.
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-xl border border-amber-200 shadow-xs text-xs font-bold text-amber-900 shrink-0">
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(e) => setSkipDuplicates(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    Lewati Dokumen Duplikat
                  </label>
                </div>
              )}

              {/* Section 1: Detected New Items */}
              {newItemsList.length > 0 ? (
                <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-xs">
                  <div className="p-4 bg-amber-500/10 border-b border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="text-amber-600" size={18} />
                      <h4 className="font-bold text-slate-800 text-sm">
                        Barang Baru Terdeteksi ({newItemsList.length})
                      </h4>
                    </div>
                    <span className="text-xs text-amber-800 bg-amber-100 font-medium px-3 py-1 rounded-full">
                      Akan otomatis dimasukkan ke Master ATK & Saldo Awal (Qty: 0)
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-slate-500 mb-3">
                      Barang di bawah ini belum ada di Master ATK SATRIA. Sistem akan mendaftarkannya
                      secara otomatis. Silakan verifikasi/sesuaikan satuan jika diperlukan:
                    </p>
                    <div className="overflow-x-auto max-h-56">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-bold uppercase sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left">No</th>
                            <th className="px-3 py-2 text-left">Kode Barang SAKTI</th>
                            <th className="px-3 py-2 text-left">Nama Barang</th>
                            <th className="px-3 py-2 text-left w-40">Pilihan Satuan</th>
                            <th className="px-3 py-2 text-center">Status Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {newItemsList.map((item, idx) => (
                            <tr key={idx} className="hover:bg-amber-50/40">
                              <td className="px-3 py-2.5 text-slate-400 font-mono">{idx + 1}</td>
                              <td className="px-3 py-2.5 font-mono text-slate-700">
                                {item.item_code || "-"}
                              </td>
                              <td className="px-3 py-2.5 font-bold text-slate-800">{item.name}</td>
                              <td className="px-3 py-2.5">
                                <select
                                  value={item.unit}
                                  onChange={(e) => handleUnitChange(item.name, e.target.value)}
                                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:border-blue-500 focus:bg-white"
                                >
                                  {COMMON_UNITS.map((u) => (
                                    <option key={u} value={u}>
                                      {u}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  + Input Master & Saldo Awal (0)
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
                  <CheckCircle2 className="text-emerald-600" size={20} />
                  <div>
                    <h4 className="text-sm font-bold text-emerald-900">
                      Semua barang sudah terdaftar di Master ATK
                    </h4>
                    <p className="text-xs text-emerald-700">
                      Tidak ada barang baru yang perlu didaftarkan ke Master ATK.
                    </p>
                  </div>
                </div>
              )}

              {/* Section 2: Grouped Purchases Preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers size={18} className="text-blue-600" />
                    <h4 className="text-sm font-bold text-slate-800">
                      Rincian Dokumen Pembelian ({previewValidNotas} Dokumen Siap Import)
                    </h4>
                  </div>
                  <span className="text-xs text-slate-400">
                    Klik tiap dokumen untuk melihat rincian barang
                  </span>
                </div>

                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {parsedGroups.map((group, gIdx) => {
                    const isExpanded = !!expandedDocs[group.document_number];
                    const isSkipped = group.isDuplicate && skipDuplicates;

                    return (
                      <div
                        key={gIdx}
                        className={`bg-white rounded-2xl border transition-all ${
                          isSkipped
                            ? "border-slate-200 opacity-60 bg-slate-50"
                            : group.isDuplicate
                              ? "border-amber-300"
                              : "border-slate-200 hover:border-blue-300"
                        }`}
                      >
                        {/* Accordion Header */}
                        <div
                          onClick={() => toggleDocExpand(group.document_number)}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-1 text-slate-400 hover:text-slate-600">
                              {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800 text-sm">
                                  {group.document_number}
                                </span>
                                {group.isDuplicate ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                    {isSkipped ? "Dilewati (Duplikat)" : "Sudah Ada"}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    Nota Baru
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
                                <span>
                                  Tgl Dok:{" "}
                                  <strong className="text-slate-700">
                                    {group.document_date}
                                  </strong>
                                </span>
                                <span>
                                  Tgl Buku:{" "}
                                  <strong className="text-slate-700">{group.book_date}</strong>
                                </span>
                                <span>
                                  Vendor:{" "}
                                  <strong className="text-slate-700">{group.vendor_name}</strong>
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-6 pl-8 sm:pl-0">
                            <div className="text-right">
                              <span className="text-xs text-slate-500">
                                {group.items.length} item barang
                              </span>
                              <div className="text-sm font-bold text-emerald-600">
                                Rp {formatCurrency(group.total_amount)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Accordion Body */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-slate-100">
                            <div className="overflow-x-auto bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-slate-500 font-bold uppercase border-b border-slate-200 text-[10px]">
                                    <th className="px-3 py-2 text-left">No</th>
                                    <th className="px-3 py-2 text-left">Kode Barang</th>
                                    <th className="px-3 py-2 text-left">Nama Barang</th>
                                    <th className="px-3 py-2 text-right">Jumlah</th>
                                    <th className="px-3 py-2 text-left">Satuan</th>
                                    <th className="px-3 py-2 text-right">Harga Satuan</th>
                                    <th className="px-3 py-2 text-right">Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {group.items.map((item, iIdx) => (
                                    <tr key={iIdx} className="hover:bg-white">
                                      <td className="px-3 py-2 text-slate-400 font-mono">
                                        {iIdx + 1}
                                      </td>
                                      <td className="px-3 py-2 font-mono text-slate-500">
                                        {item.item_code || "-"}
                                      </td>
                                      <td className="px-3 py-2 font-bold text-slate-700">
                                        {item.item_name}
                                        {item.isNewItem && (
                                          <span className="ml-2 text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                            Baru
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right font-medium text-slate-800">
                                        {item.quantity}
                                      </td>
                                      <td className="px-3 py-2 text-slate-600 font-medium">
                                        {item.unit}
                                      </td>
                                      <td className="px-3 py-2 text-right text-slate-600 font-mono">
                                        Rp {formatCurrency(item.unit_price)}
                                      </td>
                                      <td className="px-3 py-2 text-right font-bold text-slate-800 font-mono">
                                        Rp {formatCurrency(item.total)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer Action */}
            <div className="p-5 border-t border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500">
                {isSavingImport ? (
                  <span className="text-blue-600 font-bold flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
                    {saveProgress || "Sedang memproses import..."}
                  </span>
                ) : (
                  <span>
                    Nota fisik (PDF / Foto) bersifat{" "}
                    <strong className="text-slate-700">opsional</strong> dan dapat diunggah kemudian
                    di menu rincian pembelian.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  disabled={isSavingImport}
                  onClick={() => setShowPreviewModal(false)}
                  className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  Batal
                </button>

                <button
                  type="button"
                  disabled={isSavingImport || previewValidNotas === 0}
                  onClick={handleApproveImport}
                  className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSavingImport ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  ) : (
                    <UploadCloud size={18} />
                  )}
                  {isSavingImport
                    ? "Menyimpan Import..."
                    : `Setujui & Simpan (${previewValidNotas} Nota)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
