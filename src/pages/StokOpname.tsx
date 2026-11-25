/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect } from "react";
import { db, type StockOpname, type Settings } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import { useDialog } from "../hooks/useDialog";
import Dialog from "../components/Dialog";
import { Save, Calendar, ClipboardCheck, History, Printer, FileSpreadsheet, X } from "lucide-react";
import * as XLSX from "xlsx";

interface StockItem {
  item_code?: string;
  item_name: string;
  unit: string;
  system_quantity: number;
  actual_quantity: number;
  difference: number;
  notes: string;
}

export default function StokOpnamePage() {
  const { user } = useAuth();
  const { dialogState, closeDialog, alert } = useDialog();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingOpname, setExistingOpname] = useState<StockOpname[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [opnameHistory, setOpnameHistory] = useState<StockOpname[]>([]);

  // SAKTI Bahan Opname states
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "active">("all");
  const [docNumber, setDocNumber] = useState("");
  const [opnameDate, setOpnameDate] = useState("");
  const [includeActual, setIncludeActual] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    loadData();
  }, [month, year]);

  const loadData = async () => {
    setLoading(true);

    // Get all ATK items from master
    const masterItems = await db.atk_items.toArray();

    // Get initial balances for this year
    const initialBalances = await db.initial_balances
      .where("year")
      .equals(year)
      .toArray();

    // Get all purchase items
    const purchaseItems = await db.purchase_items.toArray();

    // Get all approved requests from ATK Request system
    const approvedRequests = await db.atk_requests
      .where("status")
      .equals("approved")
      .toArray();
    const requestItemsPromises = approvedRequests.map((req: { id?: number }) =>
      db.atk_request_items.where("request_id").equals(req.id!).toArray(),
    );
    const requestItemsArrays = await Promise.all(requestItemsPromises);
    const requestItems = requestItemsArrays.flat();

    // Get all approved requests from Verifikator/Supervisor workflow
    const approvedRequestsNew = await db.requests
      .where("status")
      .equals("approved")
      .toArray();

    // Get all transfer items
    const [tMasukItems, tKeluarItems] = await Promise.all([
      db.transfer_masuk_items.toArray(),
      db.transfer_keluar_items.toArray(),
    ]);

    // Get existing opname for this month/year
    const allOpnames = await db.stock_opnames.toArray();
    const existing = allOpnames.filter(
      (o: StockOpname) => o.month === month && o.year === year,
    );
    setExistingOpname(existing);

    // Get opname history
    const history = allOpnames.sort((a: StockOpname, b: StockOpname) =>
      b.created_at.localeCompare(a.created_at),
    );
    setOpnameHistory(history);

    // Calculate current system stock for each item
    const stockMap = new Map<string, { unit: string; quantity: number }>();

    // Add initial balances
    for (const balance of initialBalances) {
      const key = balance.item_name.toLowerCase();
      stockMap.set(key, {
        unit: balance.unit,
        quantity: Number(balance.quantity) || 0,
      });
    }

    // Add purchase items (stock IN)
    for (const purchase of purchaseItems) {
      const key = purchase.item_name.toLowerCase();
      const qty = Number(purchase.quantity) || 0;
      if (stockMap.has(key)) {
        stockMap.get(key)!.quantity += qty;
      } else {
        stockMap.set(key, {
          unit: purchase.unit,
          quantity: qty,
        });
      }
    }

    // Subtract ATK request items (stock OUT)
    for (const request of requestItems) {
      const finalName = request.final_item_name || request.item_name;
      const key = finalName.toLowerCase();
      const qty = Number(request.quantity) || 0;
      if (stockMap.has(key)) {
        stockMap.get(key)!.quantity -= qty;
      }
    }

    // Add transfer masuk items (stock IN)
    for (const t of tMasukItems) {
      const key = t.item_name.toLowerCase();
      const qty = Number(t.quantity) || 0;
      if (stockMap.has(key)) {
        stockMap.get(key)!.quantity += qty;
      } else {
        stockMap.set(key, {
          unit: t.unit,
          quantity: qty,
        });
      }
    }

    // Subtract transfer keluar items (stock OUT)
    for (const t of tKeluarItems) {
      const key = t.item_name.toLowerCase();
      const qty = Number(t.quantity) || 0;
      if (stockMap.has(key)) {
        stockMap.get(key)!.quantity -= qty;
      }
    }

    // Subtract verifikator/supervisor requests (stock OUT)
    for (const req of approvedRequestsNew) {
      for (const reqItem of (req.items || [])) {
        const key = reqItem.name.toLowerCase();
        const qty = Number(reqItem.quantity) || 0;
        if (stockMap.has(key)) {
          stockMap.get(key)!.quantity -= qty;
        }
      }
    }

    // Build stock items list
    const items: StockItem[] = [];

    // Include all master items
    for (const master of masterItems) {
      const key = master.name.toLowerCase();
      const stock = stockMap.get(key);
      const existingItem = existing.find(
        (e: StockOpname) => e.item_name.toLowerCase() === key,
      );

      items.push({
        item_code: master.item_code || "",
        item_name: master.name,
        unit: stock?.unit || master.unit,
        system_quantity: stock?.quantity || 0,
        actual_quantity:
          existingItem?.actual_quantity ?? (stock?.quantity || 0),
        difference: existingItem?.difference ?? 0,
        notes: existingItem?.notes || "",
      });
    }

    // Add items from stockMap that are not in master
    for (const [key, value] of stockMap) {
      const existsInMaster = masterItems.some(
        (m: { name: string }) => m.name.toLowerCase() === key,
      );
      if (!existsInMaster) {
        const existingItem = existing.find(
          (e: StockOpname) => e.item_name.toLowerCase() === key,
        );
        items.push({
          item_code: "",
          item_name: key.charAt(0).toUpperCase() + key.slice(1),
          unit: value.unit,
          system_quantity: value.quantity,
          actual_quantity: existingItem?.actual_quantity ?? value.quantity,
          difference: existingItem?.difference ?? 0,
          notes: existingItem?.notes || "",
        });
      }
    }

    // Sort by item_code ascending (matching SAKTI), fallback to item_name
    items.sort((a, b) => {
      if (a.item_code && b.item_code) {
        return a.item_code.localeCompare(b.item_code, undefined, { numeric: true });
      }
      if (a.item_code) return -1;
      if (b.item_code) return 1;
      return a.item_name.localeCompare(b.item_name);
    });

    const sett = await db.settings.get(1);
    setSettings(sett || null);

    const lastDay = new Date(year, month, 0).getDate();
    setOpnameDate(`${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`);

    setStockItems(items);
    setLoading(false);
  };

  const updateActualQuantity = (index: number, value: number) => {
    const updated = [...stockItems];
    updated[index].actual_quantity = value;
    updated[index].difference = value - updated[index].system_quantity;
    setStockItems(updated);
  };

  const updateNotes = (index: number, value: string) => {
    const updated = [...stockItems];
    updated[index].notes = value;
    setStockItems(updated);
  };

  const handleSaveOpname = async () => {
    if (!user) return;

    setSaving(true);
    const now = new Date().toISOString();

    try {
      // Delete existing opname for this month/year first
      for (const existing of existingOpname) {
        await db.stock_opnames.delete(existing.id!);
      }

      // Save new opname data
      for (const item of stockItems) {
        await db.stock_opnames.add({
          item_name: item.item_name,
          unit: item.unit,
          system_quantity: item.system_quantity,
          actual_quantity: item.actual_quantity,
          difference: item.actual_quantity - item.system_quantity,
          month,
          year,
          notes: item.notes || null,
          created_by: user.id!,
          created_at: now,
          updated_at: now,
        });
      }

      await alert("Stok opname berhasil disimpan!");
      loadData();
    } catch (err) {
      await alert("Gagal menyimpan: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const getMonthName = (m: number) => {
    const months = [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember",
    ];
    return months[m - 1];
  };

  const getFilteredBahanOpnameItems = () => {
    let list = [...stockItems];
    if (filterMode === "active") {
      list = list.filter(
        (i) => i.system_quantity > 0 || (i.actual_quantity > 0 && i.difference !== 0)
      );
    }
    return list;
  };

  const handlePrintPDF = async () => {
    const list = getFilteredBahanOpnameItems();
    if (list.length === 0) {
      await alert("Tidak ada barang yang sesuai filter untuk dicetak.");
      return;
    }
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 400);
  };

  const handleExportExcel = async () => {
    const list = getFilteredBahanOpnameItems();
    if (list.length === 0) {
      await alert("Tidak ada barang yang sesuai filter untuk diekspor.");
      return;
    }

    const wb = XLSX.utils.book_new();
    const now = new Date();
    const printDate =
      now.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }) +
      " " +
      now.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

    const formattedOpnameDate = opnameDate
      ? new Date(opnameDate).toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : ".......................................";

    const data: (string | number)[][] = [
      ["BAHAN OPNAME"],
      [`NO : ${docNumber.trim() || "..................................................."}`],
      [""],
      [
        "KODE UAKPB : 054.01.0100.539164.000.KD",
        "",
        "",
        "",
        `Tanggal Cetak : ${printDate}`,
      ],
      [
        `UAKPB : ${settings?.org_name || "BADAN PUSAT STATISTIK KEPULAUAN SERIBU"}`,
        "",
        "",
        "",
        `Tanggal Opnam : ${formattedOpnameDate}`,
      ],
      [""],
      [
        "No.",
        "Kode Barang",
        "Nama Barang",
        "Satuan",
        "Saldo di Sistem",
        "Hasil Opsik",
      ],
    ];

    list.forEach((item, idx) => {
      data.push([
        idx + 1,
        item.item_code || "-",
        item.item_name,
        item.unit || "-",
        item.system_quantity,
        includeActual ? item.actual_quantity : "",
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws["!cols"] = [
      { wch: 6 },
      { wch: 22 },
      { wch: 45 },
      { wch: 12 },
      { wch: 16 },
      { wch: 16 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Bahan Opname");
    const filename = `Bahan_Opname_Fisik_UC_PER014_${year}_${String(month).padStart(2, "0")}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const totalDifference = stockItems.reduce((sum, i) => sum + i.difference, 0);
  const itemsWithDifference = stockItems.filter(
    (i) => i.difference !== 0,
  ).length;

  return (
    <div>
      <Dialog state={dialogState} onClose={closeDialog} />
      <div className="print:hidden">
        <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Stok Opname</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2">
            <Calendar size={18} className="text-slate-400" />
            <select 
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value))}
              className="font-semibold text-slate-700 focus:outline-none"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {getMonthName(i + 1)}
                </option>
              ))}
            </select>
            <select 
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="font-semibold text-slate-700 focus:outline-none"
            >
              {[2024, 2025, 2026, 2027, 2028].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200"
          >
            <History size={18} />
            Histori
          </button>
          <button 
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 shadow-sm transition-colors"
          >
            <Printer size={18} />
            Bahan Opname (SAKTI)
          </button>
          <button 
            onClick={handleSaveOpname}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={20} />
            {saving ? "Menyimpan..." : "Simpan Opname"}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-xl">
              <ClipboardCheck size={24} />
            </div>
            <div>
              <div className="text-blue-100 text-sm">Periode Opname</div>
              <div className="text-xl font-bold">
                {getMonthName(month)} {year}
              </div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-5 text-white">
          <div className="text-green-100 text-sm">Total Item</div>
          <div className="text-2xl font-bold">{stockItems.length}</div>
        </div>
        <div
          className={`bg-gradient-to-br ${totalDifference === 0 ? "from-slate-500 to-slate-600" : totalDifference > 0 ? "from-green-500 to-green-600" : "from-red-500 to-red-600"} rounded-2xl p-5 text-white`}
        >
          <div className="text-white/80 text-sm">Item dengan Selisih</div>
          <div className="text-2xl font-bold">{itemsWithDifference}</div>
        </div>
      </div>

      {/* Opname Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-6">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-800">
            Data Stok Opname - {getMonthName(month)} {year}
          </h2>
          {existingOpname.length > 0 && (
            <p className="text-sm text-green-600 mt-1">
              ✓ Opname sudah dilakukan untuk periode ini
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 w-12">
                  No
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                  Nama Barang
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 w-20">
                  Satuan
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 w-28">
                  Stok Sistem
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 w-32">
                  Stok Aktual
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 w-24">
                  Selisih
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 w-48">
                  Catatan
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stockItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    Tidak ada data stok
                  </td>
                </tr>
              ) : (
                stockItems.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-600 text-center">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">
                        {item.item_name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {item.unit}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">
                      {Number(item.system_quantity || 0).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="number"
                        min={0}
                        value={item.actual_quantity}
                        onChange={(e) =>
                          updateActualQuantity(
                            index,
                            parseInt(e.target.value) || 0,
                          )
                        }
                        className="w-full px-3 py-1.5 text-right border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-semibold ${
                          item.difference > 0
                            ? "text-green-600"
                            : item.difference < 0
                              ? "text-red-600"
                              : "text-slate-400"
                        }`}
                      >
                        {item.difference > 0 && "+"}
                        {item.difference}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="text"
                        value={item.notes}
                        onChange={(e) => updateNotes(index, e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                        placeholder="Catatan..."
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* History Section */}
      {showHistory && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-lg font-semibold text-slate-800">
              Histori Stok Opname
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                    Periode
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                    Nama Barang
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                    Stok Sistem
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                    Stok Aktual
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                    Selisih
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                    Catatan
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {opnameHistory.slice(0, 50).map((opname) => (
                  <tr key={opname.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {getMonthName(opname.month)} {opname.year}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {opname.item_name}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">
                      {opname.system_quantity}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">
                      {opname.actual_quantity}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-semibold ${
                          opname.difference > 0
                            ? "text-green-600"
                            : opname.difference < 0
                              ? "text-red-600"
                              : "text-slate-400"
                        }`}
                      >
                        {opname.difference > 0 && "+"}
                        {opname.difference}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {opname.notes || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>

      {/* MODAL CETAK / EKSPOR BAHAN OPNAME (SAKTI) */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Printer size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Cetak / Ekspor Bahan Opname Fisik</h3>
                  <p className="text-xs text-slate-500">Format Resmi SAKTI (UC_PER014)</p>
                </div>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 py-4">
              {/* Opsi Pilihan Barang */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Pilihan Barang:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFilterMode("all")}
                    className={`py-2 px-3 text-xs rounded-xl font-medium border text-left transition-colors ${
                      filterMode === "all"
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Semua Barang ({stockItems.length} item)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode("active")}
                    className={`py-2 px-3 text-xs rounded-xl font-medium border text-left transition-colors ${
                      filterMode === "active"
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Hanya Ada Saldo ({stockItems.filter((i) => i.system_quantity > 0).length} item)
                  </button>
                </div>
              </div>

              {/* Nomor Dokumen */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor Dokumen (Opsional):
                </label>
                <input
                  type="text"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  placeholder="NO : ..................................................."
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Tanggal Opname */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Pelaksanaan Opname:
                </label>
                <input
                  type="date"
                  value={opnameDate}
                  onChange={(e) => setOpnameDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Ceklist Hasil Opsik Langsung */}
              <div className="pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={includeActual}
                    onChange={(e) => setIncludeActual(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span>Tampilkan Hasil Opsik yang sudah diinput sistem</span>
                </label>
                <p className="text-[11px] text-slate-400 mt-1 pl-6">
                  {includeActual
                    ? "Kolom Hasil Opsik akan terisi angka kuantitas aktual dari sistem."
                    : "Kolom Hasil Opsik dikosongkan untuk dicatat manual/tulis tangan saat cek fisik."}
                </p>
              </div>
            </div>

            {/* Tombol Aksi */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors"
              >
                <FileSpreadsheet size={16} />
                Ekspor Excel
              </button>
              <button
                type="button"
                onClick={handlePrintPDF}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl shadow-xs transition-colors"
              >
                <Printer size={16} />
                Cetak PDF (SAKTI)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SAKTI PRINT VIEW (UC_PER014 BAHAN OPNAME) */}
      <div className={`${isPrinting ? "block" : "hidden"} print:block font-sans text-black bg-white w-full`}>
        <style
          dangerouslySetInnerHTML={{
            __html: `
          @media print {
            @page {
              size: portrait;
              margin: 10mm 8mm 10mm 8mm;
            }
            body {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              font-family: Arial, Helvetica, sans-serif !important;
            }
            .print\\:hidden {
              display: none !important;
            }
            thead {
              display: table-header-group !important;
            }
            tr {
              page-break-inside: avoid !important;
            }
          }
        `,
          }}
        />

        {/* Kop Tengah SAKTI */}
        <div className="text-center mb-2">
          <h1 className="text-sm font-bold tracking-wide uppercase">BAHAN OPNAME</h1>
          <p className="text-[10px] font-mono mt-0.5">
            NO : {docNumber.trim() || "..................................................."}
          </p>
        </div>

        {/* Informasi UAKPB & Tanggal (2 Kolom Kiri & Kanan) */}
        <div className="flex justify-between items-start text-[8.5pt] mb-2 leading-relaxed border-b border-black pb-1.5">
          <div>
            <div>
              <span className="font-semibold">KODE UAKPB : </span>054.01.0100.539164.000.KD
            </div>
            <div>
              <span className="font-semibold">UAKPB : </span>
              {settings?.org_name || "BADAN PUSAT STATISTIK KEPULAUAN SERIBU"}
            </div>
          </div>
          <div className="text-right">
            <div>
              <span className="font-semibold">Tanggal Cetak : </span>
              {new Date().toLocaleDateString("id-ID", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}{" "}
              {new Date().toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
            <div>
              <span className="font-semibold">Tanggal Opnam : </span>
              {opnameDate
                ? new Date(opnameDate).toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })
                : "......................................."}
            </div>
          </div>
        </div>

        {/* Tabel SAKTI 6 Kolom */}
        <table className="w-full border-collapse border border-black text-[8pt]">
          <thead>
            <tr className="bg-slate-50 border-b border-black font-bold">
              <th className="border border-black py-1 px-1 text-center w-7">No.</th>
              <th className="border border-black py-1 px-1.5 text-center w-36">Kode Barang</th>
              <th className="border border-black py-1 px-2 text-left">Nama Barang</th>
              <th className="border border-black py-1 px-1.5 text-center w-16">Satuan</th>
              <th className="border border-black py-1 px-2 text-right w-24">Saldo di Sistem</th>
              <th className="border border-black py-1 px-2 text-right w-24">Hasil Opsik</th>
            </tr>
          </thead>
          <tbody>
            {getFilteredBahanOpnameItems().map((item, idx) => (
              <tr key={idx} className="border-b border-black">
                <td className="border border-black py-0.5 px-1 text-center">{idx + 1}</td>
                <td className="border border-black py-0.5 px-1.5 text-center font-mono">
                  {item.item_code || "-"}
                </td>
                <td className="border border-black py-0.5 px-2 font-medium">{item.item_name}</td>
                <td className="border border-black py-0.5 px-1.5 text-center">{item.unit || "-"}</td>
                <td className="border border-black py-0.5 px-2 text-right font-mono">
                  {item.system_quantity}
                </td>
                <td className="border border-black py-0.5 px-2 text-right font-mono">
                  {includeActual ? item.actual_quantity : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
