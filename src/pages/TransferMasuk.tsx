import { useState, useEffect } from "react";
import { db, type TransferMasuk, type TransferMasukItem } from "../lib/db";
import { useNavigate } from "react-router-dom";
import { useDialog } from "../hooks/useDialog";
import Dialog from "../components/Dialog";
import { Trash2, Plus, ArrowDownLeft } from "lucide-react";

interface TransferWithItems extends TransferMasuk {
  items: TransferMasukItem[];
}

export default function TransferMasukPage() {
  const navigate = useNavigate();
  const { dialogState, closeDialog, alert, confirm } = useDialog();
  const [transfers, setTransfers] = useState<TransferWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTransfers();
  }, []);

  const loadTransfers = async () => {
    try {
      const data = await db.transfer_masuk
        .orderBy("created_at")
        .reverse()
        .toArray();

      const withItems = await Promise.all(
        data.map(async (transfer: TransferMasuk) => {
          const items = await db.transfer_masuk_items
            .where("transfer_id")
            .equals(transfer.id!)
            .toArray();
          return { ...transfer, items };
        }),
      );

      setTransfers(withItems);
    } catch (err) {
      console.error("Error loading transfer masuk:", err);
      await alert("Gagal memuat data transfer masuk. Silakan muat ulang halaman.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm("Yakin hapus data transfer masuk ini beserta semua item?", { destructive: true, confirmLabel: "Ya, Hapus" });
    if (!ok) return;

    await db.transfer_masuk_items.where("transfer_id").equals(id).delete();
    await db.transfer_masuk.delete(id);
    await loadTransfers();
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

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
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Transfer Masuk</h1>

      <div className="mb-6">
        <button 
          onClick={() => navigate("/app/transfer-masuk/new")}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700"
        >
          <Plus size={20} />
          Tambah Transfer Masuk
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">
            Data Transfer Masuk dari Satker Lain
          </h2>
        </div>

        {transfers.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <ArrowDownLeft size={48} className="mx-auto mb-3 text-slate-300" />
            <p>Belum ada data transfer masuk</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                    No BAST
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                    Tanggal (Dok / Buku)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                    Asal Satker
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                    Item
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">
                    Total
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/app/transfer-masuk/${t.id}`)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">
                        {t.document_number}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      <div className="font-medium text-slate-800">
                        {new Date(t.document_date || t.transfer_date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                      <div className="text-xs text-blue-600 flex items-center gap-1 mt-0.5">
                        <span className="bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">Buku: {new Date(t.book_date || t.transfer_date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {t.source_satker}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 text-right">
                      {t.items.length} item
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-green-600">
                        {formatCurrency(t.total_amount)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button 
                        onClick={(e) => handleDelete(t.id!, e)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded inline-flex items-center justify-center"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
