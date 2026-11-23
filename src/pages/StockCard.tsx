import { useState, useEffect, useRef } from "react";
import { db, type ATKItem, type InitialBalance, type User, type Purchase, type ATKRequestItem, type TransferMasuk, type TransferKeluar } from "../lib/db";
import { Printer, FileSpreadsheet, Search, X } from "lucide-react";
import QRCodeImage from "../components/QRCodeImage";
import { processFifoTransactions, type RawStockTx, type CalculatedStockTx as StockTransaction } from "../lib/stockCalculations";

type RawStockTransaction = RawStockTx;

interface PrintBatchItem {
  item: ATKItem;
  transactions: StockTransaction[];
}

export default function StockCard() {
  const [atkItems, setAtkItems] = useState<ATKItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ATKItem | null>(null);
  const [printBatch, setPrintBatch] = useState<PrintBatchItem[]>([]);
  const [isPrintingAll, setIsPrintingAll] = useState(false);
  
  // Search states for combobox
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadATKItems().then((items: ATKItem[]) => {
      const params = new URLSearchParams(window.location.search);
      const urlItemId = params.get("item_id");
      if (urlItemId) {
        const idNum = Number(urlItemId);
        setSelectedItemId(idNum);
        const it = items.find((i: ATKItem) => i.id === idNum);
        if (it) {
          setSearchQuery(it.name);
        }
      }
    });
    const now = new Date();
    setDateFrom(`${now.getFullYear()}-01-01`);
    setDateTo(`${now.getFullYear()}-12-31`);
    
    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedItemId) {
      loadStockCard();
    }
  }, [selectedItemId]);

  const loadATKItems = async () => {
    const items = await db.atk_items.toArray();
    setAtkItems(items);
    return items;
  };

  const loadStockCard = async () => {
    if (!selectedItemId) return;
    setLoading(true);
    setTransactions([]);

    try {
      const item = await db.atk_items.get(selectedItemId);
      setSelectedItem(item || null);

      if (!item) throw new Error("Barang tidak ditemukan");

      const year = dateFrom
        ? parseInt(dateFrom.split("-")[0])
        : new Date().getFullYear();

      const allBalances = await db.initial_balances.toArray();
      const initialBalance = allBalances.find(
        (b: InitialBalance) => b.item_name === item.name && b.year === year
      );

      const [
        purchases,
        pItems,
        aRequestsAtk,
        rItemsAtk,
        aRequestsNew,
        tMasukItems,
        tMasukHeaders,
        tKeluarItems,
        tKeluarHeaders,
        users
      ] = await Promise.all([
        db.purchases.toArray(),
        db.purchase_items.toArray(),
        db.atk_requests.where("status").equals("approved").toArray(),
        db.atk_request_items.toArray(),
        db.requests.where("status").equals("approved").toArray(),
        db.transfer_masuk_items.toArray(),
        db.transfer_masuk.toArray(),
        db.transfer_keluar_items.toArray(),
        db.transfer_keluar.toArray(),
        db.users.toArray()
      ]);

      const allTx: RawStockTransaction[] = [];

      for (const pi of pItems) {
        if (pi.item_name.toLowerCase() === item.name.toLowerCase()) {
          const p = purchases.find((x: Purchase) => x.id === pi.purchase_id);
          if (p) {
            const bDate = (p.book_date || p.purchase_date || "").slice(0, 10);
            const dDate = (p.document_date || p.purchase_date || "").slice(0, 10);
            if ((!dateFrom || bDate >= dateFrom) && (!dateTo || bDate <= dateTo)) {
              allTx.push({
                date: bDate,
                docDate: dDate,
                noDoc: p.document_number,
                keterangan: "Pembelian",
                unit: Number(pi.quantity) || 0,
                harga: Number(pi.unit_price) || 0,
                jumlah: Number(pi.total) || 0,
                type: "masuk",
              });
            }
          }
        }
      }

      for (const req of aRequestsAtk) {
        const items = rItemsAtk.filter((ri: ATKRequestItem) => ri.request_id === req.id);
        for (const ri of items) {
          const finalName = ri.final_item_name || ri.item_name;
          if (finalName.toLowerCase() === item.name.toLowerCase()) {
            const txDate = (req.created_at || "").slice(0, 10);
            if ((!dateFrom || txDate >= dateFrom) && (!dateTo || txDate <= dateTo)) {
              const requester = users.find((u: User) => u.id === req.requester_id);
              allTx.push({
                date: txDate,
                docDate: txDate,
                noDoc: req.document_number,
                keterangan: requester?.work_unit || "Request",
                unit: Number(ri.quantity) || 0,
                harga: 0,
                jumlah: 0,
                type: "keluar",
              });
            }
          }
        }
      }

      for (const req of aRequestsNew) {
        for (const reqItem of (req.items || [])) {
          if (reqItem.name.toLowerCase() === item.name.toLowerCase()) {
            const bDate = (req.book_date || req.submission_date || req.created_at || "").slice(0, 10);
            const dDate = (req.document_date || req.submission_date || req.created_at || "").slice(0, 10);
            if ((!dateFrom || bDate >= dateFrom) && (!dateTo || bDate <= dateTo)) {
              const requester = users.find((u: User) => u.id === req.requester_id);
              allTx.push({
                date: bDate,
                docDate: dDate,
                noDoc: req.document_number,
                keterangan: requester?.work_unit || "Permintaan",
                unit: Number(reqItem.quantity) || 0,
                harga: 0,
                jumlah: 0,
                type: "keluar",
              });
            }
          }
        }
      }

      for (const tmi of tMasukItems) {
        if (tmi.item_name.toLowerCase() === item.name.toLowerCase()) {
          const h = tMasukHeaders.find((x: TransferMasuk) => x.id === tmi.transfer_id);
          if (h) {
            const bDate = (h.book_date || h.transfer_date || "").slice(0, 10);
            const dDate = (h.document_date || h.transfer_date || "").slice(0, 10);
            if ((!dateFrom || bDate >= dateFrom) && (!dateTo || bDate <= dateTo)) {
              allTx.push({
                date: bDate,
                docDate: dDate,
                noDoc: h.document_number,
                keterangan: `Transfer Masuk (${h.source_satker})`,
                unit: Number(tmi.quantity) || 0,
                harga: Number(tmi.unit_price) || 0,
                jumlah: Number(tmi.total) || 0,
                type: "masuk",
              });
            }
          }
        }
      }

      for (const tki of tKeluarItems) {
        if (tki.item_name.toLowerCase() === item.name.toLowerCase()) {
          const h = tKeluarHeaders.find((x: TransferKeluar) => x.id === tki.transfer_id);
          if (h) {
            const bDate = (h.book_date || h.transfer_date || "").slice(0, 10);
            const dDate = (h.document_date || h.transfer_date || "").slice(0, 10);
            if ((!dateFrom || bDate >= dateFrom) && (!dateTo || bDate <= dateTo)) {
              allTx.push({
                date: bDate,
                docDate: dDate,
                noDoc: h.document_number,
                keterangan: `Transfer Keluar (${h.destination_satker})`,
                unit: Number(tki.quantity) || 0,
                harga: 0,
                jumlah: 0,
                type: "keluar",
              });
            }
          }
        }
      }

      const txList = processFifoTransactions(allTx, initialBalance, dateFrom);
      setTransactions(txList);
    } catch (err) {
      console.error("Error loading stock card:", err);
      alert("Gagal memuat kartu stok: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrintAll = async () => {
    setLoading(true);
    setPrintBatch([]);
    setIsPrintingAll(true);

    try {
      const [
        atkItemsAll,
        purchases,
        pItems,
        aRequestsAtk,
        rItemsAtk,
        aRequestsNew,
        tMasukItems,
        tMasukHeaders,
        tKeluarItems,
        tKeluarHeaders,
        users,
        allBalances
      ] = await Promise.all([
        db.atk_items.toArray(),
        db.purchases.toArray(),
        db.purchase_items.toArray(),
        db.atk_requests.where("status").equals("approved").toArray(),
        db.atk_request_items.toArray(),
        db.requests.where("status").equals("approved").toArray(),
        db.transfer_masuk_items.toArray(),
        db.transfer_masuk.toArray(),
        db.transfer_keluar_items.toArray(),
        db.transfer_keluar.toArray(),
        db.users.toArray(),
        db.initial_balances.toArray()
      ]);

      const batchesToPrint: PrintBatchItem[] = [];
      const year = dateFrom
        ? parseInt(dateFrom.split("-")[0])
        : new Date().getFullYear();

      for (const item of atkItemsAll) {
        // Collect transactions for this item
        const allTx: RawStockTransaction[] = [];

        // 1. Purchase Items
        for (const pi of pItems) {
          if (pi.item_name.toLowerCase() === item.name.toLowerCase()) {
            const p = purchases.find((x: Purchase) => x.id === pi.purchase_id);
            if (p) {
              const bDate = p.book_date || p.purchase_date;
              const dDate = p.document_date || p.purchase_date;
              if ((!dateFrom || bDate >= dateFrom) && (!dateTo || bDate <= dateTo)) {
                allTx.push({
                  date: bDate,
                  docDate: dDate,
                  noDoc: p.document_number,
                  keterangan: "Pembelian",
                  unit: Number(pi.quantity) || 0,
                  harga: Number(pi.unit_price) || 0,
                  jumlah: Number(pi.total) || 0,
                  type: "masuk",
                });
              }
            }
          }
        }

        // 2. ATK Requests
        for (const req of aRequestsAtk) {
          const items = rItemsAtk.filter((ri: ATKRequestItem) => ri.request_id === req.id);
          for (const ri of items) {
            const finalName = ri.final_item_name || ri.item_name;
            if (finalName.toLowerCase() === item.name.toLowerCase()) {
              const txDate = req.created_at.split("T")[0];
              if ((!dateFrom || txDate >= dateFrom) && (!dateTo || txDate <= dateTo)) {
                const requester = users.find((u: User) => u.id === req.requester_id);
                allTx.push({
                  date: txDate,
                  docDate: txDate,
                  noDoc: req.document_number,
                  keterangan: requester?.work_unit || "Request",
                  unit: Number(ri.quantity) || 0,
                  harga: 0,
                  jumlah: 0,
                  type: "keluar",
                });
              }
            }
          }
        }

        // 3. New requests
        for (const req of aRequestsNew) {
          for (const reqItem of (req.items || [])) {
            if (reqItem.name.toLowerCase() === item.name.toLowerCase()) {
              const bDate = req.book_date || req.submission_date || req.created_at.split("T")[0];
              const dDate = req.document_date || req.submission_date || req.created_at.split("T")[0];
              if ((!dateFrom || bDate >= dateFrom) && (!dateTo || bDate <= dateTo)) {
                const requester = users.find((u: User) => u.id === req.requester_id);
                allTx.push({
                  date: bDate,
                  docDate: dDate,
                  noDoc: req.document_number,
                  keterangan: requester?.work_unit || "Permintaan",
                  unit: Number(reqItem.quantity) || 0,
                  harga: 0,
                  jumlah: 0,
                  type: "keluar",
                });
              }
            }
          }
        }

        // 4. Transfer Masuk Items
        for (const tmi of tMasukItems) {
          if (tmi.item_name.toLowerCase() === item.name.toLowerCase()) {
            const h = tMasukHeaders.find((x: TransferMasuk) => x.id === tmi.transfer_id);
            if (h) {
              const bDate = h.book_date || h.transfer_date;
              const dDate = h.document_date || h.transfer_date;
              if ((!dateFrom || bDate >= dateFrom) && (!dateTo || bDate <= dateTo)) {
                allTx.push({
                  date: bDate,
                  docDate: dDate,
                  noDoc: h.document_number,
                  keterangan: `Transfer Masuk (${h.source_satker})`,
                  unit: Number(tmi.quantity) || 0,
                  harga: Number(tmi.unit_price) || 0,
                  jumlah: Number(tmi.total) || 0,
                  type: "masuk",
                });
              }
            }
          }
        }

        // 5. Transfer Keluar Items
        for (const tki of tKeluarItems) {
          if (tki.item_name.toLowerCase() === item.name.toLowerCase()) {
            const h = tKeluarHeaders.find((x: TransferKeluar) => x.id === tki.transfer_id);
            if (h) {
              const bDate = h.book_date || h.transfer_date;
              const dDate = h.document_date || h.transfer_date;
              if ((!dateFrom || bDate >= dateFrom) && (!dateTo || bDate <= dateTo)) {
                allTx.push({
                  date: bDate,
                  docDate: dDate,
                  noDoc: h.document_number,
                  keterangan: `Transfer Keluar (${h.destination_satker})`,
                  unit: Number(tki.quantity) || 0,
                  harga: 0,
                  jumlah: 0,
                  type: "keluar",
                });
              }
            }
          }
        }

        // ONLY print if there are actual transactions in the period!
        if (allTx.length === 0) {
          continue;
        }

        const initialBalance = allBalances.find(
          (b: InitialBalance) => b.item_name === item.name && b.year === year
        );

        const txList = processFifoTransactions(allTx, initialBalance, dateFrom);
        batchesToPrint.push({ item, transactions: txList });
      }

      if (batchesToPrint.length === 0) {
        alert("Tidak ada barang yang memiliki transaksi pada periode ini.");
        setIsPrintingAll(false);
        return;
      }

      setPrintBatch(batchesToPrint);

      // Trigger standard print in React callback timing
      setTimeout(() => {
        window.print();
        // Reset states after print dialog closes
        setIsPrintingAll(false);
        setPrintBatch([]);
      }, 500);

    } catch (err) {
      console.error("Error generating batch stock cards:", err);
      alert("Gagal memuat cetakan semua kartu stok: " + (err as Error).message);
      setIsPrintingAll(false);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = searchQuery.trim() === "" 
    ? atkItems.slice(0, 50) 
    : atkItems.filter(item => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.item_code && item.item_code.toLowerCase().includes(searchQuery.toLowerCase()))
      ).slice(0, 100);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("id-ID", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(num);
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat("id-ID", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const handlePrint = () => window.print();

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 print:hidden shadow-sm">
        <h1 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <FileSpreadsheet className="text-blue-600" />
          Kartu Kendali Persediaan
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="md:col-span-2 relative" ref={dropdownRef}>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Cari Nama Barang (bisa diketik)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={18} className="text-slate-400" />
              </div>
              <input 
                type="text"
                placeholder={selectedItemId ? atkItems.find(i => i.id === selectedItemId)?.name : "Ketik minimal 3 huruf..."}
                value={searchQuery}
                onFocus={() => setIsDropdownOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsDropdownOpen(true);
                }}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none transition-all"
              />
              { (searchQuery || selectedItemId) && (
                <button 
                  onClick={() => { setSelectedItemId(null); setSearchQuery(""); }}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-red-500"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {isDropdownOpen && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                {filteredItems.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 italic">Barang tidak ditemukan</div>
                ) : (
                  filteredItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setSelectedItemId(item.id!);
                        setSearchQuery("");
                        setIsDropdownOpen(false);
                      }}
                      className={`px-4 py-2.5 cursor-pointer hover:bg-blue-50 flex flex-col ${selectedItemId === item.id ? 'bg-blue-50' : ''}`}
                    >
                      <span className="font-semibold text-slate-800">{item.name}</span>
                      <span className="text-xs text-slate-500">{item.item_code || "Tanpa Kode"} • {item.unit}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1"> Dari Tanggal </label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1"> Sampai Tanggal </label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none" />
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={loadStockCard} disabled={!selectedItemId || loading} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md shadow-blue-100 active:scale-95">
            {loading ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" /> : <FileSpreadsheet size={20} />}
            {loading ? "Memuat..." : "Tampilkan"}
          </button>

          <button 
            onClick={handlePrintAll} 
            disabled={loading} 
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-md shadow-emerald-100 active:scale-95"
          >
            <Printer size={20} /> Cetak Semua
          </button>
          
          {transactions.length > 0 && (
            <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all shadow-md shadow-slate-200 active:scale-95">
              <Printer size={20} /> Cetak / Print
            </button>
          )}
        </div>
      </div>

      {transactions.length > 0 && selectedItem && !isPrintingAll && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden print:border-none print:rounded-none shadow-sm card-container">
          <div className="p-6 text-center border-b border-slate-200 bg-cyan-50 print:bg-cyan-50 print:p-2">
            <h2 className="text-xl font-bold text-slate-800 print:text-base"> KARTU KENDALI PERSEDIAAN </h2>
            <p className="text-sm text-slate-600 print:text-xs"> PERIODE {formatDate(dateFrom)} S/D {formatDate(dateTo)} </p>
          </div>
          <div className="p-4 grid grid-cols-2 gap-4 text-[10px] border-b border-slate-200 print:p-2 print:text-[8.5px] print:leading-tight">
            <div>
              <p><strong>NAMA UAKPB</strong>: BADAN PUSAT STATISTIK KEPULAUAN SERIBU</p>
              <p><strong>KODE UAKPB</strong>: 054.01.0100.539164</p>
              <p><strong>METODE PENCATATAN</strong>: PERPETUAL</p>
              <p><strong>METODE PENILAIAN</strong>: FIFO</p>
            </div>
            <div className="text-right">
              <p><strong>KODE BARANG</strong>: {selectedItem.item_code || "-"}</p>
              <p><strong>NAMA BARANG</strong>: {selectedItem.name.toUpperCase()}</p>
              <p><strong>SATUAN</strong>: {selectedItem.unit.toUpperCase()}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[9px] border-collapse print:text-[8px]">
              <thead className="bg-cyan-100">
                <tr>
                  <th rowSpan={2} className="border border-slate-300 px-1 py-1 w-6 print:py-0.5">No</th>
                  <th rowSpan={2} className="border border-slate-300 px-1 py-1 w-14 print:py-0.5">Tgl Dok</th>
                  <th rowSpan={2} className="border border-slate-300 px-1 py-1 w-14 print:py-0.5">Tgl Buku</th>
                  <th rowSpan={2} className="border border-slate-300 px-1 py-1 print:py-0.5">Keterangan</th>
                  <th rowSpan={2} className="border border-slate-300 px-1 py-1 w-20 print:py-0.5">No Dok</th>
                  <th colSpan={3} className="border border-slate-300 px-1 py-1 bg-cyan-200 print:py-0.5">Masuk</th>
                  <th colSpan={3} className="border border-slate-300 px-1 py-1 bg-cyan-200 print:py-0.5">Keluar</th>
                  <th colSpan={3} className="border border-slate-300 px-1 py-1 bg-cyan-200 print:py-0.5">Saldo</th>
                </tr>
                <tr className="bg-cyan-100 font-bold">
                  <th className="border border-slate-300 px-1 py-1 print:py-0.5">U</th><th className="border border-slate-300 px-1 py-1 print:py-0.5">Harga</th><th className="border border-slate-300 px-1 py-1 print:py-0.5">Jumlah</th>
                  <th className="border border-slate-300 px-1 py-1 print:py-0.5">U</th><th className="border border-slate-300 px-1 py-1 print:py-0.5">Harga</th><th className="border border-slate-300 px-1 py-1 print:py-0.5">Jumlah</th>
                  <th className="border border-slate-300 px-1 py-1 print:py-0.5">U</th><th className="border border-slate-300 px-1 py-1 print:py-0.5">Harga</th><th className="border border-slate-300 px-1 py-1 print:py-0.5">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, idx) => (
                  <tr key={idx} className={tx.isSaldoRow ? "bg-cyan-50 font-bold" : "hover:bg-slate-50"}>
                    <td className="border border-slate-300 px-1 py-1 text-center print:py-0.5">{tx.no || ""}</td>
                    <td className="border border-slate-300 px-1 py-1 text-center print:py-0.5">{tx.isSaldoRow ? "" : formatDate(tx.docDate || tx.date)}</td>
                    <td className="border border-slate-300 px-1 py-1 text-center font-medium print:py-0.5">{formatDate(tx.date)}</td>
                    <td className="border border-slate-300 px-1 py-1 print:py-0.5">{tx.keterangan}</td>
                    <td className="border border-slate-300 px-1 py-1 print:py-0.5">{tx.noDoc}</td>
                    <td className="border border-slate-300 px-1 py-1 text-right print:py-0.5">{tx.masukUnit ? formatNumber(tx.masukUnit) : (tx.isSaldoRow ? "" : "0")}</td>
                    <td className="border border-slate-300 px-1 py-1 text-right print:py-0.5">{tx.masukHarga ? formatCurrency(tx.masukHarga) : ""}</td>
                    <td className="border border-slate-300 px-1 py-1 text-right print:py-0.5">{tx.masukJumlah ? formatCurrency(tx.masukJumlah) : ""}</td>
                    <td className="border border-slate-300 px-1 py-1 text-right print:py-0.5">{tx.keluarUnit ? formatNumber(tx.keluarUnit) : (tx.isSaldoRow ? "" : "0")}</td>
                    <td className="border border-slate-300 px-1 py-1 text-right print:py-0.5">{tx.keluarHarga ? formatCurrency(tx.keluarHarga) : ""}</td>
                    <td className="border border-slate-300 px-1 py-1 text-right print:py-0.5">{tx.keluarJumlah ? formatCurrency(tx.keluarJumlah) : ""}</td>
                    <td className="border border-slate-300 px-1 py-1 text-right font-bold print:py-0.5">{formatNumber(tx.saldoUnit)}</td>
                    <td className="border border-slate-300 px-1 py-1 text-right print:py-0.5">{tx.saldoHarga ? formatCurrency(tx.saldoHarga) : ""}</td>
                    <td className="border border-slate-300 px-1 py-1 text-right font-bold text-cyan-700 print:py-0.5">{tx.saldoJumlah ? formatCurrency(tx.saldoJumlah) : "0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* FOOTER PENGESAHAN & QR CODE VERIFIKASI RESMI KARTU KENDALI */}
          <div className="p-4 bg-white border-t border-slate-200 print:border-slate-300 print:p-1.5 print:mt-1">
            <div className="flex items-center justify-between text-[9px] print:text-[8px]">
              {/* Bagian Kiri: QR Code & Link Verifikasi */}
              <div className="flex items-center gap-2.5">
                <div className="border border-slate-300 p-0.5 bg-white shrink-0">
                  <QRCodeImage
                    text={`${window.location.origin}/verify/stock-card/${selectedItem.id}${dateFrom ? `?from=${dateFrom}&to=${dateTo}` : ""}`}
                    size={42}
                  />
                </div>
                <div className="space-y-0.5 leading-tight text-slate-700">
                  <div className="font-bold uppercase tracking-wider text-black text-[8px]">
                    Otentikasi Kartu Kendali Digital &bull; SATRIA BPS Kepulauan Seribu
                  </div>
                  <div className="text-[7.5px]">
                    Kartu Kendali Persediaan ini dicatat dan diverifikasi secara elektronik melalui Sistem SATRIA ATK.
                  </div>
                  <div className="text-[7.5px]">
                    Pindai QR Code atau akses tautan:{" "}
                    <span className="font-mono font-semibold text-blue-700 underline">
                      {`${window.location.origin}/verify/stock-card/${selectedItem.id}${dateFrom ? `?from=${dateFrom}&to=${dateTo}` : ""}`}
                    </span>
                  </div>
                  <div className="text-[7px] text-slate-500 font-mono">
                    Dicetak: {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {printBatch.length > 0 && (
        <div className="hidden print:block space-y-8 bg-white print:bg-white print:p-0">
          {printBatch.map((batch, batchIdx) => (
            <div key={batchIdx} className="page-break bg-white p-6 border-b border-slate-200 print:border-none print:p-0 card-container">
              <div className="text-center border-b border-slate-200 bg-cyan-50 p-4 print:bg-cyan-50 print:p-2">
                <h2 className="text-xl font-bold text-slate-800 print:text-base"> KARTU KENDALI PERSEDIAAN </h2>
                <p className="text-sm text-slate-600 print:text-xs"> PERIODE {formatDate(dateFrom)} S/D {formatDate(dateTo)} </p>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4 text-[10px] border-b border-slate-200 print:p-2 print:text-[8.5px] print:leading-tight">
                <div>
                  <p><strong>NAMA UAKPB</strong>: BADAN PUSAT STATISTIK KEPULAUAN SERIBU</p>
                  <p><strong>KODE UAKPB</strong>: 054.01.0100.539164</p>
                  <p><strong>METODE PENCATATAN</strong>: PERPETUAL</p>
                  <p><strong>METODE PENILAIAN</strong>: FIFO</p>
                </div>
                <div className="text-right">
                  <p><strong>KODE BARANG</strong>: {batch.item.item_code || "-"}</p>
                  <p><strong>NAMA BARANG</strong>: {batch.item.name.toUpperCase()}</p>
                  <p><strong>SATUAN</strong>: {batch.item.unit.toUpperCase()}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[9px] border-collapse print:text-[8px]">
                  <thead className="bg-cyan-100">
                    <tr>
                      <th rowSpan={2} className="border border-slate-300 px-1 py-1 w-6 print:py-0.5">No</th>
                      <th rowSpan={2} className="border border-slate-300 px-1 py-1 w-14 print:py-0.5">Tgl Dok</th>
                      <th rowSpan={2} className="border border-slate-300 px-1 py-1 w-14 print:py-0.5">Tgl Buku</th>
                      <th rowSpan={2} className="border border-slate-300 px-1 py-1 print:py-0.5">Keterangan</th>
                      <th rowSpan={2} className="border border-slate-300 px-1 py-1 w-20 print:py-0.5">No Dok</th>
                      <th colSpan={3} className="border border-slate-300 px-1 py-1 bg-cyan-200 print:py-0.5">Masuk</th>
                      <th colSpan={3} className="border border-slate-300 px-1 py-1 bg-cyan-200 print:py-0.5">Keluar</th>
                      <th colSpan={3} className="border border-slate-300 px-1 py-1 bg-cyan-200 print:py-0.5">Saldo</th>
                    </tr>
                    <tr className="bg-cyan-100 font-bold">
                      <th className="border border-slate-300 px-1 py-1 print:py-0.5">U</th><th className="border border-slate-300 px-1 py-1 print:py-0.5">Harga</th><th className="border border-slate-300 px-1 py-1 print:py-0.5">Jumlah</th>
                      <th className="border border-slate-300 px-1 py-1 print:py-0.5">U</th><th className="border border-slate-300 px-1 py-1 print:py-0.5">Harga</th><th className="border border-slate-300 px-1 py-1 print:py-0.5">Jumlah</th>
                      <th className="border border-slate-300 px-1 py-1 print:py-0.5">U</th><th className="border border-slate-300 px-1 py-1 print:py-0.5">Harga</th><th className="border border-slate-300 px-1 py-1 print:py-0.5">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.transactions.map((tx, idx) => (
                      <tr key={idx} className={tx.isSaldoRow ? "bg-cyan-50 font-bold" : "hover:bg-slate-50"}>
                        <td className="border border-slate-300 px-1 py-1 text-center print:py-0.5">{tx.no || ""}</td>
                        <td className="border border-slate-300 px-1 py-1 text-center print:py-0.5">{tx.isSaldoRow ? "" : formatDate(tx.docDate || tx.date)}</td>
                        <td className="border border-slate-300 px-1 py-1 text-center font-medium print:py-0.5">{formatDate(tx.date)}</td>
                        <td className="border border-slate-300 px-1 py-1 print:py-0.5">{tx.keterangan}</td>
                        <td className="border border-slate-300 px-1 py-1 print:py-0.5">{tx.noDoc}</td>
                        <td className="border border-slate-300 px-1 py-1 text-right print:py-0.5">{tx.masukUnit ? formatNumber(tx.masukUnit) : (tx.isSaldoRow ? "" : "0")}</td>
                        <td className="border border-slate-300 px-1 py-1 text-right print:py-0.5">{tx.masukHarga ? formatCurrency(tx.masukHarga) : ""}</td>
                        <td className="border border-slate-300 px-1 py-1 text-right print:py-0.5">{tx.masukJumlah ? formatCurrency(tx.masukJumlah) : ""}</td>
                        <td className="border border-slate-300 px-1 py-1 text-right print:py-0.5">{tx.keluarUnit ? formatNumber(tx.keluarUnit) : (tx.isSaldoRow ? "" : "0")}</td>
                        <td className="border border-slate-300 px-1 py-1 text-right print:py-0.5">{tx.keluarHarga ? formatCurrency(tx.keluarHarga) : ""}</td>
                        <td className="border border-slate-300 px-1 py-1 text-right print:py-0.5">{tx.keluarJumlah ? formatCurrency(tx.keluarJumlah) : ""}</td>
                        <td className="border border-slate-300 px-1 py-1 text-right font-bold print:py-0.5">{formatNumber(tx.saldoUnit)}</td>
                        <td className="border border-slate-300 px-1 py-1 text-right print:py-0.5">{tx.saldoHarga ? formatCurrency(tx.saldoHarga) : ""}</td>
                        <td className="border border-slate-300 px-1 py-1 text-right font-bold text-cyan-700 print:py-0.5">{tx.saldoJumlah ? formatCurrency(tx.saldoJumlah) : "0"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* FOOTER PENGESAHAN & QR CODE VERIFIKASI RESMI BATCH */}
              <div className="mt-4 pt-2 border-t border-slate-300 print:p-1.5 print:mt-1">
                <div className="flex items-center justify-between text-[9px] print:text-[8px]">
                  <div className="flex items-center gap-2.5">
                    <div className="border border-slate-300 p-0.5 bg-white shrink-0">
                      <QRCodeImage
                        text={`${window.location.origin}/verify/stock-card/${batch.item.id}${dateFrom ? `?from=${dateFrom}&to=${dateTo}` : ""}`}
                        size={42}
                      />
                    </div>
                    <div className="space-y-0.5 leading-tight text-slate-700">
                      <div className="font-bold uppercase tracking-wider text-black text-[8px]">
                        Otentikasi Kartu Kendali Digital &bull; SATRIA BPS Kepulauan Seribu
                      </div>
                      <div className="text-[7.5px]">
                        Kartu Kendali Persediaan ini dicatat dan diverifikasi secara elektronik melalui Sistem SATRIA ATK.
                      </div>
                      <div className="text-[7.5px]">
                        Pindai QR Code atau akses tautan:{" "}
                        <span className="font-mono font-semibold text-blue-700 underline">
                          {`${window.location.origin}/verify/stock-card/${batch.item.id}${dateFrom ? `?from=${dateFrom}&to=${dateTo}` : ""}`}
                        </span>
                      </div>
                      <div className="text-[7px] text-slate-500 font-mono">
                        Dicetak: {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {transactions.length === 0 && !loading && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <FileSpreadsheet size={48} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500"> Pilih barang dan klik "Tampilkan" untuk melihat kartu kendali </p>
        </div>
      )}

      <style>{`
        @page {
          size: A4 landscape;
          margin: 6mm 8mm;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .page-break { page-break-after: always; break-after: page; }
          .card-container { break-inside: avoid !important; page-break-inside: avoid !important; }
        }
      `}</style>
    </div>
  );
}
