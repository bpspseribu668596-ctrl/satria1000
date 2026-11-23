import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import {
  db,
  type ATKItem,
  type Settings,
  type InitialBalance,
  type Purchase,
  type ATKRequestItem,
  type TransferMasuk,
  type TransferKeluar,
  type User,
} from "../lib/db";
import {
  CheckCircle2,
  ShieldCheck,
  FileSpreadsheet,
  ArrowRight,
  Package,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
} from "lucide-react";
import QRCodeImage from "../components/QRCodeImage";
import { processFifoTransactions, type RawStockTx, type CalculatedStockTx as StockTransaction } from "../lib/stockCalculations";

type RawStockTransaction = RawStockTx;

export default function PublicVerifyStockCard() {
  const { itemId } = useParams<{ itemId?: string }>();
  const [searchParams] = useSearchParams();
  const effectiveItemId = itemId || searchParams.get("item_id");

  const dateFromParam = searchParams.get("from") || "";
  const dateToParam = searchParams.get("to") || "";

  const [item, setItem] = useState<ATKItem | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [effectiveItemId, dateFromParam, dateToParam]);

  const loadData = async () => {
    if (!effectiveItemId) {
      setError("Parameter identifikasi barang tidak ditemukan.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const idNum = parseInt(effectiveItemId);
      const [fetchedItem, sett] = await Promise.all([
        db.atk_items.get(idNum),
        db.settings.get(1),
      ]);

      if (!fetchedItem) {
        setError("Data kartu kendali barang tidak ditemukan dalam sistem SATRIA.");
        setLoading(false);
        return;
      }

      setItem(fetchedItem);
      setSettings(sett || null);

      // Hitung kartu stok FIFO identik dengan modul StockCard
      await calculateStock(fetchedItem, dateFromParam, dateToParam);
    } catch (err) {
      setError("Gagal memuat data verifikasi kartu kendali: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const calculateStock = async (
    targetItem: ATKItem,
    dateFrom: string,
    dateTo: string
  ) => {
    const year = dateFrom ? parseInt(dateFrom.split("-")[0]) : new Date().getFullYear();

    const allBalances = await db.initial_balances.toArray();
    const initialBalance = allBalances.find(
      (b: InitialBalance) => b.item_name === targetItem.name && b.year === year
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
      users,
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
      db.users.toArray(),
    ]);

    const allTx: RawStockTransaction[] = [];

    // 1. Pembelian
    for (const pi of pItems) {
      if (pi.item_name.toLowerCase() === targetItem.name.toLowerCase()) {
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

    // 2. Permintaan ATK Lama
    for (const req of aRequestsAtk) {
      const items = rItemsAtk.filter((ri: ATKRequestItem) => ri.request_id === req.id);
      for (const ri of items) {
        const finalName = ri.final_item_name || ri.item_name;
        if (finalName.toLowerCase() === targetItem.name.toLowerCase()) {
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

    // 3. Permintaan ATK Baru
    for (const req of aRequestsNew) {
      for (const reqItem of req.items || []) {
        if (reqItem.name.toLowerCase() === targetItem.name.toLowerCase()) {
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

    // 4. Transfer Masuk
    for (const tmi of tMasukItems) {
      if (tmi.item_name.toLowerCase() === targetItem.name.toLowerCase()) {
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

    // 5. Transfer Keluar
    for (const tki of tKeluarItems) {
      if (tki.item_name.toLowerCase() === targetItem.name.toLowerCase()) {
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
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("id-ID", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat("id-ID", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  // Ringkasan transaksi
  const totalMasukUnit = transactions
    .filter((t) => !t.isSaldoRow)
    .reduce((acc, t) => acc + (t.masukUnit || 0), 0);
  const totalMasukRp = transactions
    .filter((t) => !t.isSaldoRow)
    .reduce((acc, t) => acc + (t.masukJumlah || 0), 0);

  const totalKeluarUnit = transactions
    .filter((t) => !t.isSaldoRow)
    .reduce((acc, t) => acc + (t.keluarUnit || 0), 0);
  const totalKeluarRp = transactions
    .filter((t) => !t.isSaldoRow)
    .reduce((acc, t) => acc + (t.keluarJumlah || 0), 0);

  const finalSaldo = transactions.length > 0 ? transactions[transactions.length - 1] : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-slate-200">
          <div className="w-12 h-12 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-800">Memverifikasi Kartu Kendali...</h2>
          <p className="text-xs text-slate-500 mt-1">
            Mengambil data mutasi persediaan SATRIA BPS Kota Jakarta Selatan
          </p>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-red-200">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileSpreadsheet size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Barang Tidak Ditemukan</h2>
          <p className="text-sm text-slate-600 mt-2">{error || "Data kartu kendali tidak valid."}</p>
          <Link
            to="/login"
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-semibold hover:bg-cyan-700 transition-colors"
          >
            Masuk ke Aplikasi SATRIA <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-cyan-50/40 to-slate-100 py-8 px-4 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header Branding */}
        <div className="flex items-center justify-between bg-white px-6 py-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="Logo BPS" className="h-10 w-10 object-contain" />
            ) : (
              <div className="w-10 h-10 bg-cyan-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                BPS
              </div>
            )}
            <div>
              <h1 className="font-extrabold text-sm uppercase tracking-wide text-slate-900">
                {settings?.org_name || "BPS Kota Jakarta Selatan"}
              </h1>
              <p className="text-xs text-cyan-700 font-semibold">
                Sistem Informasi Pengelolaan ATK (SATRIA)
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            <ShieldCheck size={14} /> Otentikasi Sah
          </span>
        </div>

        {/* Certificate Card */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          {/* Certificate Banner */}
          <div className="bg-gradient-to-r from-cyan-700 via-teal-700 to-blue-800 p-6 text-white text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl mb-3 shadow-inner">
              <CheckCircle2 size={32} className="text-white" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight uppercase">
              KARTU KENDALI PERSEDIAAN DIGITAL
            </h2>
            <p className="text-xs sm:text-sm text-cyan-100 mt-1 max-w-md mx-auto">
              Dokumen pencatatan mutasi persediaan ini sah dan tercatat secara real-time pada Sistem Basis Data SATRIA
            </p>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {/* Meta Informasi Komoditas */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Nama Komoditas Barang
                  </span>
                  <div className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                    <Package className="text-cyan-600 shrink-0" size={22} />
                    {item.name}
                  </div>
                </div>
                <div className="sm:text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Kode Barang (BMN)
                  </span>
                  <div className="font-mono font-bold text-slate-800 text-sm sm:text-base">
                    {item.item_code || "Tanpa Kode BMN"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 font-semibold block text-[11px]">Satuan</span>
                  <span className="font-bold text-slate-800 uppercase">{item.unit}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[11px]">Kode UAKPB</span>
                  <span className="font-bold text-slate-800 font-mono">054.01.0100.539163</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[11px]">Metode Pencatatan</span>
                  <span className="font-bold text-slate-800">PERPETUAL</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[11px]">Metode Penilaian</span>
                  <span className="font-bold text-cyan-700">FIFO</span>
                </div>
              </div>

              {(dateFromParam || dateToParam) && (
                <div className="pt-2 border-t border-slate-200 text-xs flex items-center gap-2 text-slate-600">
                  <Calendar size={14} className="text-slate-400" />
                  <span>
                    Periode: <strong>{formatDate(dateFromParam)}</strong> s/d{" "}
                    <strong>{formatDate(dateToParam)}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Stat Cards Ringkasan */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Masuk */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4">
                <div className="flex items-center justify-between text-emerald-800 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">Total Masuk</span>
                  <ArrowDownLeft size={18} className="text-emerald-600" />
                </div>
                <div className="text-2xl font-black text-emerald-950 font-mono">
                  {formatNumber(totalMasukUnit)} <span className="text-xs font-normal text-emerald-700 uppercase">{item.unit}</span>
                </div>
                <div className="text-xs font-semibold text-emerald-700 mt-1">
                  Rp {formatCurrency(totalMasukRp)}
                </div>
              </div>

              {/* Keluar */}
              <div className="bg-orange-50/70 border border-orange-200 rounded-2xl p-4">
                <div className="flex items-center justify-between text-orange-800 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">Total Keluar</span>
                  <ArrowUpRight size={18} className="text-orange-600" />
                </div>
                <div className="text-2xl font-black text-orange-950 font-mono">
                  {formatNumber(totalKeluarUnit)} <span className="text-xs font-normal text-orange-700 uppercase">{item.unit}</span>
                </div>
                <div className="text-xs font-semibold text-orange-700 mt-1">
                  Rp {formatCurrency(totalKeluarRp)}
                </div>
              </div>

              {/* Saldo Akhir */}
              <div className="bg-cyan-50 border border-cyan-200 rounded-2xl p-4">
                <div className="flex items-center justify-between text-cyan-800 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">Sisa Saldo Akhir</span>
                  <Layers size={18} className="text-cyan-600" />
                </div>
                <div className="text-2xl font-black text-cyan-950 font-mono">
                  {finalSaldo ? formatNumber(finalSaldo.saldoUnit) : "0"} <span className="text-xs font-normal text-cyan-700 uppercase">{item.unit}</span>
                </div>
                <div className="text-xs font-semibold text-cyan-700 mt-1">
                  Rp {finalSaldo ? formatCurrency(finalSaldo.saldoJumlah) : "0"}
                </div>
              </div>
            </div>

            {/* Tabel Rincian Mutasi Kartu Kendali */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Rincian Mutasi Transaksi ({transactions.filter((t) => !t.isSaldoRow).length} Transaksi)
                </h3>
                <span className="text-[10px] text-slate-400 italic">Geser tabel untuk melihat seluruh kolom</span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
                <table className="w-full text-[11px] border-collapse bg-white">
                  <thead className="bg-cyan-100 text-slate-800 text-center font-bold">
                    <tr>
                      <th rowSpan={2} className="border border-slate-200 px-2 py-1.5 w-10">No</th>
                      <th rowSpan={2} className="border border-slate-200 px-2.5 py-1.5 w-24">Tgl Dok</th>
                      <th rowSpan={2} className="border border-slate-200 px-2.5 py-1.5 w-24">Tgl Buku</th>
                      <th rowSpan={2} className="border border-slate-200 px-3 py-1.5 text-left">Keterangan</th>
                      <th rowSpan={2} className="border border-slate-200 px-2.5 py-1.5 w-28">No Dok</th>
                      <th colSpan={3} className="border border-slate-200 px-2 py-1 bg-cyan-200">Masuk</th>
                      <th colSpan={3} className="border border-slate-200 px-2 py-1 bg-cyan-200">Keluar</th>
                      <th colSpan={3} className="border border-slate-200 px-2 py-1 bg-cyan-200">Saldo</th>
                    </tr>
                    <tr className="bg-cyan-100 text-[10px]">
                      <th className="border border-slate-200 px-1.5 py-1">Unit</th>
                      <th className="border border-slate-200 px-1.5 py-1">Harga (Rp)</th>
                      <th className="border border-slate-200 px-1.5 py-1">Jumlah (Rp)</th>
                      <th className="border border-slate-200 px-1.5 py-1">Unit</th>
                      <th className="border border-slate-200 px-1.5 py-1">Harga (Rp)</th>
                      <th className="border border-slate-200 px-1.5 py-1">Jumlah (Rp)</th>
                      <th className="border border-slate-200 px-1.5 py-1">Unit</th>
                      <th className="border border-slate-200 px-1.5 py-1">Harga (Rp)</th>
                      <th className="border border-slate-200 px-1.5 py-1">Jumlah (Rp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, idx) => (
                      <tr
                        key={idx}
                        className={
                          tx.isSaldoRow
                            ? "bg-cyan-50/80 font-bold text-slate-900"
                            : "hover:bg-slate-50 text-slate-800"
                        }
                      >
                        <td className="border border-slate-200 px-2 py-1.5 text-center">{tx.no || ""}</td>
                        <td className="border border-slate-200 px-2 py-1.5 text-center">
                          {tx.isSaldoRow ? "" : formatDate(tx.docDate || tx.date)}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 text-center font-medium">
                          {formatDate(tx.date)}
                        </td>
                        <td className="border border-slate-200 px-3 py-1.5">{tx.keterangan}</td>
                        <td className="border border-slate-200 px-2.5 py-1.5 font-mono text-[10px]">{tx.noDoc}</td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right font-mono">
                          {tx.masukUnit ? formatNumber(tx.masukUnit) : tx.isSaldoRow ? "" : "0"}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right font-mono text-[10px]">
                          {tx.masukHarga ? formatCurrency(tx.masukHarga) : ""}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right font-mono text-[10px]">
                          {tx.masukJumlah ? formatCurrency(tx.masukJumlah) : ""}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right font-mono">
                          {tx.keluarUnit ? formatNumber(tx.keluarUnit) : tx.isSaldoRow ? "" : "0"}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right font-mono text-[10px]">
                          {tx.keluarHarga ? formatCurrency(tx.keluarHarga) : ""}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right font-mono text-[10px]">
                          {tx.keluarJumlah ? formatCurrency(tx.keluarJumlah) : ""}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right font-bold font-mono">
                          {formatNumber(tx.saldoUnit)}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right font-mono text-[10px]">
                          {tx.saldoHarga ? formatCurrency(tx.saldoHarga) : ""}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right font-bold font-mono text-cyan-800 text-[10px]">
                          {tx.saldoJumlah ? formatCurrency(tx.saldoJumlah) : "0"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pengesahan Pejabat Penanggung Jawab */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-white border border-slate-300 rounded-xl shadow-sm shrink-0">
                  <QRCodeImage text={window.location.href} size={64} />
                </div>
                <div className="space-y-1 text-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-700 block">
                    Otentikasi Digital
                  </span>
                  <div className="font-bold text-slate-800">
                    Sistem SATRIA BPS Kota Jakarta Selatan
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Dicatat secara elektronik dan sah sesuai kaidah penatausahaan persediaan BMN.
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    Diverifikasi: {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                  </div>
                </div>
              </div>

              <div className="text-center sm:text-right space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Mengetahui,
                </span>
                <div className="font-bold text-slate-800 text-sm">
                  {settings?.official_job && settings.official_job !== "Pejabat Pembuat Komitmen"
                    ? settings.official_job
                    : "Kepala Subbagian Umum"}
                </div>
                <div className="font-bold underline text-slate-900 text-sm pt-4">
                  {settings?.official_name || "................................................"}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {settings?.official_nip ? `NIP. ${settings.official_nip}` : "NIP. -"}
                </div>
              </div>
            </div>

            {/* Login Link for Registered Staff */}
            <div className="pt-2 text-center">
              <Link
                to="/login"
                className="text-xs text-slate-500 hover:text-cyan-700 font-medium inline-flex items-center gap-1.5 transition-colors"
              >
                Petugas / Pengelola BPS? Masuk ke Sistem SATRIA <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>

        {/* Legal Disclaimer */}
        <p className="text-center text-slate-400 text-[11px] leading-relaxed">
          Dokumen verifikasi ini diterbitkan secara otomatis melalui Sistem Informasi SATRIA
          Badan Pusat Statistik Kota Jakarta Selatan dan diakui secara sah untuk keperluan
          pemeriksaan, rekonsiliasi, dan audit persediaan BMN.
        </p>
      </div>
    </div>
  );
}
