/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, useMemo } from "react";
import {
  db,
  type ATKItem,
  type InitialBalance,
  type Purchase,
  type PurchaseItem,
  type Request,
  type ATKRequest,
  type ATKRequestItem,
  type TransferMasuk,
  type TransferMasukItem,
  type TransferKeluar,
  type TransferKeluarItem,
} from "../lib/db";
import { getCategoryFromItemCode } from "../lib/bmnCategories";
import { calculateInventoryFifoSummary, type InventoryTxItem } from "../lib/stockCalculations";
import * as XLSX from "xlsx";
import {
  Printer,
  Download,
  Search,
  Calendar,
  Layers,
  Settings2,
  RefreshCw,
  FileSpreadsheet,
} from "lucide-react";

interface ItemReportRow {
  id: number;
  item_code: string;
  short_code: string;
  category_code: string;
  category_name: string;
  name: string;
  unit: string;
  saldoAwalQty: number;
  saldoAwalNilai: number;
  mutasiMasukQty: number;
  mutasiKeluarQty: number;
  mutasiBersihQty: number;
  saldoAkhirQty: number;
  saldoAkhirNilai: number;
}

interface CategoryGroup {
  categoryCode: string;
  categoryName: string;
  items: ItemReportRow[];
  totalSaldoAwalNilai: number;
  totalSaldoAkhirNilai: number;
}

export default function InventoryReport() {
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<number>(2026);
  const [cutOffDate, setCutOffDate] = useState<string>("2026-10-31");
  const [showAllItems, setShowAllItems] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Pejabat TTD state
  const [showSignerModal, setShowSignerModal] = useState(false);
  const [petugasName, setPetugasName] = useState("Yogi Nur Yahya");
  const [petugasNIP, setPetugasNIP] = useState("199904202019121001");
  const [kpbName, setKpbName] = useState("Suryana");
  const [kpbNIP, setKpbNIP] = useState("197804052000121007");
  const [signLocation, setSignLocation] = useState("Jakarta");
  const [signDate, setSignDate] = useState("2026-10-31");

  // Raw Database Data
  const [masterItems, setMasterItems] = useState<ATKItem[]>([]);
  const [initialBalances, setInitialBalances] = useState<InitialBalance[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [atkRequests, setAtkRequests] = useState<ATKRequest[]>([]);
  const [atkRequestItems, setAtkRequestItems] = useState<ATKRequestItem[]>([]);
  const [transferMasuk, setTransferMasuk] = useState<TransferMasuk[]>([]);
  const [transferMasukItems, setTransferMasukItems] = useState<TransferMasukItem[]>([]);
  const [transferKeluar, setTransferKeluar] = useState<TransferKeluar[]>([]);
  const [transferKeluarItems, setTransferKeluarItems] = useState<TransferKeluarItem[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [
        mItems,
        inBals,
        pList,
        pItems,
        reqs,
        atkReqs,
        atkReqItems,
        tmList,
        tmItems,
        tkList,
        tkItems,
      ] = await Promise.all([
        db.atk_items.toArray(),
        db.initial_balances.toArray(),
        db.purchases.toArray(),
        db.purchase_items.toArray(),
        db.requests.where("status").equals("approved").toArray(),
        db.atk_requests.where("status").equals("approved").toArray(),
        db.atk_request_items.toArray(),
        db.transfer_masuk.toArray(),
        db.transfer_masuk_items.toArray(),
        db.transfer_keluar.toArray(),
        db.transfer_keluar_items.toArray(),
      ]);

      setMasterItems(mItems || []);
      setInitialBalances(inBals || []);
      setPurchases(pList || []);
      setPurchaseItems(pItems || []);
      setRequests(reqs || []);
      setAtkRequests(atkReqs || []);
      setAtkRequestItems(atkReqItems || []);
      setTransferMasuk(tmList || []);
      setTransferMasukItems(tmItems || []);
      setTransferKeluar(tkList || []);
      setTransferKeluarItems(tkItems || []);
    } catch (err) {
      console.error("Gagal memuat data laporan persediaan:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute Inventory Balances & Transactions with FIFO
  const computedRows: ItemReportRow[] = useMemo(() => {
    const startDate = `${year}-01-01`;

    // Map initial balances for chosen year
    const balMap = new Map<string, { qty: number; price: number }>();
    for (const b of initialBalances) {
      if (!b.year || Number(b.year) === year) {
        balMap.set(b.item_name.toLowerCase(), {
          qty: Number(b.quantity) || 0,
          price: Number(b.unit_price) || 0,
        });
      }
    }

    const rows: ItemReportRow[] = [];

    for (const master of masterItems) {
      const nameKey = master.name.toLowerCase();
      const bal = balMap.get(nameKey) || { qty: 0, price: 0 };
      const saldoAwalQty = bal.qty;
      const saldoAwalNilai = bal.qty * bal.price;

      // Collect all chronological transactions for this item
      const txs: InventoryTxItem[] = [];

      // 1. Purchases (IN)
      for (const pi of purchaseItems) {
        if (pi.item_name.toLowerCase() === nameKey) {
          const p = purchases.find((x) => x.id === pi.purchase_id);
          if (p) {
            const txDate = (p.book_date || p.purchase_date || "").slice(0, 10);
            if (txDate >= startDate && txDate <= cutOffDate) {
              txs.push({
                date: txDate,
                type: "IN",
                qty: Number(pi.quantity) || 0,
                price: Number(pi.unit_price) || 0,
              });
            }
          }
        }
      }

      // 2. Transfer Masuk (IN)
      for (const tmi of transferMasukItems) {
        if (tmi.item_name.toLowerCase() === nameKey) {
          const tm = transferMasuk.find((x) => x.id === tmi.transfer_id);
          if (tm) {
            const txDate = (tm.book_date || tm.transfer_date || "").slice(0, 10);
            if (txDate >= startDate && txDate <= cutOffDate) {
              txs.push({
                date: txDate,
                type: "IN",
                qty: Number(tmi.quantity) || 0,
                price: Number(tmi.unit_price) || 0,
              });
            }
          }
        }
      }

      // 3. Requests Approved (OUT)
      for (const req of requests) {
        for (const item of req.items || []) {
          if (item.name.toLowerCase() === nameKey) {
            const txDate = (
              req.book_date ||
              req.document_date ||
              req.submission_date ||
              req.created_at ||
              ""
            ).slice(0, 10);
            if (txDate >= startDate && txDate <= cutOffDate) {
              txs.push({
                date: txDate,
                type: "OUT",
                qty: Number(item.quantity) || 0,
                price: 0,
              });
            }
          }
        }
      }

      // 4. ATK Requests Approved (OUT)
      for (const req of atkRequests) {
        const items = atkRequestItems.filter((ri) => ri.request_id === req.id);
        for (const ri of items) {
          const finalName = ri.final_item_name || ri.item_name;
          if (finalName.toLowerCase() === nameKey) {
            const txDate = (req.created_at || "").slice(0, 10);
            if (txDate >= startDate && txDate <= cutOffDate) {
              txs.push({
                date: txDate,
                type: "OUT",
                qty: Number(ri.quantity) || 0,
                price: 0,
              });
            }
          }
        }
      }

      // 5. Transfer Keluar (OUT)
      for (const tki of transferKeluarItems) {
        if (tki.item_name.toLowerCase() === nameKey) {
          const tk = transferKeluar.find((x) => x.id === tki.transfer_id);
          if (tk) {
            const txDate = (tk.book_date || tk.transfer_date || "").slice(0, 10);
            if (txDate >= startDate && txDate <= cutOffDate) {
              txs.push({
                date: txDate,
                type: "OUT",
                qty: Number(tki.quantity) || 0,
                price: 0,
              });
            }
          }
        }
      }

      // Compute FIFO summary with deficit reconciliation and zero-clamp guarantee
      const summary = calculateInventoryFifoSummary(
        txs,
        saldoAwalQty,
        bal.price
      );

      const catInfo = getCategoryFromItemCode(master.item_code);

      rows.push({
        id: master.id!,
        item_code: master.item_code || "",
        short_code: catInfo.shortCode,
        category_code: catInfo.categoryCode,
        category_name: catInfo.categoryName,
        name: master.name,
        unit: master.unit || "pcs",
        saldoAwalQty,
        saldoAwalNilai,
        mutasiMasukQty: summary.mutasiMasukQty,
        mutasiKeluarQty: summary.mutasiKeluarQty,
        mutasiBersihQty: summary.mutasiBersihQty,
        saldoAkhirQty: summary.saldoAkhirQty,
        saldoAkhirNilai: summary.saldoAkhirNilai,
      });
    }

    return rows;
  }, [
    masterItems,
    initialBalances,
    purchases,
    purchaseItems,
    requests,
    atkRequests,
    atkRequestItems,
    transferMasuk,
    transferMasukItems,
    transferKeluar,
    transferKeluarItems,
    year,
    cutOffDate,
  ]);

  // Filtered rows (based on showAllItems & search)
  const filteredRows = useMemo(() => {
    return computedRows.filter((r) => {
      // Filter non-zero items if not showAllItems
      if (!showAllItems) {
        const hasActivity =
          r.saldoAwalQty !== 0 ||
          r.saldoAwalNilai !== 0 ||
          r.mutasiMasukQty !== 0 ||
          r.mutasiKeluarQty !== 0 ||
          r.saldoAkhirQty !== 0 ||
          r.saldoAkhirNilai !== 0;
        if (!hasActivity) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const mCode = r.item_code.toLowerCase();
        const mShort = r.short_code.toLowerCase();
        const mName = r.name.toLowerCase();
        const mCat = r.category_name.toLowerCase();
        return (
          mCode.includes(q) ||
          mShort.includes(q) ||
          mName.includes(q) ||
          mCat.includes(q)
        );
      }

      return true;
    });
  }, [computedRows, showAllItems, searchTerm]);

  // Group by category
  const categoryGroups: CategoryGroup[] = useMemo(() => {
    const map = new Map<string, CategoryGroup>();

    for (const row of filteredRows) {
      if (!map.has(row.category_code)) {
        map.set(row.category_code, {
          categoryCode: row.category_code,
          categoryName: row.category_name,
          items: [],
          totalSaldoAwalNilai: 0,
          totalSaldoAkhirNilai: 0,
        });
      }
      const grp = map.get(row.category_code)!;
      grp.items.push(row);
      grp.totalSaldoAwalNilai += row.saldoAwalNilai;
      grp.totalSaldoAkhirNilai += row.saldoAkhirNilai;
    }

    // Sort categories by code
    return Array.from(map.values()).sort((a, b) =>
      a.categoryCode.localeCompare(b.categoryCode)
    );
  }, [filteredRows]);

  // Grand Totals
  const grandTotal = useMemo(() => {
    let totalAwalNilai = 0;
    let totalMasukQty = 0;
    let totalKeluarQty = 0;
    let totalAkhirNilai = 0;

    for (const r of filteredRows) {
      totalAwalNilai += r.saldoAwalNilai;
      totalMasukQty += r.mutasiMasukQty;
      totalKeluarQty += r.mutasiKeluarQty;
      totalAkhirNilai += r.saldoAkhirNilai;
    }

    return {
      totalAwalNilai,
      totalMasukQty,
      totalKeluarQty,
      totalAkhirNilai,
    };
  }, [filteredRows]);

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    const data: (string | number)[][] = [
      ["BADAN PUSAT STATISTIK : UAPB"],
      ["BADAN PUSAT STATISTIK : UAPPB-E1"],
      ["SEKRETARIAT UTAMA BADAN PUSAT STATISTIK : UAPPB-W"],
      ["KODE UAKPB : 054.01.0100.539163"],
      ["NAMA UAKPB : BADAN PUSAT STATISTIK JAKARTA SELATAN"],
      [""],
      ["LAPORAN RINCIAN BARANG PERSEDIAAN"],
      [`UNTUK PERIODE YANG BERAKHIR TANGGAL ${cutOffDate}`],
      [`TAHUN ANGGARAN : ${year}`],
      [""],
      [
        "KODE",
        "U R A I A N",
        `S/D 01-01-${year} (JUMLAH)`,
        `S/D 01-01-${year} (NILAI RUPIAH)`,
        "MUTASI (MASUK)",
        "MUTASI (KELUAR)",
        "MUTASI (BERSIH)",
        `S/D ${cutOffDate} (JUMLAH)`,
        `S/D ${cutOffDate} (NILAI RUPIAH)`,
      ],
    ];

    for (const group of categoryGroups) {
      // Category row
      data.push([
        "",
        group.categoryName,
        "",
        group.totalSaldoAwalNilai,
        "",
        "",
        "",
        "",
        group.totalSaldoAkhirNilai,
      ]);

      // Items
      for (const item of group.items) {
        data.push([
          item.short_code,
          item.name,
          item.saldoAwalQty,
          item.saldoAwalNilai,
          item.mutasiMasukQty,
          item.mutasiKeluarQty,
          item.mutasiBersihQty,
          item.saldoAkhirQty,
          item.saldoAkhirNilai,
        ]);
      }
    }

    // Grand Total
    data.push([
      "",
      "Jumlah Total",
      "",
      grandTotal.totalAwalNilai,
      grandTotal.totalMasukQty,
      grandTotal.totalKeluarQty,
      "",
      "",
      grandTotal.totalAkhirNilai,
    ]);

    data.push([""]);
    data.push([""]);

    // Signatures
    data.push([
      "",
      `Disetujui tanggal : ${signDate}`,
      "",
      "",
      "",
      "",
      `${signLocation}, ${signDate}`,
    ]);
    data.push([
      "",
      "Kuasa Pengguna Barang",
      "",
      "",
      "",
      "",
      "Petugas Pengelola Persediaan",
    ]);
    data.push([""]);
    data.push([""]);
    data.push(["", kpbName, "", "", "", "", petugasName]);
    data.push(["", `NIP. ${kpbNIP}`, "", "", "", "", `NIP. ${petugasNIP}`]);

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Adjust column widths
    ws["!cols"] = [
      { wch: 12 }, // Kode
      { wch: 45 }, // Uraian
      { wch: 15 }, // Saldo Awal Qty
      { wch: 18 }, // Saldo Awal Rp
      { wch: 15 }, // Masuk
      { wch: 15 }, // Keluar
      { wch: 15 }, // Bersih
      { wch: 15 }, // Saldo Akhir Qty
      { wch: 20 }, // Saldo Akhir Rp
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Rincian Persediaan");
    XLSX.writeFile(
      wb,
      `Laporan_Rincian_Persediaan_${cutOffDate.replace(/-/g, "")}.xlsx`
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const formatRp = (num: number) => {
    return num.toLocaleString("id-ID");
  };

  const formatQty = (num: number) => {
    return num.toLocaleString("id-ID");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* SCREEN ONLY CONTROLS */}
      <div className="print:hidden space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="text-blue-600" size={28} />
              <span>Laporan Rincian Persediaan</span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Format standar SAKTI untuk rekonsiliasi data mutasi & saldo akhir ATK
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={loadData}
              title="Muat ulang data"
              className="p-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 transition cursor-pointer"
            >
              <RefreshCw size={15} />
            </button>

            <button
              onClick={() => setShowSignerModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              <Settings2 size={15} />
              <span>Pejabat TTD</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <Download size={15} />
              <span>Ekspor Excel</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <Printer size={15} />
              <span>Cetak PDF</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tahun Anggaran
              </label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || 2026)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Periode Cut-Off (s/d Tanggal)
              </label>
              <div className="relative">
                <Calendar
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="date"
                  value={cutOffDate}
                  onChange={(e) => {
                    setCutOffDate(e.target.value);
                    setSignDate(e.target.value);
                  }}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pencarian Barang / Kode
              </label>
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  placeholder="Nama barang / kode..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cakupan Barang
              </label>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAllItems(!showAllItems)}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition cursor-pointer ${
                    showAllItems
                      ? "bg-purple-50 text-purple-700 border-purple-200"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}
                >
                  <Layers size={14} />
                  <span>
                    {showAllItems
                      ? "Semua Barang (1.380)"
                      : "Barang Ada Saldo/Mutasi"}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-[11px] text-slate-500">
                Saldo Awal (01-01-{year})
              </div>
              <div className="text-sm font-bold text-slate-800 mt-0.5">
                Rp {formatRp(grandTotal.totalAwalNilai)}
              </div>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
              <div className="text-[11px] text-emerald-700">
                Mutasi Masuk (Kuantitas)
              </div>
              <div className="text-sm font-bold text-emerald-800 mt-0.5">
                +{formatQty(grandTotal.totalMasukQty)} unit
              </div>
            </div>

            <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
              <div className="text-[11px] text-rose-700">
                Mutasi Keluar (Kuantitas)
              </div>
              <div className="text-sm font-bold text-rose-800 mt-0.5">
                -{formatQty(grandTotal.totalKeluarQty)} unit
              </div>
            </div>

            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
              <div className="text-[11px] text-blue-700">
                Saldo Akhir (s/d {cutOffDate})
              </div>
              <div className="text-sm font-bold text-blue-800 mt-0.5">
                Rp {formatRp(grandTotal.totalAkhirNilai)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SAKTI REPORT VIEW (BOTH ON SCREEN & PRINT) */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm print:shadow-none print:border-none print:p-0">
        {/* Kop SAKTI */}
        <div className="text-[11px] text-slate-700 leading-tight space-y-0.5 border-b border-slate-300 pb-3 mb-4 print:text-[8.5pt]">
          <div className="flex justify-between">
            <span className="font-semibold">
              SEKRETARIAT UTAMA BADAN PUSAT STATISTIK : UAPPB-W
            </span>
            <span>BADAN PUSAT STATISTIK : UAPB</span>
          </div>
          <div>BADAN PUSAT STATISTIK : UAPPB-E1</div>
          <div className="pt-1">
            <span className="font-semibold">NAMA UAKPB : </span>BADAN PUSAT
            STATISTIK JAKARTA SELATAN
          </div>
          <div>
            <span className="font-semibold">KODE UAKPB : </span>054.01.0100.539163
          </div>
        </div>

        {/* Title */}
        <div className="text-center my-4">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-wide">
            LAPORAN RINCIAN BARANG PERSEDIAAN
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            UNTUK PERIODE YANG BERAKHIR TANGGAL {cutOffDate}
          </p>
          <p className="text-xs text-slate-600 font-semibold">
            TAHUN ANGGARAN : {year}
          </p>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[11px] print:text-[7.5pt]">
            <thead>
              <tr className="border-t-2 border-b-2 border-slate-800 bg-slate-50 font-bold text-slate-800 print:bg-transparent">
                <th
                  rowSpan={2}
                  className="py-2 px-2 text-center border-r border-slate-300 w-16"
                >
                  KODE
                </th>
                <th
                  rowSpan={2}
                  className="py-2 px-3 border-r border-slate-300 min-w-[200px]"
                >
                  U R A I A N
                </th>
                <th
                  colSpan={2}
                  className="py-1 px-2 text-center border-r border-slate-300 border-b border-slate-300"
                >
                  S/D 01-01-{year}
                </th>
                <th
                  colSpan={3}
                  className="py-1 px-2 text-center border-r border-slate-300 border-b border-slate-300"
                >
                  MUTASI
                </th>
                <th
                  colSpan={2}
                  className="py-1 px-2 text-center border-slate-300 border-b"
                >
                  S/D {cutOffDate}
                </th>
              </tr>
              <tr className="border-b-2 border-slate-800 bg-slate-50 font-bold text-slate-700 text-center print:bg-transparent">
                <th className="py-1 px-2 border-r border-slate-300 w-16">
                  JUMLAH
                </th>
                <th className="py-1 px-2 border-r border-slate-300 w-24">
                  N I L A I<br />RUPIAH
                </th>
                <th className="py-1 px-2 border-r border-slate-300 w-16">
                  MASUK
                </th>
                <th className="py-1 px-2 border-r border-slate-300 w-16">
                  KELUAR
                </th>
                <th className="py-1 px-2 border-r border-slate-300 w-16">
                  BERSIH
                </th>
                <th className="py-1 px-2 border-r border-slate-300 w-16">
                  JUMLAH
                </th>
                <th className="py-1 px-2 w-24">
                  N I L A I<br />RUPIAH
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {categoryGroups.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    Tidak ada barang yang cocok dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                categoryGroups.map((group) => (
                  <>
                    {/* Category Header Row */}
                    <tr
                      key={`cat-${group.categoryCode}`}
                      className="bg-slate-100/80 font-bold text-slate-900 print:bg-slate-100"
                    >
                      <td className="py-1.5 px-2 text-center font-mono text-[10px] text-slate-600 border-r border-slate-300">
                        {group.categoryCode}
                      </td>
                      <td className="py-1.5 px-3 uppercase border-r border-slate-300">
                        {group.categoryName}
                      </td>
                      <td className="py-1.5 px-2 text-right border-r border-slate-300"></td>
                      <td className="py-1.5 px-2 text-right border-r border-slate-300">
                        {group.totalSaldoAwalNilai > 0
                          ? formatRp(group.totalSaldoAwalNilai)
                          : "0"}
                      </td>
                      <td className="py-1.5 px-2 text-right border-r border-slate-300"></td>
                      <td className="py-1.5 px-2 text-right border-r border-slate-300"></td>
                      <td className="py-1.5 px-2 text-right border-r border-slate-300"></td>
                      <td className="py-1.5 px-2 text-right border-r border-slate-300"></td>
                      <td className="py-1.5 px-2 text-right">
                        {group.totalSaldoAkhirNilai > 0
                          ? formatRp(group.totalSaldoAkhirNilai)
                          : "0"}
                      </td>
                    </tr>

                    {/* Items inside Category */}
                    {group.items.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-1 px-2 text-center font-mono text-slate-500 border-r border-slate-200">
                          {item.short_code}
                        </td>
                        <td className="py-1 px-3 text-slate-800 border-r border-slate-200">
                          {item.name}
                        </td>
                        <td className="py-1 px-2 text-right text-slate-700 border-r border-slate-200">
                          {item.saldoAwalQty !== 0
                            ? formatQty(item.saldoAwalQty)
                            : "0"}
                        </td>
                        <td className="py-1 px-2 text-right text-slate-700 border-r border-slate-200">
                          {item.saldoAwalNilai !== 0
                            ? formatRp(item.saldoAwalNilai)
                            : "0"}
                        </td>
                        <td className="py-1 px-2 text-right text-slate-700 border-r border-slate-200">
                          {item.mutasiMasukQty !== 0
                            ? formatQty(item.mutasiMasukQty)
                            : "0"}
                        </td>
                        <td className="py-1 px-2 text-right text-slate-700 border-r border-slate-200">
                          {item.mutasiKeluarQty !== 0
                            ? formatQty(item.mutasiKeluarQty)
                            : "0"}
                        </td>
                        <td className="py-1 px-2 text-right text-slate-700 border-r border-slate-200">
                          {item.mutasiBersihQty !== 0
                            ? formatQty(item.mutasiBersihQty)
                            : "0"}
                        </td>
                        <td className="py-1 px-2 text-right font-medium text-slate-900 border-r border-slate-200">
                          {item.saldoAkhirQty !== 0
                            ? formatQty(item.saldoAkhirQty)
                            : "0"}
                        </td>
                        <td className="py-1 px-2 text-right font-medium text-slate-900">
                          {item.saldoAkhirNilai !== 0
                            ? formatRp(item.saldoAkhirNilai)
                            : "0"}
                        </td>
                      </tr>
                    ))}
                  </>
                ))
              )}
            </tbody>
            <tfoot>
              {/* Grand Total Row */}
              <tr className="border-t-2 border-b-2 border-slate-800 bg-slate-100 font-bold text-slate-900 print:bg-transparent">
                <td className="py-2 px-2 text-center border-r border-slate-300"></td>
                <td className="py-2 px-3 border-r border-slate-300">
                  Jumlah Total
                </td>
                <td className="py-2 px-2 text-right border-r border-slate-300"></td>
                <td className="py-2 px-2 text-right border-r border-slate-300">
                  {formatRp(grandTotal.totalAwalNilai)}
                </td>
                <td className="py-2 px-2 text-right border-r border-slate-300">
                  {formatQty(grandTotal.totalMasukQty)}
                </td>
                <td className="py-2 px-2 text-right border-r border-slate-300">
                  {formatQty(grandTotal.totalKeluarQty)}
                </td>
                <td className="py-2 px-2 text-right border-r border-slate-300">
                  {formatQty(
                    grandTotal.totalMasukQty - grandTotal.totalKeluarQty
                  )}
                </td>
                <td className="py-2 px-2 text-right border-r border-slate-300"></td>
                <td className="py-2 px-2 text-right">
                  {formatRp(grandTotal.totalAkhirNilai)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Signatures Footer */}
        <div className="mt-10 grid grid-cols-2 text-xs sm:text-sm text-slate-800 break-inside-avoid print:text-[8.5pt]">
          <div className="space-y-1">
            <p>Disetujui tanggal : {signDate}</p>
            <p className="font-semibold">Kuasa Pengguna Barang</p>
            <div className="h-20" />
            <p className="font-bold underline">{kpbName}</p>
            <p className="text-slate-600">NIP. {kpbNIP}</p>
          </div>

          <div className="space-y-1 text-right">
            <p>
              {signLocation}, {signDate}
            </p>
            <p className="font-semibold">Petugas Pengelola Persediaan</p>
            <div className="h-20" />
            <p className="font-bold underline">{petugasName}</p>
            <p className="text-slate-600">NIP. {petugasNIP}</p>
          </div>
        </div>
      </div>

      {/* MODAL PENGATURAN PEJABAT TTD */}
      {showSignerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-100">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <Settings2 size={18} className="text-blue-600" />
                <span>Pengaturan Pejabat Penandatangan</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSignerModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 space-y-2">
                <div className="text-xs font-bold text-blue-900">
                  Petugas Pengelola Persediaan (Kanan)
                </div>
                <input
                  type="text"
                  placeholder="Nama Petugas"
                  value={petugasName}
                  onChange={(e) => setPetugasName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                />
                <input
                  type="text"
                  placeholder="NIP Petugas"
                  value={petugasNIP}
                  onChange={(e) => setPetugasNIP(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-slate-800">
                  Kuasa Pengguna Barang / KPB (Kiri)
                </div>
                <input
                  type="text"
                  placeholder="Nama KPB"
                  value={kpbName}
                  onChange={(e) => setKpbName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                />
                <input
                  type="text"
                  placeholder="NIP KPB"
                  value={kpbNIP}
                  onChange={(e) => setKpbNIP(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Kota Penandatanganan
                  </label>
                  <input
                    type="text"
                    value={signLocation}
                    onChange={(e) => setSignLocation(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Tanggal Pengesahan
                  </label>
                  <input
                    type="date"
                    value={signDate}
                    onChange={(e) => setSignDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowSignerModal(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Simpan & Terapkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
