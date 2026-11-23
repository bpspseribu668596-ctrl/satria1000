import { useState, useEffect } from "react";
import { db } from "../lib/db";
import { Package, TrendingUp, AlertTriangle } from "lucide-react";

interface StockItem {
  atk_item_id: number | null;
  item_name: string;
  category: string;
  unit: string;
  stock_in: number;
  stock_out: number;
  stock_balance: number;
}

export default function Monitoring() {
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    calculateStock();
  }, []);

  const calculateStock = async () => {
    try {
      const masterItems = await db.atk_items.toArray();
      const currentYear = new Date().getFullYear();
      
      const [initialBalances, purchaseItems, approvedRequests, rItemsAtk, approvedRequestsNew, transferMasukItems, transferKeluarItems] = await Promise.all([
        db.initial_balances.where("year").equals(currentYear).toArray(),
        db.purchase_items.toArray(),
        db.atk_requests.where("status").equals("approved").toArray(),
        db.atk_request_items.toArray(),
        db.requests.where("status").equals("approved").toArray(),
        db.transfer_masuk_items.toArray(),
        db.transfer_keluar_items.toArray()
      ]);

      const stockMap = new Map<string, StockItem>();

      const getOrCreate = (name: string, unit: string, cat: string = "", id: number | null = null) => {
        const key = name.toLowerCase();
        if (!stockMap.has(key)) {
          stockMap.set(key, {
            atk_item_id: id,
            item_name: name,
            category: cat,
            unit: unit || "",
            stock_in: 0,
            stock_out: 0,
            stock_balance: 0,
          });
        }
        return stockMap.get(key)!;
      };

      // Process initial balances
      for (const b of initialBalances) {
        const item = getOrCreate(b.item_name, b.unit);
        item.stock_in += Number(b.quantity) || 0;
      }

      // Process purchases
      for (const p of purchaseItems) {
        const item = getOrCreate(p.item_name, p.unit);
        item.stock_in += Number(p.quantity) || 0;
      }

      // Process transfer masuk
      for (const t of transferMasukItems) {
        const item = getOrCreate(t.item_name, t.unit);
        item.stock_in += Number(t.quantity) || 0;
      }

      // Process ATK Requests
      const approvedIds = new Set(approvedRequests.map((r: any) => r.id));
      for (const ri of rItemsAtk) {
        if (approvedIds.has(ri.request_id)) {
          const name = ri.final_item_name || ri.item_name;
          const item = getOrCreate(name, ri.unit, ri.category, ri.atk_item_id);
          item.stock_out += Number(ri.quantity) || 0;
        }
      }

      // Process New Workflow Requests
      for (const req of approvedRequestsNew) {
        for (const ri of (req.items || [])) {
          const item = getOrCreate(ri.name, ri.unit);
          item.stock_out += Number(ri.quantity) || 0;
        }
      }

      // Process transfer keluar
      for (const t of transferKeluarItems) {
        const item = getOrCreate(t.item_name, t.unit);
        item.stock_out += Number(t.quantity) || 0;
      }

      // Enrichment from Master
      for (const m of masterItems) {
        const item = getOrCreate(m.name, m.unit, m.item_code, m.id);
        if (!item.category && m.item_code) item.category = m.item_code;
      }

      const stockList = Array.from(stockMap.values()).map((item: any) => ({
        ...item,
        stock_balance: (Number(item.stock_in) || 0) - (Number(item.stock_out) || 0)
      }));

      setStockItems(stockList);
    } catch (err) {
      console.error("Error calculating stock:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("id-ID", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(num);
  };

  const categories = ["all", ...new Set(stockItems.map((i: any) => i.category).filter(Boolean))];

  const filteredItems = stockItems.filter((item: any) => {
    const matchesSearch = item.item_name.toLowerCase().includes(filter.toLowerCase());
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const totalStockValue = filteredItems.reduce((sum, item) => sum + item.stock_balance, 0);
  const lowStockCount = filteredItems.filter((item: any) => item.stock_balance > 0 && item.stock_balance < 10).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800"> Monitoring Stok Persediaan </h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-xl"> <Package size={24} /> </div>
            <div>
              <div className="text-blue-100 text-sm">Total Item</div>
              <div className="text-2xl font-bold">{formatNumber(filteredItems.length)}</div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-xl"> <TrendingUp size={24} /> </div>
            <div>
              <div className="text-green-100 text-sm">Total Stok</div>
              <div className="text-2xl font-bold">{formatNumber(totalStockValue)}</div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-xl"> <AlertTriangle size={24} /> </div>
            <div>
              <div className="text-yellow-100 text-sm">Stok Menipis</div>
              <div className="text-2xl font-bold">{formatNumber(lowStockCount)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2"> Cari Item </label>
            <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none" placeholder="Cari nama item..." />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2"> Filter Kode Barang </label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none" >
              {categories.map((cat: any) => (
                <option key={cat} value={cat}>{cat === "all" ? "Semua Kode Barang" : cat}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Nama ATK</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Kode Barang</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">Satuan</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Masuk</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Keluar</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">Sisa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Tidak ada data</td></tr>
              ) : (
                filteredItems.map((item, index) => (
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
                      <div className={`font-bold text-sm ${item.stock_balance < 0 ? "text-red-700" : item.stock_balance < 10 ? "text-amber-600" : "text-slate-800"}`}>
                        {formatNumber(item.stock_balance)}
                        {item.stock_balance < 10 && item.stock_balance > 0 && <span className="ml-1">⚠️</span>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
