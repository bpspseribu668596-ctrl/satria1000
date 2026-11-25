/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { db, type Request, type User, type Settings, type ATKItem } from "../lib/db";
import { useDialog } from "../hooks/useDialog";
import Dialog from "../components/Dialog";
import {
  MessageSquare,
  Trash2,
  Archive,
  Calendar,
  AlertCircle,
  X,
  Download,
  Loader2,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChevronDown,
  ChevronRight,
  PenTool,
  Check,
  FileCheck,
  ShieldAlert,
  Printer,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { downloadRequestsZip } from "../lib/pdfZipExport";
import * as XLSX from "xlsx";
import SignatureCanvas from "react-signature-canvas";

interface ParsedImportItem {
  item_code: string;
  item_name: string;
  quantity: number;
  unit: string;
  current_stock: number;
  is_deficit: boolean;
}

interface ParsedImportDoc {
  document_number: string;
  document_date: string;
  book_date: string;
  username: string;
  user_id: number;
  user_name: string;
  user_nip: string;
  work_unit: string;
  signature: string | null;
  is_duplicate: boolean;
  has_invalid_user: boolean;
  items: ParsedImportItem[];
  has_deficit: boolean;
}

interface StockAnalysisItem {
  item_code: string;
  item_name: string;
  unit: string;
  current_stock: number;
  total_requested: number;
  remaining_stock: number;
  is_deficit: boolean;
}

interface UniqueRequester {
  user_id: number;
  username: string;
  name: string;
  nip: string;
  work_unit: string;
  signature: string | null;
  total_docs: number;
}

function parseExcelDate(val: any): string {
  if (!val) return new Date().toISOString().split("T")[0];
  if (typeof val === "number") {
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
    const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    }
    const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (ymd) {
      return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
    }
  }
  return new Date().toISOString().split("T")[0];
}

const formatNumber = (num: number) => {
  return new Intl.NumberFormat("id-ID").format(num);
};

export default function AllRequests() {
  const { user } = useAuth();
  const { dialogState, closeDialog, alert } = useDialog();

  // Operator hanya lihat permintaan yang sudah approved (read-only)
  const isOperatorOnly =
    user?.role?.length === 1 && user.role[0] === "operator"
    || (user?.role?.includes("operator") && !user.role.some((r: string) => ["admin", "verifikator", "penanggungjawab"].includes(r)));

  const [requests, setRequests] = useState<Request[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [atkItems, setAtkItems] = useState<ATKItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // SAKTI Register Export States
  const [showSaktiModal, setShowSaktiModal] = useState(false);
  const [showSaktiPrintView, setShowSaktiPrintView] = useState(false);
  const [saktiStatusFilter, setSaktiStatusFilter] = useState<"approved" | "all">("approved");
  const [saktiDateRangeType, setSaktiDateRangeType] = useState<"all" | "range">("all");
  const [saktiStartDate, setSaktiStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [saktiEndDate, setSaktiEndDate] = useState(`${new Date().getFullYear()}-12-31`);

  // ZIP Export Modal states
  const [showZipModal, setShowZipModal] = useState(false);
  const currentYear = new Date().getFullYear();
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-06-30`);
  const [statusFilter, setStatusFilter] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({
    current: 0,
    total: 0,
    currentName: "",
    percent: 0,
  });
  const [exportError, setExportError] = useState<string | null>(null);

  // Import Excel States
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sigFileInputRef = useRef<HTMLInputElement>(null);
  const modalSigCanvasRef = useRef<SignatureCanvas>(null);

  const [parsingExcel, setParsingExcel] = useState(false);
  const [showImportPreviewModal, setShowImportPreviewModal] = useState(false);
  const [isSavingImport, setIsSavingImport] = useState(false);
  const [saveImportProgress, setSaveImportProgress] = useState("");

  const [parsedImportDocs, setParsedImportDocs] = useState<ParsedImportDoc[]>([]);
  const [stockAnalysisItems, setStockAnalysisItems] = useState<StockAnalysisItem[]>([]);
  const [uniqueRequesters, setUniqueRequesters] = useState<UniqueRequester[]>([]);
  const [hasStockDeficit, setHasStockDeficit] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [expandedDocs, setExpandedDocs] = useState<Record<string, boolean>>({});
  const [showAllStockAnalysis, setShowAllStockAnalysis] = useState(false);

  // Signature Pad Modal
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [activeSignUser, setActiveSignUser] = useState<UniqueRequester | null>(null);
  const [targetUploadUserId, setTargetUploadUserId] = useState<number | null>(null);

  const loadData = async () => {
    try {
      let reqs = await db.requests.orderBy("created_at").reverse().toArray();

      // Operator hanya melihat permintaan yang sudah disetujui
      if (isOperatorOnly) {
        reqs = reqs.filter((r: { status: string; }) => r.status === "approved");
      }

      const [usrs, sett, items] = await Promise.all([
        db.users.toArray(),
        db.settings.get(1),
        db.atk_items.toArray(),
      ]);
      setRequests(reqs || []);
      setUsers(usrs || []);
      setSettings(sett || null);
      setAtkItems(items || []);
    } catch (err) {
      console.error("Gagal memuat semua permintaan:", err);
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
        `Status: ${statusLabels[req.status]}`
    );
    window.open(
      `https://wa.me/${settings.whatsapp_number}?text=${message}`,
      "_blank"
    );
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await db.requests.delete(deleteId);
      setRequests(requests.filter((r) => r.id !== deleteId));
      setDeleteId(null);
      await alert("Permintaan berhasil dihapus");
    } catch (err) {
      await alert("Gagal menghapus: " + (err as Error).message);
    }
  };

  const canManage =
    !isOperatorOnly &&
    (user?.role?.includes("admin") ||
    user?.role?.includes("verifikator") ||
    user?.role?.includes("penanggungjawab"));

  const statusLabels: Record<string, string> = {
    pending_verification: "Menunggu Verifikasi",
    verified: "Terverifikasi",
    approved: "Disetujui",
    rejected: "Ditolak",
    revision_requested: "Perlu Revisi",
  };

  const statusStyles: Record<string, string> = {
    pending_verification: "bg-yellow-100 text-yellow-700",
    verified: "bg-blue-100 text-blue-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    revision_requested: "bg-orange-100 text-orange-700",
  };

  const getDocBookDate = (r: Request) => (r.book_date || r.submission_date || r.document_date || "").slice(0, 10);

  const filteredExportRequests = requests.filter((r) => {
    const d = getDocBookDate(r);
    if (!d) return false;
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  // Helper to format date as DD-MM-YYYY (matching SAKTI)
  const formatSaktiDate = (dStr: string) => {
    if (!dStr || dStr === "-") return "-";
    const clean = dStr.split("T")[0];
    const parts = clean.split("-");
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dStr;
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

  interface SaktiItemRow {
    docNumber: string;
    docDate: string;
    bookDate: string;
    itemCode: string;
    itemName: string;
    qty: number;
    requesterName: string;
    status: string;
  }

  // SAKTI Transactions list (flattened per item)
  const saktiTransactions = useMemo<SaktiItemRow[]>(() => {
    const list = requests.filter((r) => {
      // 1. Status Filter
      if (saktiStatusFilter === "approved" && r.status !== "approved") {
        return false;
      }
      // 2. Date Range Filter
      if (saktiDateRangeType === "range") {
        const d = r.book_date || r.submission_date || r.document_date;
        if (d) {
          const dStr = d.split("T")[0];
          if (dStr < saktiStartDate || dStr > saktiEndDate) {
            return false;
          }
        }
      }
      return true;
    });

    // Sort by Document Number
    list.sort((a, b) =>
      (a.document_number || "").localeCompare(
        b.document_number || "",
        undefined,
        { numeric: true, sensitivity: "base" }
      )
    );

    const rows: SaktiItemRow[] = [];
    for (const req of list) {
      const requester = users.find((u) => u.id === req.requester_id);
      const requesterName = requester?.name || req.requester_notes || "Pegawai";

      const docDate = req.document_date || req.submission_date || "";
      const bookDate = req.book_date || req.submission_date || docDate;

      for (const it of req.items || []) {
        const matched = atkItems.find(
          (ai) => ai.name.toLowerCase() === it.name.toLowerCase()
        );
        const itemCode = matched?.item_code || "-";

        rows.push({
          docNumber: req.document_number,
          docDate: docDate ? docDate.split("T")[0] : "-",
          bookDate: bookDate ? bookDate.split("T")[0] : "-",
          itemCode,
          itemName: it.name,
          qty: Number(it.quantity) || 0,
          requesterName,
          status: req.status,
        });
      }
    }

    return rows;
  }, [
    requests,
    users,
    atkItems,
    saktiStatusFilter,
    saktiDateRangeType,
    saktiStartDate,
    saktiEndDate,
  ]);

  const totalSaktiQty = useMemo<number>(() => {
    return saktiTransactions.reduce((acc: number, r: SaktiItemRow) => acc + r.qty, 0);
  }, [saktiTransactions]);

  const uniqueSaktiDocsCount = useMemo<number>(() => {
    return new Set(saktiTransactions.map((r: SaktiItemRow) => r.docNumber)).size;
  }, [saktiTransactions]);

  const handleExportSaktiExcel = async () => {
    if (saktiTransactions.length === 0) {
      await alert("Tidak ada transaksi permintaan untuk diekspor.");
      return;
    }

    const today = new Date();
    const todayFormatted = `${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}-${today.getFullYear()}`;

    const data: (string | number)[][] = [
      ["UNTUK PERIODE TAHUN 2026"],
      ["REGISTER TRANSAKSI HARIAN"],
      ["PERSEDIAAN KELUAR (HABIS PAKAI)"],
      ["KODE UAKPB : 054.01.0100.539164.000.KD"],
      ["UAKPB : BADAN PUSAT STATISTIK KEPULAUAN SERIBU"],
      [`Tanggal : ${todayFormatted}`],
      [""],
      [
        "NOMOR DOKUMEN",
        "TGL DOK",
        "TGL BUKU",
        "KODE BARANG",
        "NAMA BARANG",
        "JUMLAH",
        "KETERANGAN",
      ],
    ];

    for (const row of saktiTransactions) {
      data.push([
        row.docNumber,
        formatSaktiDate(row.docDate),
        formatSaktiDate(row.bookDate),
        row.itemCode,
        row.itemName,
        row.qty,
        row.requesterName,
      ]);
    }

    data.push([
      "",
      "",
      "",
      "",
      "TOTAL KELUAR",
      totalSaktiQty,
      "",
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);

    ws["!cols"] = [
      { wch: 32 },
      { wch: 14 },
      { wch: 14 },
      { wch: 28 },
      { wch: 45 },
      { wch: 12 },
      { wch: 35 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Register Keluar SAKTI");
    XLSX.writeFile(
      wb,
      `Register_Persediaan_Keluar_SAKTI_${todayFormatted.replace(/-/g, "")}.xlsx`
    );
  };

  const handleStartExport = async () => {
    if (filteredExportRequests.length === 0) {
      await alert("Tidak ada dokumen yang memenuhi kriteria tanggal yang dipilih.");
      return;
    }
    setIsExporting(true);
    setExportError(null);
    setExportProgress({ current: 0, total: filteredExportRequests.length, currentName: "Mempersiapkan dokumen...", percent: 0 });

    try {
      await downloadRequestsZip(
        filteredExportRequests,
        users,
        settings,
        startDate,
        endDate,
        (current, total, currentName) => {
          const percent = Math.round((current / total) * 100);
          setExportProgress({ current, total, currentName, percent });
        }
      );
      setTimeout(() => {
        setIsExporting(false);
        setShowZipModal(false);
      }, 1200);
    } catch (err: any) {
      console.error("Export ZIP failed:", err);
      setExportError(err.message || "Gagal membuat file ZIP.");
      setIsExporting(false);
    }
  };

  // =========================================================================
  // DOWNLOAD EXCEL TEMPLATE (2 SHEETS)
  // =========================================================================
  const handleDownloadTemplate = async () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Format Permintaan
      const sampleRows = [
        {
          "No Dokumen": "034/ATK/07/2026",
          "TGL DOK": "2026-07-01",
          "TGL BUKU": "2026-07-08",
          "KODE BARANG": "1.01.03.99.999.000604",
          "NAMA BARANG": "Kuesioner SE2026-L",
          "JUMLAH": 1200,
          "Username Pemohon": "yogi.yahya",
        },
        {
          "No Dokumen": "034/ATK/07/2026",
          "TGL DOK": "2026-07-01",
          "TGL BUKU": "2026-07-08",
          "KODE BARANG": "1.01.03.99.999.000605",
          "NAMA BARANG": "Kuesioner SE2026-L.UB",
          "JUMLAH": 600,
          "Username Pemohon": "yogi.yahya",
        },
        {
          "No Dokumen": "035/ATK/07/2026",
          "TGL DOK": "2026-07-01",
          "TGL BUKU": "2026-07-01",
          "KODE BARANG": "1.01.03.99.999.000603",
          "NAMA BARANG": "Plakat",
          "JUMLAH": 12,
          "Username Pemohon": "hendirawan",
        },
      ];
      const ws1 = XLSX.utils.json_to_sheet(sampleRows);
      XLSX.utils.book_append_sheet(wb, ws1, "Format Permintaan");

      // Sheet 2: Data Username SATRIA
      const userData = users.map((u) => ({
        NIP: u.nip || "",
        NAMA: u.name || "",
        ROLE: Array.isArray(u.role) ? u.role.join(", ") : u.role || "",
        "UNIT KERJA": u.work_unit || "",
        USERNAME: u.username || "",
      }));
      const ws2 = XLSX.utils.json_to_sheet(userData);
      XLSX.utils.book_append_sheet(wb, ws2, "Data Username");

      XLSX.writeFile(wb, "Format_Import_Permintaan_ATK.xlsx");
    } catch (err: any) {
      await alert("Gagal mengunduh format Excel: " + err.message);
    }
  };

  // =========================================================================
  // HANDLE EXCEL IMPORT & PARSING (HARD STOCK VALIDATION + TTD CHECK)
  // =========================================================================
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

      // Fetch all sources for stock calculation & signatures
      const [
        existingRequests,
        existingUsers,
        masterItems,
        initialBalances,
        purchaseItems,
        transferMasukItems,
        transferKeluarItems,
      ] = await Promise.all([
        db.requests.toArray(),
        db.users.toArray(),
        db.atk_items.toArray(),
        db.initial_balances.where("year").equals(new Date().getFullYear()).toArray(),
        db.purchase_items.toArray(),
        db.transfer_masuk_items.toArray(),
        db.transfer_keluar_items.toArray(),
      ]);

      // 1. Build Available Stock Map
      const stockMap = new Map<string, number>();
      const addStock = (name: string, qty: any) => {
        if (!name) return;
        const k = name.trim().toLowerCase();
        stockMap.set(k, (stockMap.get(k) || 0) + (Number(qty) || 0));
      };
      const subStock = (name: string, qty: any) => {
        if (!name) return;
        const k = name.trim().toLowerCase();
        stockMap.set(k, (stockMap.get(k) || 0) - (Number(qty) || 0));
      };

      initialBalances.forEach((b: any) => addStock(b.item_name, b.quantity));
      purchaseItems.forEach((p: any) => addStock(p.item_name, p.quantity));
      transferMasukItems.forEach((t: any) => addStock(t.item_name, t.quantity));
      transferKeluarItems.forEach((t: any) => subStock(t.item_name, t.quantity));
      existingRequests
        .filter((r: Request) => r.status === "approved")
        .forEach((r: Request) => {
          (r.items || []).forEach((it: any) => subStock(it.name, it.quantity));
        });

      // Item Master Catalog Maps
      const masterByCode = new Map<string, ATKItem>();
      const masterByName = new Map<string, ATKItem>();
      masterItems.forEach((m: ATKItem) => {
        if (m.item_code) masterByCode.set(m.item_code.trim().toLowerCase(), m);
        if (m.name) masterByName.set(m.name.trim().toLowerCase(), m);
      });

      // 2. Harvest Existing Signatures (from profile and historical requests)
      const sigMap = new Map<number, string>();
      existingUsers.forEach((u: User) => {
        if (u.id && u.signature && typeof u.signature === "string" && u.signature.startsWith("data:image")) {
          sigMap.set(u.id, u.signature);
        }
      });
      existingRequests.forEach((r: Request) => {
        if (r.requester_id && r.requester_signature && !sigMap.has(r.requester_id)) {
          sigMap.set(r.requester_id, r.requester_signature);
        }
      });

      // User lookup map by username
      const userByUsername = new Map<string, User>();
      existingUsers.forEach((u: User) => {
        if (u.username) userByUsername.set(u.username.trim().toLowerCase(), u);
      });

      // Existing doc numbers
      const existingDocNumbers = new Set(
        existingRequests.map((r: Request) => (r.document_number || "").trim().toLowerCase())
      );

      // 3. First pass: group by No Dokumen & find document username
      const rawGroups = new Map<string, any[]>();
      for (const row of rawRows) {
        const rawDocNum =
          row["No Dokumen"] ||
          row["NO DOKUMEN"] ||
          row["Nomor Dokumen"] ||
          row["NOMOR DOKUMEN"] ||
          "";
        const docNum = String(rawDocNum).trim();
        if (!docNum) continue;

        if (!rawGroups.has(docNum)) {
          rawGroups.set(docNum, []);
        }
        rawGroups.get(docNum)!.push(row);
      }

      if (rawGroups.size === 0) {
        await alert("Tidak ada nomor dokumen yang dapat diproses dari file Excel.");
        return;
      }

      // 4. Second pass: Parse each group into ParsedImportDoc
      const parsedDocs: ParsedImportDoc[] = [];

      rawGroups.forEach((rows, docNum) => {
        // Resolve username: look for any non-blank username in this document's rows
        let docUsername = "";
        for (const r of rows) {
          const uStr = String(r["Username Pemohon"] || r["USERNAME"] || r["Username"] || "").trim();
          if (uStr) {
            docUsername = uStr;
            break;
          }
        }

        const matchedUser = docUsername ? userByUsername.get(docUsername.toLowerCase()) : undefined;
        const hasInvalidUser = !matchedUser;

        const firstRow = rows[0];
        const docDate = parseExcelDate(firstRow["TGL DOK"] || firstRow["Tgl Dok"] || firstRow["TANGGAL DOKUMEN"]);
        const bookDate = parseExcelDate(firstRow["TGL BUKU"] || firstRow["Tgl Buku"] || firstRow["TANGGAL BUKU"] || docDate);

        const items: ParsedImportItem[] = [];

        for (const r of rows) {
          const rawName = String(r["NAMA BARANG"] || r["Nama Barang"] || r["NAMA ITEM"] || "").trim();
          if (!rawName) continue;

          const rawCode = String(r["KODE BARANG"] || r["Kode Barang"] || "").trim();
          const rawQty = r["JUMLAH"] ?? r["Jumlah"] ?? r["QTY"] ?? 0;
          const qty = typeof rawQty === "number" ? rawQty : parseFloat(String(rawQty).replace(/,/g, "")) || 0;

          // Lookup master item by code or name
          let master = rawCode ? masterByCode.get(rawCode.toLowerCase()) : undefined;
          if (!master) master = masterByName.get(rawName.toLowerCase());

          const finalName = master ? master.name : rawName;
          const finalCode = master ? master.item_code : rawCode;
          const finalUnit = master ? master.unit : "pcs";

          const currentStock = stockMap.get(finalName.toLowerCase()) ?? 0;

          items.push({
            item_code: finalCode,
            item_name: finalName,
            quantity: qty,
            unit: finalUnit,
            current_stock: currentStock,
            is_deficit: false, // will be evaluated against total aggregated requested
          });
        }

        const isDuplicate = existingDocNumbers.has(docNum.toLowerCase());
        const userSig = matchedUser ? sigMap.get(matchedUser.id!) || null : null;

        parsedDocs.push({
          document_number: docNum,
          document_date: docDate,
          book_date: bookDate,
          username: docUsername,
          user_id: matchedUser?.id || 0,
          user_name: matchedUser?.name || (docUsername ? `User (${docUsername}) Tidak Ditemukan` : "Tanpa Username"),
          user_nip: matchedUser?.nip || "",
          work_unit: matchedUser?.work_unit || "",
          signature: userSig,
          is_duplicate: isDuplicate,
          has_invalid_user: hasInvalidUser,
          items: items,
          has_deficit: false,
        });
      });

      // 5. Aggregate Stock Analysis (NO MINUS POLICY)
      // Group total requested quantities across all items to check if remaining stock goes below 0
      const totalRequestedPerItem = new Map<string, { code: string; name: string; unit: string; requested: number }>();

      parsedDocs.forEach((doc) => {
        // If doc is duplicate, we still analyze it or skip according to default
        doc.items.forEach((it) => {
          const k = it.item_name.toLowerCase();
          const existing = totalRequestedPerItem.get(k);
          if (!existing) {
            totalRequestedPerItem.set(k, {
              code: it.item_code,
              name: it.item_name,
              unit: it.unit,
              requested: it.quantity,
            });
          } else {
            existing.requested += it.quantity;
          }
        });
      });

      const analysisList: StockAnalysisItem[] = [];
      const deficitItemNames = new Set<string>();

      totalRequestedPerItem.forEach((val, k) => {
        const curStock = stockMap.get(k) || 0;
        const remaining = curStock - val.requested;
        const isDeficit = remaining < 0;

        if (isDeficit) {
          deficitItemNames.add(k);
        }

        analysisList.push({
          item_code: val.code,
          item_name: val.name,
          unit: val.unit,
          current_stock: curStock,
          total_requested: val.requested,
          remaining_stock: remaining,
          is_deficit: isDeficit,
        });
      });

      // Sort analysisList: deficit items first, then alphabetical
      analysisList.sort((a, b) => {
        if (a.is_deficit && !b.is_deficit) return -1;
        if (!a.is_deficit && b.is_deficit) return 1;
        return a.item_name.localeCompare(b.item_name);
      });

      // Update deficit flag on each item & document
      parsedDocs.forEach((doc) => {
        let docHasDeficit = false;
        doc.items.forEach((it) => {
          const isDeficit = deficitItemNames.has(it.item_name.toLowerCase());
          it.is_deficit = isDeficit;
          if (isDeficit) docHasDeficit = true;
        });
        doc.has_deficit = docHasDeficit;
      });

      // 6. Aggregate Unique Requesters with Signature Status
      const requestersMap = new Map<string, UniqueRequester>();
      parsedDocs.forEach((doc) => {
        if (!doc.username || doc.has_invalid_user) return;
        const key = doc.username.toLowerCase();
        if (!requestersMap.has(key)) {
          requestersMap.set(key, {
            user_id: doc.user_id,
            username: doc.username,
            name: doc.user_name,
            nip: doc.user_nip,
            work_unit: doc.work_unit,
            signature: doc.signature,
            total_docs: 1,
          });
        } else {
          requestersMap.get(key)!.total_docs += 1;
        }
      });

      const uniqueList = Array.from(requestersMap.values());
      const hasDeficit = deficitItemNames.size > 0;

      setParsedImportDocs(parsedDocs);
      setStockAnalysisItems(analysisList);
      setUniqueRequesters(uniqueList);
      setHasStockDeficit(hasDeficit);
      if (parsedDocs.length > 0) {
        setExpandedDocs({ [parsedDocs[0].document_number]: true });
      }

      setShowImportPreviewModal(true);
    } catch (err: any) {
      console.error("Excel parse error:", err);
      await alert("Gagal membaca file Excel: " + err.message);
    } finally {
      setParsingExcel(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Toggle Accordion
  const toggleDocExpand = (docNum: string) => {
    setExpandedDocs((prev) => ({
      ...prev,
      [docNum]: !prev[docNum],
    }));
  };

  // =========================================================================
  // SIGNATURE ATTACHMENT HANDLERS (MODAL CANVAS / FILE UPLOAD) & COMPRESSION
  // =========================================================================
  const compressImageToDataUrl = (dataUrlOrFile: string | File, maxWidth = 350, maxHeight = 160): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(typeof dataUrlOrFile === "string" ? dataUrlOrFile : "");
          return;
        }

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Remove white/light backgrounds (from paper or jpeg) to guarantee transparent PNG signature
        try {
          const imgData = ctx.getImageData(0, 0, width, height);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            const a = d[i + 3];
            if (a > 0) {
              if (r > 215 && g > 215 && b > 215) {
                d[i + 3] = 0;
              } else if (r > 190 && g > 190 && b > 190) {
                const brightness = (r + g + b) / 3;
                const alphaFactor = (215 - brightness) / 25;
                d[i + 3] = Math.round(a * Math.max(0, Math.min(1, alphaFactor)));
              }
            }
          }
          ctx.putImageData(imgData, 0, 0);
        } catch {
          // Fallback if getImageData is restricted (e.g. CORS)
        }

        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => {
        resolve(typeof dataUrlOrFile === "string" ? dataUrlOrFile : "");
      };

      if (typeof dataUrlOrFile === "string") {
        img.src = dataUrlOrFile;
      } else {
        const r = new FileReader();
        r.onload = (ev) => {
          img.src = ev.target?.result as string;
        };
        r.readAsDataURL(dataUrlOrFile);
      }
    });
  };

  const openSignatureModal = (requester: UniqueRequester) => {
    setActiveSignUser(requester);
    setShowSignatureModal(true);
  };

  const saveDrawnSignature = async () => {
    if (!activeSignUser || !modalSigCanvasRef.current) return;
    if (modalSigCanvasRef.current.isEmpty()) {
      await alert("Silakan bubuhkan tanda tangan pada kanvas terlebih dahulu");
      return;
    }

    const rawSig = modalSigCanvasRef.current.toDataURL();
    const compressedSig = await compressImageToDataUrl(rawSig);
    applySignatureToUser(activeSignUser.user_id, compressedSig);
    setShowSignatureModal(false);
    setActiveSignUser(null);
  };

  const triggerUploadSignature = (userId: number) => {
    setTargetUploadUserId(userId);
    sigFileInputRef.current?.click();
  };

  const handleSignatureFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const uid = targetUploadUserId;
    if (!file || uid === null) return;

    try {
      const compressedBase64 = await compressImageToDataUrl(file);
      applySignatureToUser(uid, compressedBase64);
    } catch (err: any) {
      console.error("Signature compression error:", err);
    } finally {
      if (sigFileInputRef.current) sigFileInputRef.current.value = "";
      setTargetUploadUserId(null);
    }
  };

  const applySignatureToUser = (userId: number, sigDataUrl: string) => {
    // 1. Update uniqueRequesters
    setUniqueRequesters((prev) =>
      prev.map((u) => (u.user_id === userId ? { ...u, signature: sigDataUrl } : u))
    );
    // 2. Update all documents of this user
    setParsedImportDocs((prev) =>
      prev.map((doc) => (doc.user_id === userId ? { ...doc, signature: sigDataUrl } : doc))
    );
  };

  // =========================================================================
  // EXECUTE IMPORT (APPROVE & SIMPAN KE DB.REQUESTS)
  // =========================================================================
  const handleApproveImport = async () => {
    if (hasStockDeficit) {
      await alert("⛔ Import tidak dapat disetujui karena stok tidak mencukupi (akan menyebabkan saldo minus).");
      return;
    }

    const validDocs = skipDuplicates
      ? parsedImportDocs.filter((d) => !d.is_duplicate)
      : parsedImportDocs;

    const invalidUserDocs = validDocs.filter((d) => d.has_invalid_user);
    if (invalidUserDocs.length > 0) {
      await alert(`Terdapat ${invalidUserDocs.length} dokumen dengan username yang tidak terdaftar di SATRIA. Perbaiki username terlebih dahulu.`);
      return;
    }

    if (validDocs.length === 0) {
      await alert("Semua dokumen dalam file Excel sudah terdaftar di sistem (duplikat). Tidak ada dokumen baru untuk disimpan.");
      return;
    }

    setIsSavingImport(true);
    try {
      // 1. Persist new signatures to db.users profile with small throttle
      setSaveImportProgress("Memperbarui tanda tangan pengguna...");
      for (const reqUser of uniqueRequesters) {
        if (reqUser.signature && reqUser.user_id) {
          const compressed = await compressImageToDataUrl(reqUser.signature);
          await db.users.update(reqUser.user_id, { signature: compressed }).catch(() => {});
          await new Promise((r) => setTimeout(r, 80));
        }
      }

      // 2. Prepare request records with compressed signatures
      const city = settings?.city || "BPS";
      const now = new Date().toISOString();

      setSaveImportProgress("Mengoptimasi ukuran dokumen...");
      const allRecords: any[] = [];
      for (const doc of validDocs) {
        let finalSig = doc.signature;
        if (finalSig && finalSig.length > 50000) {
          finalSig = await compressImageToDataUrl(finalSig);
        }

        allRecords.push({
          document_number: doc.document_number,
          requester_id: doc.user_id,
          items: doc.items.map((it) => ({
            name: it.item_name,
            quantity: it.quantity,
            unit: it.unit,
          })),
          status: "pending_verification",
          submission_date: doc.document_date,
          document_date: doc.document_date,
          book_date: doc.book_date,
          submission_location: city,
          fungsi_bagian: doc.work_unit || null,
          requester_signature: finalSig || null,
          requester_notes: `${doc.user_name}${doc.user_nip ? ` (${doc.user_nip})` : ""}`,
          created_at: now,
          updated_at: now,
        });
      }

      // 3. Insert each record safely with progress indicator and throttle
      let savedCount = 0;
      let failedCount = 0;
      const failedList: string[] = [];

      for (let i = 0; i < allRecords.length; i++) {
        const record = allRecords[i];
        setSaveImportProgress(
          `Menyimpan dokumen ${i + 1} dari ${allRecords.length} (${record.document_number})...`
        );

        try {
          await db.requests.add(record);
          savedCount++;
        } catch (itemErr: any) {
          console.error(`Gagal menyimpan ${record.document_number}:`, itemErr);
          failedCount++;
          failedList.push(record.document_number);
        }

        // 120ms throttle between documents: avoids 413 & avoids F5 WAF limits
        await new Promise((r) => setTimeout(r, 120));
      }

      if (failedCount > 0) {
        await alert(
          `Selesai: ${savedCount} dokumen berhasil disimpan.\n(${failedCount} dokumen gagal: ${failedList.slice(0, 5).join(", ")}${failedList.length > 5 ? "..." : ""})`
        );
      } else {
        await alert(`Sukses! Berhasil mengimpor seluruh ${savedCount} dokumen permintaan ATK ke SATRIA dengan status 'Menunggu Verifikasi'.`);
      }

      setShowImportPreviewModal(false);
      setParsedImportDocs([]);
      setStockAnalysisItems([]);
      setUniqueRequesters([]);
      await loadData();
    } catch (err: any) {
      console.error("Save import error:", err);
      await alert("Gagal menyimpan import: " + err.message);
    } finally {
      setIsSavingImport(false);
      setSaveImportProgress("");
    }
  };

  // Preview stats
  const previewTotalDocs = parsedImportDocs.length;
  const previewValidDocs = skipDuplicates
    ? parsedImportDocs.filter((d) => !d.is_duplicate).length
    : parsedImportDocs.length;
  const previewDuplicateCount = parsedImportDocs.filter((d) => d.is_duplicate).length;
  const previewTotalItems = parsedImportDocs.reduce((sum, d) => sum + d.items.length, 0);
  const deficitItemsCount = stockAnalysisItems.filter((i) => i.is_deficit).length;

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
          <h1 className="text-2xl font-bold text-slate-800">Semua Permintaan</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar seluruh formulir pengajuan ATK pegawai
          </p>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Download Template Button */}
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-bold shadow-xs transition-all text-xs active:scale-95 cursor-pointer"
              title="Unduh Format Excel 2 Sheet (Format & Data Username)"
            >
              <Download size={15} />
              <span>Format Excel</span>
            </button>

            {/* Import Excel Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={parsingExcel}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md shadow-emerald-500/20 transition-all text-xs active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {parsingExcel ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={15} />
              )}
              <span>{parsingExcel ? "Membaca..." : "Import Permintaan Excel"}</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Hidden input for signature upload */}
            <input
              ref={sigFileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg"
              onChange={handleSignatureFileUpload}
              className="hidden"
            />

            {/* Rekap Transaksi SAKTI Button */}
            <button
              onClick={() => setShowSaktiModal(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold shadow-md shadow-emerald-500/20 transition-all text-xs active:scale-95 cursor-pointer"
            >
              <FileSpreadsheet size={15} />
              <span>Rekap Transaksi SAKTI</span>
            </button>

            {/* Download ZIP Button */}
            <button
              onClick={() => {
                setExportError(null);
                setShowZipModal(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold shadow-md shadow-blue-500/20 transition-all text-xs active:scale-95 cursor-pointer"
            >
              <Archive size={15} />
              <span>Download ZIP PDF</span>
            </button>
          </div>
        )}
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
                <th className="px-5 py-3 text-center text-xs font-semibold text-slate-600 uppercase">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500 text-sm">
                    Belum ada pengajuan ATK
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
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          statusStyles[req.status] || "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {statusLabels[req.status] || req.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {settings?.whatsapp_number && (
                          <button
                            onClick={(e) => sendWhatsApp(req, e)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Kirim Pesan WhatsApp"
                          >
                            <MessageSquare size={16} />
                          </button>
                        )}
                        {canManage && (
                          <button
                            onClick={() => setDeleteId(req.id!)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Hapus Permintaan"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL PRATINJAU IMPORT EXCEL PERMINTAAN ATK */}
      {/* ========================================================================= */}
      {showImportPreviewModal && (
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
                    Pratinjau Import Permintaan ATK
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Validasi ketersediaan stok sistem & kelengkapan tanda tangan digital pemohon
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowImportPreviewModal(false)}
                className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/30">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs text-slate-500 font-medium">Total Dokumen</div>
                  <div className="text-xl font-bold text-slate-800 mt-1">
                    {previewTotalDocs} Dokumen
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs text-slate-500 font-medium">Total Baris Barang</div>
                  <div className="text-xl font-bold text-blue-600 mt-1">
                    {previewTotalItems} Item
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs text-slate-500 font-medium">Pemohon Terlibat</div>
                  <div className="text-xl font-bold text-purple-600 mt-1">
                    {uniqueRequesters.length} Pegawai
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs text-slate-500 font-medium">Validasi Stok Sistem</div>
                  <div className="mt-1">
                    {hasStockDeficit ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                        <AlertTriangle size={14} /> {deficitItemsCount} Barang Minus
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 size={14} /> Stok Cukup (Aman)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Duplicates Alert Bar */}
              {previewDuplicateCount > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                    <div>
                      <h4 className="text-sm font-bold text-amber-900">
                        {previewDuplicateCount} Dokumen sudah ada di database SATRIA
                      </h4>
                      <p className="text-xs text-amber-700">
                        Nomor dokumen yang sama sudah terdaftar sebelumnya.
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

              {/* ========================================================================= */}
              {/* SEKSI 1: ANALISA VALIDASI STOK (NO MINUS POLICY - STRICT BLOCK) */}
              {/* ========================================================================= */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div
                  className={`p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                    hasStockDeficit
                      ? "bg-red-500/10 border-red-200"
                      : "bg-emerald-500/10 border-emerald-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {hasStockDeficit ? (
                      <AlertTriangle className="text-red-600 shrink-0" size={20} />
                    ) : (
                      <CheckCircle2 className="text-emerald-600 shrink-0" size={20} />
                    )}
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">
                        {hasStockDeficit
                          ? `⛔ Validasi Stok Gagal: Terdeteksi ${deficitItemsCount} Barang Defisit / Minus`
                          : "✓ Validasi Stok Lolos: Seluruh Kebutuhan Barang Memiliki Stok yang Mencukupi"}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {hasStockDeficit
                          ? "Permintaan tidak dapat disetujui jika menyebabkan saldo persediaan minus. Silakan input Pembelian / Transfer Masuk terlebih dahulu."
                          : "Tidak ada barang yang menyebabkan saldo minus."}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAllStockAnalysis(!showAllStockAnalysis)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs self-start sm:self-auto"
                  >
                    {showAllStockAnalysis ? "Tampilkan Yang Defisit Saja" : `Lihat Semua Barang (${stockAnalysisItems.length})`}
                  </button>
                </div>

                <div className="p-4">
                  {hasStockDeficit && (
                    <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2">
                      <ShieldAlert size={18} className="shrink-0 text-red-600" />
                      <span>
                        <strong>Import Terkunci:</strong> Anda belum dapat mengimpor permintaan ini sampai data barang yang defisit di bawah ini diinputkan stok masuknya di menu <strong>Pembelian</strong> atau <strong>Transfer Masuk</strong>.
                      </span>
                    </div>
                  )}

                  <div className="overflow-x-auto max-h-56">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold uppercase sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">No</th>
                          <th className="px-3 py-2 text-left">Kode Barang</th>
                          <th className="px-3 py-2 text-left">Nama Barang</th>
                          <th className="px-3 py-2 text-center">Satuan</th>
                          <th className="px-3 py-2 text-right">Stok Sistem Saat Ini</th>
                          <th className="px-3 py-2 text-right">Total Diminta di Excel</th>
                          <th className="px-3 py-2 text-right">Estimasi Saldo Akhir</th>
                          <th className="px-3 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(showAllStockAnalysis
                          ? stockAnalysisItems
                          : stockAnalysisItems.filter((i) => i.is_deficit)
                        ).map((item, idx) => (
                          <tr
                            key={idx}
                            className={item.is_deficit ? "bg-red-50/60 font-semibold" : "hover:bg-slate-50"}
                          >
                            <td className="px-3 py-2.5 text-slate-400 font-mono">{idx + 1}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-600">{item.item_code || "-"}</td>
                            <td className="px-3 py-2.5 text-slate-800 font-medium">{item.item_name}</td>
                            <td className="px-3 py-2.5 text-center text-slate-500">{item.unit}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                              {formatNumber(item.current_stock)}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-blue-700">
                              {formatNumber(item.total_requested)}
                            </td>
                            <td
                              className={`px-3 py-2.5 text-right font-mono font-bold ${
                                item.is_deficit ? "text-red-600" : "text-emerald-600"
                              }`}
                            >
                              {item.remaining_stock < 0 ? "-" : ""}
                              {formatNumber(Math.abs(item.remaining_stock))}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {item.is_deficit ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                                  Kurang {formatNumber(Math.abs(item.remaining_stock))} {item.unit}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  ✓ Cukup
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* SEKSI 2: STATUS TANDA TANGAN DIGITAL PEMOHON (OPSIONAL) */}
              {/* ========================================================================= */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <PenTool className="text-indigo-600 shrink-0" size={18} />
                    <h4 className="font-bold text-slate-800 text-sm">
                      Status Tanda Tangan Digital Pemohon ({uniqueRequesters.length} Pegawai)
                    </h4>
                  </div>
                  <span className="text-xs text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full">
                    Opsional: Pegawai juga dapat TTD mandiri di akun masing-masing
                  </span>
                </div>

                <div className="p-4">
                  <p className="text-xs text-slate-500 mb-3">
                    Sistem mendeteksi tanda tangan digital dari profil pengguna atau dokumen sebelumnya. Anda dapat mengunggah file tanda tangan atau tanda tangan langsung di sini jika diperlukan:
                  </p>

                  <div className="overflow-x-auto max-h-56">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold uppercase sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">No</th>
                          <th className="px-3 py-2 text-left">Nama Pegawai & NIP</th>
                          <th className="px-3 py-2 text-left">Username</th>
                          <th className="px-3 py-2 text-left">Unit Kerja</th>
                          <th className="px-3 py-2 text-center">Jml Dokumen</th>
                          <th className="px-3 py-2 text-center">Status TTD</th>
                          <th className="px-3 py-2 text-center">Aksi TTD</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {uniqueRequesters.map((reqUser, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-3 py-2.5 text-slate-400 font-mono">{idx + 1}</td>
                            <td className="px-3 py-2.5">
                              <div className="font-bold text-slate-800">{reqUser.name}</div>
                              <div className="text-[11px] text-slate-400 font-mono">{reqUser.nip || "-"}</div>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-indigo-700 font-medium">
                              @{reqUser.username}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">{reqUser.work_unit || "-"}</td>
                            <td className="px-3 py-2.5 text-center font-bold text-slate-700">
                              {reqUser.total_docs} Dok
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {reqUser.signature ? (
                                <div className="flex items-center justify-center gap-2">
                                  <div className="w-12 h-6 border border-emerald-200 bg-emerald-50 rounded flex items-center justify-center overflow-hidden p-0.5">
                                    <img
                                      src={reqUser.signature}
                                      alt="TTD"
                                      className="max-h-full max-w-full object-contain"
                                    />
                                  </div>
                                  <span className="text-[10px] font-bold text-emerald-700">✓ Ada</span>
                                </div>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                  Belum Ada
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => triggerUploadSignature(reqUser.user_id)}
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition-all"
                                  title="Upload Gambar TTD (PNG/JPG)"
                                >
                                  Upload
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openSignatureModal(reqUser)}
                                  className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold transition-all"
                                  title="Tanda Tangan Langsung di Layar"
                                >
                                  TTD Langsung
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* SEKSI 3: DAFTAR DOKUMEN PERMINTAAN HASIL GROUPING */}
              {/* ========================================================================= */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers size={18} className="text-blue-600" />
                    <h4 className="text-sm font-bold text-slate-800">
                      Rincian Dokumen Permintaan ({previewValidDocs} Dokumen Siap Import)
                    </h4>
                  </div>
                  <span className="text-xs text-slate-400">
                    Klik untuk membuka rincian barang per nomor dokumen
                  </span>
                </div>

                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {parsedImportDocs.map((doc, dIdx) => {
                    const isExpanded = !!expandedDocs[doc.document_number];
                    const isSkipped = doc.is_duplicate && skipDuplicates;

                    return (
                      <div
                        key={dIdx}
                        className={`bg-white rounded-2xl border transition-all ${
                          isSkipped
                            ? "border-slate-200 opacity-60 bg-slate-50"
                            : doc.has_deficit
                            ? "border-red-300 bg-red-50/20"
                            : doc.is_duplicate
                            ? "border-amber-300"
                            : "border-slate-200 hover:border-blue-300"
                        }`}
                      >
                        {/* Accordion Header */}
                        <div
                          onClick={() => toggleDocExpand(doc.document_number)}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-1 text-slate-400 hover:text-slate-600">
                              {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800 text-sm">
                                  {doc.document_number}
                                </span>
                                {doc.is_duplicate && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                    {isSkipped ? "Dilewati (Duplikat)" : "Sudah Ada"}
                                  </span>
                                )}
                                {doc.has_deficit ? (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
                                    ❌ Ada Barang Minus
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    ✓ Stok Cukup
                                  </span>
                                )}
                                {doc.has_invalid_user && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
                                    Username Tidak Valid
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
                                <span>
                                  Pemohon:{" "}
                                  <strong className="text-slate-800">{doc.user_name}</strong>{" "}
                                  <span className="text-indigo-600">(@{doc.username || "-"})</span>
                                </span>
                                <span>
                                  Tgl Dok:{" "}
                                  <strong className="text-slate-700">{doc.document_date}</strong>
                                </span>
                                <span>
                                  Tgl Buku:{" "}
                                  <strong className="text-slate-700">{doc.book_date}</strong>
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-4 pl-8 sm:pl-0">
                            <span className="text-xs text-slate-500">
                              {doc.items.length} jenis barang
                            </span>
                            {doc.signature ? (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                                ✓ TTD Ada
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                                Belum TTD
                              </span>
                            )}
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
                                    <th className="px-3 py-2 text-right">Jumlah Diminta</th>
                                    <th className="px-3 py-2 text-left">Satuan</th>
                                    <th className="px-3 py-2 text-right">Stok Sistem</th>
                                    <th className="px-3 py-2 text-center">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {doc.items.map((item, iIdx) => (
                                    <tr key={iIdx} className="hover:bg-white">
                                      <td className="px-3 py-2 text-slate-400 font-mono">{iIdx + 1}</td>
                                      <td className="px-3 py-2 font-mono text-slate-500">
                                        {item.item_code || "-"}
                                      </td>
                                      <td className="px-3 py-2 font-bold text-slate-700">
                                        {item.item_name}
                                      </td>
                                      <td className="px-3 py-2 text-right font-medium text-slate-800">
                                        {formatNumber(item.quantity)}
                                      </td>
                                      <td className="px-3 py-2 text-slate-600 font-medium">{item.unit}</td>
                                      <td className="px-3 py-2 text-right font-mono text-slate-600">
                                        {formatNumber(item.current_stock)}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {item.is_deficit ? (
                                          <span className="text-[9px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                                            Minus
                                          </span>
                                        ) : (
                                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                                            Aman
                                          </span>
                                        )}
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

            {/* Footer Actions */}
            <div className="p-5 border-t border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500">
                {isSavingImport ? (
                  <span className="text-blue-600 font-bold flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-blue-600" />
                    {saveImportProgress || "Sedang memproses import..."}
                  </span>
                ) : (
                  <span>
                    Dokumen akan disimpan dengan status{" "}
                    <strong className="text-slate-800">Menunggu Verifikasi (pending_verification)</strong>{" "}
                    untuk diverifikasi oleh Verifikator & disetujui Penanggung Jawab.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  disabled={isSavingImport}
                  onClick={() => setShowImportPreviewModal(false)}
                  className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  Batal
                </button>

                <button
                  type="button"
                  disabled={isSavingImport || hasStockDeficit || previewValidDocs === 0}
                  onClick={handleApproveImport}
                  className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-md shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={
                    hasStockDeficit
                      ? "Tidak dapat disetujui: Stok tidak mencukupi (akan menyebabkan saldo minus)"
                      : undefined
                  }
                >
                  {isSavingImport ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <FileCheck size={18} />
                  )}
                  {isSavingImport
                    ? "Menyimpan Permintaan..."
                    : hasStockDeficit
                    ? "Terkunci (Stok Kurang)"
                    : `Setujui & Simpan (${previewValidDocs} Dokumen)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

            {/* ========================================================================= */}
      {/* POPUP MODAL TANDA TANGAN LANGSUNG (CANVAS PAD) */}
      {/* ========================================================================= */}
      {showSignatureModal && activeSignUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-base">
                  Tanda Tangan Digital Pemohon
                </h3>
                <p className="text-xs text-slate-500">
                  {activeSignUser.name} ({activeSignUser.nip || activeSignUser.username})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSignatureModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-600">
                Goreskan tanda tangan di bawah ini:
              </label>
              <div className="border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 overflow-hidden">
                <SignatureCanvas
                  ref={modalSigCanvasRef}
                  penColor="#1e293b"
                  canvasProps={{
                    className: "w-full h-44 bg-white rounded-xl shadow-inner",
                  }}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => modalSigCanvasRef.current?.clear()}
                  className="text-xs text-red-500 font-bold hover:underline"
                >
                  Hapus Coretan
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSignatureModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={saveDrawnSignature}
                className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100"
              >
                <Check size={16} />
                <span>Gunakan Tanda Tangan</span>
              </button>
            </div>
          </div>
        </div>
      )}

            {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Hapus Permintaan?</h3>
            <p className="text-sm text-slate-600 mb-6">
              Tindakan ini tidak dapat dibatalkan. Data pengajuan akan dihapus permanen.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors shadow-md shadow-red-500/20"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

            {/* ========================================================================= */}
      {/* MODAL DOWNLOAD ZIP DOKUMEN (PDF) */}
      {/* ========================================================================= */}
      {showZipModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
                  <Archive size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">
                    Download Berkas Permintaan (ZIP)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ekspor seluruh dokumen PDF per nomor dokumen
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setShowZipModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 py-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Calendar size={14} className="text-blue-500" />
                  Rentang Tanggal Buku
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">Dari Tanggal:</span>
                    <input
                      type="date"
                      value={startDate}
                      disabled={isExporting}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 focus:bg-white transition-all disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block mb-1">Sampai Tanggal:</span>
                    <input
                      type="date"
                      value={endDate}
                      disabled={isExporting}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 focus:bg-white transition-all disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Filter Status Dokumen
                </label>
                <select
                  value={statusFilter}
                  disabled={isExporting}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 focus:bg-white transition-all disabled:opacity-50"
                >
                  <option value="all">Semua Status</option>
                  <option value="approved">Hanya Disetujui (Approved)</option>
                  <option value="verified">Hanya Terverifikasi (Verified)</option>
                  <option value="pending_verification">Hanya Menunggu Verifikasi</option>
                </select>
              </div>

              {/* Ringkasan & Pratinjau Dokumen */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-500 font-medium">Dokumen Ditemukan:</span>
                  <span className="font-extrabold text-blue-600 bg-blue-100/60 px-2 py-0.5 rounded-md">
                    {filteredExportRequests.length} Dokumen
                  </span>
                </div>
                {filteredExportRequests.length > 0 ? (
                  <div className="mt-2 space-y-1 max-h-24 overflow-y-auto pr-1">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                      Contoh Berkas yang Akan Di-PDF-kan:
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {filteredExportRequests.slice(0, 8).map((r) => (
                        <span
                          key={r.id}
                          className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono text-slate-700"
                        >
                          {(r.document_number || `DOK_${r.id}`).replace(/[\/\\:*?"<>|]/g, "_")}.pdf
                        </span>
                      ))}
                      {filteredExportRequests.length > 8 && (
                        <span className="text-[10px] text-slate-400 font-bold self-center">
                          +{filteredExportRequests.length - 8} lainnya...
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-amber-600 mt-1 font-medium flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    <span>Tidak ada dokumen pada rentang tanggal buku ini.</span>
                  </div>
                )}
              </div>

              {/* Progress Bar saat Ekspor */}
              {isExporting && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                    <span className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin text-blue-600" />
                      Sedang memproses dokumen...
                    </span>
                    <span>{exportProgress.percent}%</span>
                  </div>
                  <div className="w-full bg-blue-200 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full transition-all duration-200"
                      style={{ width: `${exportProgress.percent}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-blue-700 truncate font-mono">
                    {exportProgress.currentName}
                  </div>
                </div>
              )}

              {/* Pesan Error Jika Ada */}
              {exportError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{exportError}</span>
                </div>
              )}
            </div>

            {/* Tombol Aksi */}
            <div className="flex gap-3 justify-end mt-6 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setShowZipModal(false)}
                className="px-4 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 text-xs disabled:opacity-50"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={isExporting || filteredExportRequests.length === 0}
                onClick={handleStartExport}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isExporting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>
                      Mengunduh ({exportProgress.current}/{exportProgress.total})...
                    </span>
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    <span>Download ZIP ({filteredExportRequests.length} Dokumen)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL REKAP TRANSAKSI KELUAR SAKTI (EXCEL & PDF) */}
      {/* ========================================================================= */}
      {showSaktiModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-2xl">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">
                    Rekap Transaksi Keluar (SAKTI)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Format Register Persediaan Keluar Habis Pakai untuk Rekon SAKTI
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSaktiModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filter Controls */}
            <div className="space-y-4 py-4 text-xs">
              {/* Filter 1: Status Dokumen */}
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Status Dokumen Permintaan
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSaktiStatusFilter("approved")}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      saktiStatusFilter === "approved"
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">✓ Hanya Disetujui (Approved)</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Standar pencatatan keluar SAKTI
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSaktiStatusFilter("all")}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      saktiStatusFilter === "all"
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold">Semua Status</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Termasuk menunggu verifikasi / approval
                    </div>
                  </button>
                </div>
              </div>

              {/* Filter 2: Periode Tanggal */}
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Periode Transaksi
                </label>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="saktiDateType"
                      checked={saktiDateRangeType === "all"}
                      onChange={() => setSaktiDateRangeType("all")}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Seluruh Tahun 2026</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="saktiDateType"
                      checked={saktiDateRangeType === "range"}
                      onChange={() => setSaktiDateRangeType("range")}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Rentang Tanggal Tertentu</span>
                  </label>
                </div>

                {saktiDateRangeType === "range" && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-[11px] text-slate-500 block mb-1">
                        Dari Tanggal:
                      </span>
                      <input
                        type="date"
                        value={saktiStartDate}
                        onChange={(e) => setSaktiStartDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block mb-1">
                        Sampai Tanggal:
                      </span>
                      <input
                        type="date"
                        value={saktiEndDate}
                        onChange={(e) => setSaktiEndDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Summary Box */}
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-900">
                <div>
                  <div className="text-[11px] text-emerald-700">Data Siap Diekspor:</div>
                  <div className="font-bold text-sm mt-0.5">
                    {uniqueSaktiDocsCount} Dokumen ({saktiTransactions.length} Baris Komoditas)
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-emerald-700">Total Kuantitas:</div>
                  <div className="font-bold text-sm text-emerald-800 mt-0.5">
                    {totalSaktiQty.toLocaleString("id-ID")} unit
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSaktiModal(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
              >
                Tutup
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={saktiTransactions.length === 0}
                  onClick={handleExportSaktiExcel}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 disabled:opacity-50 cursor-pointer transition-all"
                >
                  <Download size={14} />
                  <span>Ekspor Excel (.xlsx)</span>
                </button>

                <button
                  type="button"
                  disabled={saktiTransactions.length === 0}
                  onClick={() => {
                    setShowSaktiModal(false);
                    setShowSaktiPrintView(true);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 disabled:opacity-50 cursor-pointer transition-all"
                >
                  <Printer size={14} />
                  <span>Cetak PDF SAKTI</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FULLSCREEN PRINTABLE VIEW UNTUK REGISTER TRANSAKSI KELUAR SAKTI */}
      {/* ========================================================================= */}
      {showSaktiPrintView && (
        <div className="fixed inset-0 z-[100] bg-white overflow-auto p-4 sm:p-8 print:p-0 print:static">
          {/* Screen Only Top Bar */}
          <div className="print:hidden max-w-6xl mx-auto flex items-center justify-between pb-4 mb-6 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                Pratinjau Cetak SAKTI - Register Transaksi Keluar
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {uniqueSaktiDocsCount} Dokumen Permintaan • {saktiTransactions.length} Baris Transaksi Barang • Total: {totalSaktiQty.toLocaleString("id-ID")} unit
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-500/20 cursor-pointer"
              >
                <Printer size={16} />
                <span>Cetak / Simpan PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSaktiPrintView(false)}
                className="px-4 py-2.5 border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>

          {/* Printable Container */}
          <div id="sakti-print-area" className="max-w-6xl mx-auto text-slate-900 bg-white">
            {/* Header SAKTI */}
            <div className="text-[10px] sm:text-[11px] leading-tight pb-3 mb-3 border-b-2 border-slate-800 flex justify-between items-start">
              <div>
                <p className="font-semibold">UNTUK PERIODE TAHUN 2026</p>
                <h1 className="text-sm sm:text-base font-bold tracking-wide uppercase mt-0.5">
                  REGISTER TRANSAKSI HARIAN
                </h1>
                <h2 className="text-xs sm:text-sm font-semibold uppercase">
                  PERSEDIAAN KELUAR (HABIS PAKAI)
                </h2>
              </div>
              <div className="text-right">
                <p>
                  <span className="font-semibold">KODE UAKPB : </span>054.01.0100.539164.000.KD
                </p>
                <p>
                  <span className="font-semibold">UAKPB : </span>BADAN PUSAT STATISTIK KEPULAUAN SERIBU
                </p>
                <p className="text-slate-500 mt-0.5">
                  Tanggal Cetak : {formatSaktiDate(new Date().toISOString().split("T")[0])}
                </p>
              </div>
            </div>

            {/* Table */}
            <table className="w-full text-left border-collapse text-[10px] sm:text-[11px]">
              <thead>
                <tr className="border-t border-b-2 border-slate-800 bg-slate-50 font-bold text-slate-800 print:bg-transparent">
                  <th className="py-2 px-2 border-r border-slate-300 text-center w-10">NO</th>
                  <th className="py-2 px-3 border-r border-slate-300">NOMOR DOKUMEN</th>
                  <th className="py-2 px-2 border-r border-slate-300 text-center w-24">TGL DOK</th>
                  <th className="py-2 px-2 border-r border-slate-300 text-center w-24">TGL BUKU</th>
                  <th className="py-2 px-3 border-r border-slate-300 w-44">KODE BARANG</th>
                  <th className="py-2 px-3 border-r border-slate-300">NAMA BARANG</th>
                  <th className="py-2 px-2 border-r border-slate-300 text-right w-16">JUMLAH</th>
                  <th className="py-2 px-3">KETERANGAN (PEMOHON)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {saktiTransactions.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 print:hover:bg-transparent">
                    <td className="py-1 px-2 border-r border-slate-200 text-center text-slate-500 font-mono">
                      {idx + 1}
                    </td>
                    <td className="py-1 px-3 border-r border-slate-200 font-semibold font-mono text-slate-900">
                      {row.docNumber}
                    </td>
                    <td className="py-1 px-2 border-r border-slate-200 text-center font-mono">
                      {formatSaktiDate(row.docDate)}
                    </td>
                    <td className="py-1 px-2 border-r border-slate-200 text-center font-mono">
                      {formatSaktiDate(row.bookDate)}
                    </td>
                    <td className="py-1 px-3 border-r border-slate-200 font-mono text-[9.5px]">
                      {row.itemCode}
                    </td>
                    <td className="py-1 px-3 border-r border-slate-200 font-medium">
                      {row.itemName}
                    </td>
                    <td className="py-1 px-2 border-r border-slate-200 text-right font-bold text-slate-900">
                      {row.qty.toLocaleString("id-ID")}
                    </td>
                    <td className="py-1 px-3 text-slate-700">
                      {row.requesterName}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-b-2 border-slate-800 bg-slate-50 font-bold text-slate-900 print:bg-transparent">
                  <td colSpan={6} className="py-2 px-3 text-right border-r border-slate-300">
                    TOTAL KELUAR:
                  </td>
                  <td className="py-2 px-2 text-right border-r border-slate-300 text-blue-700 print:text-black">
                    {totalSaktiQty.toLocaleString("id-ID")}
                  </td>
                  <td className="py-2 px-3 text-slate-500">
                    {saktiTransactions.length} item komoditas
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Embedded Print Styling */}
          <style>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              #sakti-print-area, #sakti-print-area * {
                visibility: visible !important;
              }
              #sakti-print-area {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                padding: 0 !important;
                margin: 0 !important;
              }
              @page {
                size: landscape;
                margin: 10mm;
              }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
