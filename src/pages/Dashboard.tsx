/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db, type Request } from "../lib/db";
import {
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  ListChecks,
  ShieldCheck,
  Package,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";

interface StockItem {
  item_name: string;
  category: string;
  unit: string;
  stock_in: number;
  stock_out: number;
  stock_balance: number;
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  // Stok — hanya untuk role yang relevan
  const canViewStock = user?.role?.some((r) =>
    ["admin", "operator", "penanggungjawab"].includes(r)
  );
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockFilter, setStockFilter] = useState("");
  const [stockLoading, setStockLoading] = useState(false);

  const loadData = async () => {
    try {
      const all = await db.requests.orderBy("created_at").reverse().toArray();
      setRequests(all || []);
    } catch (err) {
      console.error("Dashboard loadData error:", err);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const calculateStock = async () => {
    setStockLoading(true);
    try {
      const masterItems = await db.atk_items.toArray();
      const currentYear = new Date().getFullYear();

      const [initialBalances, purchaseItems, approvedRequests, transferMasukItems, transferKeluarItems] = await Promise.all([
        db.initial_balances.where("year").equals(currentYear).toArray(),
        db.purchase_items.toArray(),
        db.requests.where("status").equals("approved").toArray(),
        db.transfer_masuk_items.toArray(),
        db.transfer_keluar_items.toArray(),
      ]);

      const stockMap = new Map<string, StockItem>();

      const getOrCreate = (name: string, unit: string, cat = "") => {
        const key = name.toLowerCase();
        if (!stockMap.has(key)) {
          stockMap.set(key, { item_name: name, category: cat, unit: unit || "", stock_in: 0, stock_out: 0, stock_balance: 0 });
        }
        return stockMap.get(key)!;
      };

      for (const b of initialBalances) { getOrCreate(b.item_name, b.unit).stock_in += Number(b.quantity) || 0; }
      for (const p of purchaseItems)   { getOrCreate(p.item_name, p.unit).stock_in += Number(p.quantity) || 0; }
      for (const t of transferMasukItems) { getOrCreate(t.item_name, t.unit).stock_in += Number(t.quantity) || 0; }
      for (const t of transferKeluarItems) { getOrCreate(t.item_name, t.unit).stock_out += Number(t.quantity) || 0; }
      for (const req of approvedRequests) {
        for (const ri of (req.items || [])) { getOrCreate(ri.name, ri.unit).stock_out += Number(ri.quantity) || 0; }
      }

      // Enrichment dari Master ATK
      for (const m of masterItems) {
        const item = getOrCreate(m.name, m.unit, m.item_code || "");
        if (!item.category && m.item_code) item.category = m.item_code;
      }

      setStockItems(
        Array.from(stockMap.values()).map((i) => ({
          ...i,
          stock_balance: i.stock_in - i.stock_out,
        }))
      );
    } catch (err) {
      console.error("Error calculating stock:", err);
    } finally {
      setStockLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    loadData();
    if (canViewStock) calculateStock();
  }, [user, authLoading]);

  const isPrivilegedRole = user?.role?.some((r) =>
    ["admin", "operator", "penanggungjawab", "verifikator"].includes(r)
  );
  const myRequests = isPrivilegedRole
    ? requests
    : requests.filter((r: any) => Number(r.requester_id) === Number(user?.id));

  const stats = {
    total: myRequests.length,
    pending: myRequests.filter((r) =>
      ["pending_verification", "verified", "revision_requested"].includes(r.status)
    ).length,
    approved: myRequests.filter((r) => r.status === "approved").length,
    rejected: myRequests.filter((r) => r.status === "rejected").length,
    pendingVerify: requests.filter((r) => r.status === "pending_verification").length,
    pendingApprove: requests.filter((r) => r.status === "verified").length,
  };

  const filteredStock = stockItems.filter((i) =>
    i.item_name.toLowerCase().includes(stockFilter.toLowerCase())
  );
  const totalStock = filteredStock.reduce((s, i) => s + i.stock_balance, 0);
  const lowStockCount = filteredStock.filter((i) => i.stock_balance > 0 && i.stock_balance < 10).length;

  const formatNumber = (n: number) =>
    new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending_verification: "bg-yellow-100 text-yellow-700",
      verified: "bg-blue-100 text-blue-700",
      approved: "bg-green-100 text-green-700",
      rejected: "bg-red-100 text-red-700",
      revision_requested: "bg-orange-100 text-orange-700",
    };
    const labels: Record<string, string> = {
      pending_verification: "Menunggu Verifikasi",
      verified: "Terverifikasi",
      approved: "Disetujui",
      rejected: "Ditolak",
      revision_requested: "Perlu Revisi",
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[status] || "bg-gray-100"}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        {user?.role?.includes("pegawai") && (
          <Link
            to="/app/new-request"
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Buat Permintaan ATK
          </Link>
        )}
      </div>

      {/* ── STATISTIK PERMINTAAN ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
            <FileText size={24} />
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-800">{stats.total}</div>
            <div className="text-sm text-slate-500">Total Permintaan</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4">
          <div className="w-12 h-12 bg-yellow-100 text-yellow-600 rounded-xl flex items-center justify-center">
            <Clock size={24} />
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-800">{stats.pending}</div>
            <div className="text-sm text-slate-500">Dalam Proses</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4">
          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
            <CheckCircle size={24} />
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-800">{stats.approved}</div>
            <div className="text-sm text-slate-500">Disetujui</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-xl flex items-center justify-center">
            <XCircle size={24} />
          </div>
          <div>
            <div className="text-3xl font-bold text-slate-800">{stats.rejected}</div>
            <div className="text-sm text-slate-500">Ditolak</div>
          </div>
        </div>
      </div>

      {/* ── AKSI CEPAT ROLE ── */}
      {(user?.role?.includes("verifikator") || user?.role?.includes("admin")) && (
        <Link
          to="/app/verification"
          className="block bg-white rounded-2xl border border-slate-200 p-5 hover:border-yellow-400 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-yellow-100 text-yellow-600 rounded-xl flex items-center justify-center">
              <ListChecks size={24} />
            </div>
            <div className="flex-1">
              <div className="text-lg font-semibold text-slate-800">Menunggu Verifikasi</div>
              <div className="text-sm text-slate-500">{stats.pendingVerify} permintaan perlu diverifikasi</div>
            </div>
          </div>
        </Link>
      )}

      {(user?.role?.includes("penanggungjawab") || user?.role?.includes("admin")) && (
        <Link
          to="/app/approval"
          className="block bg-white rounded-2xl border border-slate-200 p-5 hover:border-blue-400 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
              <ShieldCheck size={24} />
            </div>
            <div className="flex-1">
              <div className="text-lg font-semibold text-slate-800">Menunggu Persetujuan</div>
              <div className="text-sm text-slate-500">{stats.pendingApprove} permintaan perlu disetujui</div>
            </div>
          </div>
        </Link>
      )}

      {/* ── PERMINTAAN TERBARU ── */}
      <div className="bg-white rounded-2xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Permintaan Terbaru</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {myRequests.slice(0, 5).map((req) => (
            <Link
              key={req.id}
              to={`/app/request/${req.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
            >
              <div>
                <div className="font-semibold text-slate-800">{req.document_number}</div>
                <div className="text-sm text-slate-500">
                  {(req.items?.length ?? 0)} item •{" "}
                  {new Date(req.submission_date || req.created_at).toLocaleDateString("id-ID")}
                </div>
              </div>
              {statusBadge(req.status)}
            </Link>
          ))}
          {myRequests.length === 0 && (
            <div className="px-5 py-8 text-center text-slate-500">Belum ada permintaan</div>
          )}
        </div>
      </div>

      {/* ── MONITORING STOK (hanya admin/operator/penanggungjawab) ── */}
      {canViewStock && (
        <>
          <div className="flex items-center gap-3 pt-2">
            <h2 className="text-xl font-bold text-slate-800">Monitoring Stok Persediaan</h2>
            {stockLoading && (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
            )}
          </div>

          {/* Statistik stok */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/20 rounded-xl"><Package size={24} /></div>
                <div>
                  <div className="text-blue-100 text-sm">Total Item</div>
                  <div className="text-2xl font-bold">{formatNumber(filteredStock.length)}</div>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-5 text-white shadow-lg">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/20 rounded-xl"><TrendingUp size={24} /></div>
                <div>
                  <div className="text-green-100 text-sm">Total Stok</div>
                  <div className="text-2xl font-bold">{formatNumber(totalStock)}</div>
                </div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-2xl p-5 text-white shadow-lg">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/20 rounded-xl"><AlertTriangle size={24} /></div>
                <div>
                  <div className="text-yellow-100 text-sm">Stok Menipis</div>
                  <div className="text-2xl font-bold">{formatNumber(lowStockCount)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Filter + Tabel stok */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100">
              <input
                type="text"
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
                placeholder="Cari nama barang..."
                className="w-full md:w-80 px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none text-sm"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Nama Barang</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Kode Barang</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Satuan</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Masuk</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Keluar</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Sisa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStock.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                        {stockLoading ? "Memuat data stok..." : "Tidak ada data"}
                      </td>
                    </tr>
                  ) : (
                    filteredStock.map((item, index) => (
                      <tr key={index} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-800 text-sm">{item.item_name}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 font-mono">{item.category || "-"}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{item.unit}</td>
                        <td className="px-4 py-3 text-sm text-green-600 text-right font-bold">
                          {item.stock_in > 0 ? `+${formatNumber(item.stock_in)}` : "0"}
                        </td>
                        <td className="px-4 py-3 text-sm text-red-600 text-right font-bold">
                          {item.stock_out > 0 ? `-${formatNumber(item.stock_out)}` : "0"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold text-sm ${item.stock_balance < 0 ? "text-red-700" : item.stock_balance < 10 ? "text-amber-600" : "text-slate-800"}`}>
                            {formatNumber(item.stock_balance)}
                            {item.stock_balance < 10 && item.stock_balance > 0 && " ⚠️"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
