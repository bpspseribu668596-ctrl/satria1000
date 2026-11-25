/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect } from "react";
import { db, type ATKItem, type InitialBalance } from "../lib/db";
import { Plus, Trash2, Save, Calendar, Download, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { UNIT_OPTIONS } from "../lib/units";
import { useDialog } from "../hooks/useDialog";
import Dialog from "../components/Dialog";

export default function SaldoAwal() {
  const { dialogState, closeDialog, alert, confirm } = useDialog();
  const [year, setYear] = useState(new Date().getFullYear());
  const [balances, setBalances] = useState<InitialBalance[]>([]);
  const [atkItems, setAtkItems] = useState<ATKItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state for new item
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({
    item_name: "",
    unit: "",
    quantity: 0,
    unit_price: 0,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [items, allBalances] = await Promise.all([
        db.atk_items.toArray(),
        db.initial_balances.toArray(),
      ]);
      setAtkItems(items);
      // Filter data berdasarkan tahun yang dipilih
      setBalances(allBalances.filter((b: InitialBalance) => b.year === year));
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [year]);

  const handleAddItem = async () => {
    if (!newItem.item_name.trim()) {
      await alert("Nama barang harus diisi");
      return;
    }

    const existing = balances.find(
      (b) => b.item_name.toLowerCase() === newItem.item_name.toLowerCase(),
    );
    if (existing) {
      await alert("Item sudah ada di saldo awal tahun ini");
      return;
    }

    const now = new Date().toISOString();
    await db.initial_balances.add({
      item_name: newItem.item_name,
      unit: newItem.unit,
      quantity: newItem.quantity,
      unit_price: newItem.unit_price,
      year,
      created_at: now,
      updated_at: now,
    });

    setNewItem({ item_name: "", unit: "", quantity: 0, unit_price: 0 });
    setShowAddForm(false);
    loadData();
  };

  const handleUpdateBalance = async (
    id: number,
    field: keyof InitialBalance,
    value: number | string,
  ) => {
    await db.initial_balances.update(id, {
      [field]: value,
      updated_at: new Date().toISOString(),
    });
    // Update local state for immediate feedback
    setBalances(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm("Yakin ingin menghapus item ini?", { destructive: true, confirmLabel: "Ya, Hapus" });
    if (!ok) return;
    await db.initial_balances.delete(id);
    loadData();
  };

  const handleImportFromMaster = async () => {
    const ok = await confirm(`Import semua (${atkItems.length}) item dari Master ATK ke Saldo Awal Tahun ${year}?`);
    if (!ok) return;

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const existingNames = new Set(balances.map(b => b.item_name.toLowerCase()));
      
      const newBalances: any[] = atkItems
        .filter(item => !existingNames.has(item.name.toLowerCase()))
        .map(item => ({
          item_name: item.name,
          unit: item.unit,
          quantity: 0,
          unit_price: 0,
          year: year,
          created_at: now,
          updated_at: now
        }));

      if (newBalances.length > 0) {
        await db.initial_balances.bulkAdd(newBalances);
        await alert(`Berhasil menambahkan ${newBalances.length} item baru ke Saldo Awal.`);
      } else {
        await alert("Semua item Master sudah terdaftar di Saldo Awal tahun ini.");
      }
      
      loadData();
    } catch (err) {
      await alert("Gagal import: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = () => {
    // Generate template dari item yang sudah ada di Saldo Awal tahun ini
    const rows = balances.length > 0
      ? balances.map(b => ({
          "Nama Barang": b.item_name,
          "Satuan": b.unit,
          "Jumlah": b.quantity,
          "Harga Satuan": b.unit_price,
        }))
      : [
          { "Nama Barang": "(contoh) KERTAS HVS A4 70GSM", "Satuan": "RIM", "Jumlah": 50, "Harga Satuan": 55000 },
          { "Nama Barang": "(contoh) PENSIL", "Satuan": "PCS", "Jumlah": 120, "Harga Satuan": 3500 },
        ];

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Saldo Awal");
    XLSX.writeFile(wb, `saldo_awal_${year}.xlsx`);
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat("id-ID", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  const totalValue = balances.reduce(
    (sum, b) => sum + (Number(b.quantity) || 0) * (Number(b.unit_price) || 0),
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
    <div>
      <Dialog state={dialogState} onClose={closeDialog} />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-800">
          Saldo Awal Persediaan
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2">
            <Calendar size={18} className="text-slate-400" />
            <select 
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="font-semibold text-slate-700 focus:outline-none"
            >
              {[2024, 2025, 2026, 2027, 2028].map((y) => (
                <option key={y} value={y}> Tahun {y} </option>
              ))}
            </select>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={downloadTemplate}
              title="Download data Saldo Awal tahun ini dalam format Excel"
              className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors"
            >
              <Download size={18} />
              Download Data
            </button>
          </div>

          <button 
            onClick={handleImportFromMaster}
            disabled={saving}
            className="px-4 py-2.5 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900 disabled:opacity-50"
          >
            Import dari Master
          </button>
          
          <button 
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700"
          >
            <Plus size={20} />
            Tambah Item
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white mb-6 shadow-lg shadow-blue-200">
        <div className="text-blue-100 text-sm"> Total Nilai Saldo Awal {year} </div>
        <div className="text-3xl font-bold"> Rp {formatCurrency(totalValue)} </div>
        <div className="text-blue-200 text-sm mt-1"> {balances.length} item terdaftar </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 w-12">No</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Nama Barang</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 w-24">Satuan</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 w-28">Jumlah</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 w-36">Harga Satuan</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 w-40">Total Nilai</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 w-20">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {balances.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    <FileSpreadsheet size={48} className="mx-auto mb-3 text-slate-300" />
                    Belum ada data saldo awal untuk tahun {year}
                  </td>
                </tr>
              ) : (
                balances.map((balance, index) => (
                  <tr key={balance.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-600 text-center">{index + 1}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{balance.item_name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{balance.unit}</td>
                    <td className="px-4 py-3">
                      <input 
                        type="number"
                        min={0}
                        value={balance.quantity}
                        onChange={(e) => handleUpdateBalance(balance.id!, "quantity", parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 text-right border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="number"
                        min={0}
                        value={balance.unit_price}
                        onChange={(e) => handleUpdateBalance(balance.id!, "unit_price", parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 text-right border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800">
                      Rp {formatCurrency(balance.quantity * balance.unit_price)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button 
                        onClick={() => handleDelete(balance.id!)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                        title="Hapus"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-slate-800 mb-4"> Tambah Saldo Awal </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1"> Nama Barang <span className="text-red-500">*</span> </label>
                <select 
                  value={newItem.item_name}
                  onChange={(e) => {
                    const selected = atkItems.find(i => i.name === e.target.value);
                    setNewItem({ ...newItem, item_name: e.target.value, unit: selected?.unit || "" });
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- Pilih Barang --</option>
                  {atkItems.map((item) => (
                    <option key={item.id} value={item.name}>{item.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1"> Satuan </label>
                  <select
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">-- Pilih Satuan --</option>
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1"> Jumlah </label>
                  <input type="number" min={0} value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1"> Harga Satuan </label>
                <input type="number" min={0} value={newItem.unit_price} onChange={(e) => setNewItem({ ...newItem, unit_price: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none" placeholder="0" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowAddForm(false)} className="flex-1 py-2.5 border-2 border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50"> Batal </button>
              <button onClick={handleAddItem} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">
                <Save size={18} /> Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
