/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db, type Request, type User, type ATKItem } from "../lib/db";
import { ArrowLeft, Plus, Trash2, Save, X, Search } from "lucide-react";

interface EditableItem {
  name: string;
  quantity: number;
  unit: string;
}

export default function EditRequest() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [request, setRequest] = useState<Request | null>(null);
  const [, setSettings] = useState<unknown>(null);
  const [requester, setRequester] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [itemsWithStock, setItemsWithStock] = useState<(ATKItem & { stock: number })[]>([]);
  const [showItemModal, setShowItemModal] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState("");

  // Editable fields
  const [items, setItems] = useState<EditableItem[]>([]);
  const [location, setLocation] = useState("");
  const [submissionDate, setSubmissionDate] = useState("");
  const [fungsiBagian, setFungsiBagian] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [requesterNIP, setRequesterNIP] = useState("");
  const [workUnit, setWorkUnit] = useState("");

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    if (!id) return;

    const [req, sett] = await Promise.all([
      db.requests.get(Number(id)),
      db.settings.get(1),
    ]);

    if (!req) {
      alert("Request tidak ditemukan");
      navigate("/app/all-requests");
      return;
    }

    const user = await db.users.get(req.requester_id);

    setRequest(req);
    setSettings(sett || null);
    setRequester(user || null);
    setItems(req.items.map((i: { name: string; quantity: number; unit: string }) => ({ ...i })));
    setLocation(req.submission_location);
    setSubmissionDate(req.submission_date);
    setFungsiBagian(req.fungsi_bagian || "");
    setRequesterName(user?.name || "");
    setRequesterNIP(user?.nip || "");
    setWorkUnit(user?.work_unit || "");

    // Load master items and stock
    const [masterItems, pItems, requests, rItems, requestsNew, initialBalances, tMasukItems, tKeluarItems] = await Promise.all([
      db.atk_items.toArray(),
      db.purchase_items.toArray(),
      db.atk_requests.where("status").equals("approved").toArray(),
      db.atk_request_items.toArray(),
      db.requests.where("status").equals("approved").toArray(),
      db.initial_balances.where("year").equals(new Date().getFullYear()).toArray(),
      db.transfer_masuk_items.toArray(),
      db.transfer_keluar_items.toArray(),
    ]);

    const stockMap = new Map<string, number>();
    const add = (name: string, qty: any) => {
      const key = name.toLowerCase();
      stockMap.set(key, (stockMap.get(key) || 0) + (Number(qty) || 0));
    };
    const sub = (name: string, qty: any) => {
      const key = name.toLowerCase();
      stockMap.set(key, (stockMap.get(key) || 0) - (Number(qty) || 0));
    };

    initialBalances.forEach((b: any) => add(b.item_name, b.quantity));
    pItems.forEach((pi: any) => add(pi.item_name, pi.quantity));
    tMasukItems.forEach((ti: any) => add(ti.item_name, ti.quantity));
    tKeluarItems.forEach((ti: any) => sub(ti.item_name, ti.quantity));
    const appIds = new Set(requests.map((r: any) => r.id));
    rItems.forEach((ri: any) => { if (appIds.has(ri.request_id)) sub(ri.final_item_name || ri.item_name, ri.quantity); });
    requestsNew.forEach((r: any) => (r.items || []).forEach((ri: any) => sub(ri.name, ri.quantity)));

    // Gabungkan seluruh katalog item dari Master ATK, Transfer Masuk, Pembelian, dan Saldo Awal
    const itemCatalog = new Map<string, { id?: number; item_code?: string; name: string; unit: string; created_at?: string }>();

    masterItems.forEach((m: any) => {
      if (m && m.name) {
        itemCatalog.set(m.name.trim().toLowerCase(), {
          id: m.id,
          item_code: m.item_code || "",
          name: m.name.trim(),
          unit: m.unit || "pcs",
          created_at: m.created_at || new Date().toISOString(),
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
            created_at: new Date().toISOString(),
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
            created_at: new Date().toISOString(),
          });
        }
      }
    });

    initialBalances.forEach((bi: any) => {
      if (bi && bi.item_name) {
        const key = bi.item_name.trim().toLowerCase();
        if (!itemCatalog.has(key)) {
          itemCatalog.set(key, {
            id: -(itemCatalog.size + 1),
            item_code: "SA",
            name: bi.item_name.trim(),
            unit: bi.unit || "pcs",
            created_at: new Date().toISOString(),
          });
        }
      }
    });

    const withStock = Array.from(itemCatalog.values()).map((item: any) => ({
      ...item,
      stock: stockMap.get(item.name.toLowerCase()) || 0
    })).filter((m: any) => m.stock > 0);

    setItemsWithStock(withStock);
    setLoading(false);
  };

  const openItemSelector = (i: number) => {
    setSelectedIndex(i);
    setSearchQuery("");
    setShowItemModal(true);
  };

  const selectItem = (atk: ATKItem & { stock: number }) => {
    const newItems = [...items];
    newItems[selectedIndex] = { name: atk.name, quantity: 1, unit: atk.unit };
    setItems(newItems);
    setShowItemModal(false);
  };

  const addItem = () => {
    setItems([...items, { name: "", quantity: 1, unit: "pcs" }]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) {
      alert("Minimal harus ada 1 item");
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (
    index: number,
    field: keyof EditableItem,
    value: string | number,
  ) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSave = async () => {
    const validItems = items.filter((i) => i.name.trim() && i.quantity > 0);

    if (validItems.length === 0) {
      alert("Minimal harus ada 1 item yang valid");
      return;
    }

    if (!location.trim()) {
      alert("Lokasi pengajuan harus diisi");
      return;
    }

    if (!requesterName.trim()) {
      alert("Nama pegawai harus diisi");
      return;
    }

    setSaving(true);
    try {
      if (requester?.id) {
        await db.users.update(requester.id, {
          name: requesterName,
          nip: requesterNIP,
          work_unit: workUnit,
        });
      }

      await db.requests.update(Number(id), {
        items: validItems,
        submission_date: submissionDate,
        submission_location: location,
        fungsi_bagian: fungsiBagian || null,
        requester_notes: `${requesterName}${requesterNIP ? " (" + requesterNIP + ")" : ""}`,
        status: "pending_verification",  // kembalikan ke antrian verifikasi
        rejection_reason: null,          // hapus catatan revisi lama
        updated_at: new Date().toISOString(),
      });

      alert("Permintaan berhasil diupdate!");
      navigate(`/app/request/${id}`);
    } catch (err) {
      alert("Gagal menyimpan: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="text-center py-12 text-slate-500">
        Request tidak ditemukan
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={() => navigate("/app/all-requests")}
          className="p-2 hover:bg-slate-100 rounded-lg"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Edit Permintaan</h1>
          <p className="text-sm text-slate-500">{request.document_number}</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Informasi Pemohon
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Nama Pemohon <span className="text-red-500">*</span>
              </label>
              <input 
                type="text"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                NIP
              </label>
              <input 
                type="text"
                value={requesterNIP}
                onChange={(e) => setRequesterNIP(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Unit Kerja
              </label>
              <input 
                type="text"
                value={workUnit}
                onChange={(e) => setWorkUnit(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Tanggal Pengajuan <span className="text-red-500">*</span>
              </label>
              <input 
                type="date"
                value={submissionDate}
                onChange={(e) => setSubmissionDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Lokasi Pengajuan <span className="text-red-500">*</span>
              </label>
              <input 
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Fungsi/Bagian
              </label>
              <select 
                value={fungsiBagian}
                onChange={(e) => setFungsiBagian(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
              >
                <option value="">-- Pilih Fungsi/Bagian --</option>
                <option value="Subbagian Umum">Subbagian Umum</option>
                <option value="Fungsi Sosial">Fungsi Sosial</option>
                <option value="Fungsi Distribusi">Fungsi Distribusi</option>
                <option value="Fungsi Produksi">Fungsi Produksi</option>
                <option value="Fungsi Nerwilis">Fungsi Nerwilis</option>
                <option value="Fungsi IPDS">Fungsi IPDS</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">
              Daftar Barang yang Diminta
            </h2>
            <button 
              type="button"
              onClick={addItem}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 text-sm"
            >
              <Plus size={16} />
              Tambah Item
            </button>
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 w-28">
                    Jumlah
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 w-28">
                    Satuan
                  </th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openItemSelector(index)}
                        className="w-full px-4 py-2 text-left bg-slate-50 border border-slate-200 rounded-xl hover:border-blue-500 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      >
                        {item.name || <span className="text-slate-400">Pilih Barang dari Master...</span>}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(
                            index,
                            "quantity",
                            parseInt(e.target.value) || 1,
                          )
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-center focus:border-blue-500 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input 
                        type="text"
                        value={item.unit}
                        onChange={(e) =>
                          updateItem(index, "unit", e.target.value)
                        }
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
                        placeholder="pcs"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button 
                        type="button"
                        onClick={() => removeItem(index)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                        disabled={items.length === 1}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button 
            type="button"
            onClick={() => navigate("/app/all-requests")}
            className="px-6 py-3 border border-slate-200 rounded-xl font-semibold hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60 shadow-lg shadow-blue-200"
          >
            <Save size={20} />
            {saving ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </div>

      {showItemModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Search size={18} className="text-blue-500" />
                Pilih Barang dari Master ATK
              </h3>
              <button onClick={() => setShowItemModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 bg-white sticky top-0">
              <div className="relative">
                <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  autoFocus
                  type="text"
                  placeholder="Cari nama atau kode barang..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {itemsWithStock
                .filter(i => 
                  i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  (i.item_code && i.item_code.toLowerCase().includes(searchQuery.toLowerCase()))
                )
                .map((atk) => (
                  <button
                    key={atk.id}
                    onClick={() => selectItem(atk)}
                    className="w-full flex items-center justify-between p-3 hover:bg-blue-50 rounded-xl text-left transition-all border border-transparent hover:border-blue-100 group"
                  >
                    <div>
                      <div className="font-bold text-slate-800 group-hover:text-blue-700">{atk.name}</div>
                      <div className="text-xs text-slate-500 flex gap-3">
                        <span>Kode: {atk.item_code || "-"}</span>
                        <span>Satuan: {atk.unit}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Stok</div>
                      <div className={`font-mono font-bold ${atk.stock < 5 ? 'text-red-500' : 'text-green-600'}`}>
                        {new Intl.NumberFormat("id-ID").format(atk.stock)}
                      </div>
                    </div>
                  </button>
                ))}
              {itemsWithStock.filter(i => 
                  i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  (i.item_code && i.item_code.toLowerCase().includes(searchQuery.toLowerCase()))
                ).length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <Search size={48} className="mx-auto mb-4 opacity-20" />
                  Barang tidak ditemukan atau stok kosong
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
