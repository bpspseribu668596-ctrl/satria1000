import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import SignatureCanvas from "react-signature-canvas";
import { useAuth } from "../context/AuthContext";
import { db, type ATKItem, type Settings } from "../lib/db";
import { Plus, Trash2, X, Search } from "lucide-react";

interface RequestItem {
  itemId: number;
  name: string;
  quantity: number;
  unit: string;
}

export default function NewRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const signatureRef = useRef<SignatureCanvas>(null);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [itemsWithStock, setItemsWithStock] = useState<(ATKItem & { stock: number })[]>([]);
  const [items, setItems] = useState<RequestItem[]>([{ itemId: 0, name: "", quantity: 1, unit: "" }]);
  const [location, setLocation] = useState("Jakarta Selatan");
  const [documentDate, setDocumentDate] = useState(new Date().toISOString().split("T")[0]);
  const [bookDate, setBookDate] = useState(new Date().toISOString().split("T")[0]);
  const [fungsiBagian, setFungsiBagian] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedRequesterId, setSelectedRequesterId] = useState<number>(0);
  const [requesterName, setRequesterName] = useState("");
  const [requesterNIP, setRequesterNIP] = useState("");
  const [showItemModal, setShowItemModal] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadData();
    if (user) {
      setSelectedRequesterId(user.id);
      setRequesterName(user.name || "");
      setRequesterNIP(user.nip || "");
      if (user.work_unit) setFungsiBagian(user.work_unit);
    }
  }, [user]);

  const loadData = async () => {
    try {
      const [masterItems, sett, usrs, pItems, requests, rItems, requestsNew, initialBalances, tMasukItems, tKeluarItems] = await Promise.all([
        db.atk_items.toArray(),
        db.settings.get(1),
        db.users.toArray(),
        db.purchase_items.toArray(),
        db.atk_requests.where("status").equals("approved").toArray(),
        db.atk_request_items.toArray(),
        db.requests.where("status").equals("approved").toArray(),
        db.initial_balances.where("year").equals(new Date().getFullYear()).toArray(),
        db.transfer_masuk_items.toArray(),
        db.transfer_keluar_items.toArray(),
      ]);

      setSettings(sett || null);
      setUsers(usrs || []);

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
    } catch (err) {
      console.error("Load failed:", err);
    }
  };

  const addItem = () => setItems([...items, { itemId: 0, name: "", quantity: 1, unit: "" }]);
  const removeItem = (i: number) => items.length > 1 && setItems(items.filter((_, idx) => idx !== i));
  const openItemSelector = (i: number) => { setSelectedIndex(i); setSearchQuery(""); setShowItemModal(true); };

  const selectItem = (atk: ATKItem & { stock: number }) => {
    const newItems = [...items];
    newItems[selectedIndex] = { itemId: atk.id!, name: atk.name, quantity: 1, unit: atk.unit };
    setItems(newItems);
    setShowItemModal(false);
  };

  const handleRequesterChange = (userId: number) => {
    setSelectedRequesterId(userId);
    const sel = users.find(u => u.id === userId);
    if (sel) {
      setRequesterName(sel.name);
      setRequesterNIP(sel.nip || "");
      if (sel.work_unit) setFungsiBagian(sel.work_unit);
    }
  };

  const formatNumber = (num: number) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num);

  const filteredItems = itemsWithStock.filter(i => 
    i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (i.item_code && i.item_code.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = items.filter(i => i.itemId && i.quantity > 0);
    if (!valid.length) return alert("Pilih minimal 1 barang");
    setLoading(true);
    try {
      const count = await db.requests.count();
      const now = new Date();
      const docD = new Date(documentDate);
      await db.requests.add({
        document_number: `${String(count + 1).padStart(4, "0")}/ATK/${docD.getMonth()+1}/${docD.getFullYear()}`,
        requester_id: selectedRequesterId || user!.id,
        items: valid.map((v: any) => ({ name: v.name, quantity: v.quantity, unit: v.unit })),
        status: "pending_verification",
        submission_date: documentDate,
        document_date: documentDate,
        book_date: bookDate,
        submission_location: location,
        fungsi_bagian: fungsiBagian,
        requester_signature: signatureRef.current?.toDataURL() || null,
        requester_notes: `${requesterName}${requesterNIP ? " ("+requesterNIP+")" : ""}`,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
      navigate("/app/all-requests");
    } catch (err) { alert("Error: " + (err as Error).message); } finally { setLoading(false); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Buat Permintaan ATK</h1>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-lg">
        <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center gap-4">
          {settings?.logo_url && <img src={settings.logo_url} className="h-12 w-12 object-contain" alt="Logo" />}
          <div>
            <h2 className="font-bold text-slate-800 uppercase">Formulir Permintaan ATK</h2>
            <p className="text-sm text-slate-500">{settings?.org_name || "BPS Jakarta Selatan"}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <label className="block text-sm font-bold text-slate-700">Detail Tanggal & Lokasi (SAKTI)</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Tgl Dokumen</label>
                  <input type="date" value={documentDate} onChange={e => setDocumentDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-purple-700 mb-1">Tgl Buku (SAKTI)</label>
                  <input type="date" value={bookDate} onChange={e => setBookDate(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-purple-300 focus:ring-2 focus:ring-purple-500 outline-none text-sm" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Lokasi Pengajuan</label>
                <input type="text" placeholder="Lokasi (misal: Jakarta Selatan)" value={location} onChange={e => setLocation(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm" required />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-bold text-slate-700">Data Pemohon</label>
                <span className="text-[10px] bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded border border-blue-200">
                  Pilih User DB
                </span>
              </div>

              {users.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Pilih dari Database User</label>
                  <select
                    value={selectedRequesterId}
                    onChange={e => handleRequesterChange(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl border border-blue-300 bg-blue-50/40 text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} - {u.work_unit || "Pegawai"} ({u.nip})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Nama Pemohon</label>
                  <input type="text" placeholder="Nama Pemohon" value={requesterName} onChange={e => setRequesterName(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">NIP</label>
                  <input type="text" placeholder="NIP" value={requesterNIP} onChange={e => setRequesterNIP(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Fungsi / Bagian (Unit Kerja)</label>
                <input
                  type="text"
                  placeholder="Fungsi / Bagian (otomatis terisi dari User)"
                  value={fungsiBagian}
                  onChange={e => setFungsiBagian(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700">Daftar Barang</label>
              <button type="button" onClick={addItem} className="text-blue-600 hover:text-blue-700 font-bold text-sm flex items-center gap-1"> <Plus size={16} /> Tambah Baris </button>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {items.map((item, i) => (
                <div key={i} className="flex items-center p-3 gap-3 bg-white">
                  <div className="text-slate-400 font-mono text-xs w-6">{i + 1}</div>
                  <button type="button" onClick={() => openItemSelector(i)} className="flex-1 text-left px-4 py-2.5 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors truncate">
                    {item.name || <span className="text-slate-400">Klik untuk pilih barang...</span>}
                  </button>
                  <input type="number" min={1} value={item.quantity} onChange={e => { const n = [...items]; n[i].quantity = Number(e.target.value); setItems(n); }} className="w-20 px-3 py-2.5 rounded-xl border border-slate-100 font-bold text-center outline-none focus:border-blue-500" />
                  <div className="w-16 text-xs text-slate-400 font-bold">{item.unit || "-"}</div>
                  <button type="button" onClick={() => removeItem(i)} disabled={items.length === 1} className="p-2 text-red-400 hover:text-red-600 disabled:opacity-30"> <Trash2 size={20} /> </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-700">Tanda Tangan digital</label>
            <div className="border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 p-2 overflow-hidden">
              <SignatureCanvas ref={signatureRef} penColor="#1e293b" canvasProps={{ className: "w-full h-40 bg-white rounded-xl shadow-inner" }} />
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => signatureRef.current?.clear()} className="text-xs text-red-500 font-bold hover:underline">Hapus Tanda Tangan</button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all disabled:opacity-50">
            {loading ? "Menyimpan..." : "Kirim Permintaan Sekarang"}
          </button>
        </form>
      </div>

      {showItemModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl overflow-hidden transform transition-all">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-xl text-center flex-1">Cari ATK</h3>
              <button onClick={() => setShowItemModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"> <X size={24} /> </button>
            </div>
            <div className="p-6">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Ketik nama benda..." className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none" autoFocus />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredItems.length === 0 ? <div className="text-center py-10 text-slate-400 italic">Benda tidak ditemukan...</div> :
                filteredItems.map((item: any) => (
                  <button key={item.id} onClick={() => selectItem(item)} className="w-full p-4 hover:bg-blue-50 rounded-2xl transition-all text-left flex items-center justify-between group">
                    <div>
                      <div className="font-bold text-slate-800 group-hover:text-blue-700">{item.name}</div>
                      <div className="text-xs text-slate-400 font-mono mt-1">{item.item_code}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-green-600">{formatNumber(item.stock)} <span className="text-[10px] uppercase">{item.unit}</span></div>
                      <div className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">Tersedia</div>
                    </div>
                  </button>
                ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
