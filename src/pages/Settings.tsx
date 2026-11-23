import { useEffect, useState } from "react";
import { db, type Settings } from "../lib/db";
import { useAuth } from "../context/AuthContext";
import {
  Save,
  Download,
  Upload,
  Database,
  Trash2,
  ShieldCheck,
  MapPin,
  Lock,
  Settings as SettingsIcon,
} from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [changingPass, setChangingPass] = useState(false);

  const isAdmin = user?.role?.includes("admin") || user?.role?.includes("operator");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    let data = await db.settings.get(1);
    if (!data) {
      data = {
        id: 1,
        org_name: "BPS Kepulauan Seribu",
        logo_url: "",
        budget_year: new Date().getFullYear().toString(),
        doc_format: "{AUTO}/ATK/{MM}/{YYYY}",
        whatsapp_number: "",
        official_name: "",
        official_nip: "",
        official_job: "Kepala Subbagian Umum",
        address: "",
        city: "",
      };
      await db.settings.add(data);
    } else if (data.official_job === "Pejabat Pembuat Komitmen") {
      data.official_job = "Kepala Subbagian Umum";
      await db.settings.update(1, { official_job: "Kepala Subbagian Umum" }).catch(() => {});
    }
    setSettings(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || !isAdmin) return;

    setSaving(true);
    try {
      await db.settings.update(1, settings);
      alert("Pengaturan disimpan!");
    } catch (err) {
      alert("Gagal: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert("Konfirmasi password baru tidak cocok");
      return;
    }

    if (passwordForm.newPassword.length < 4) {
      alert("Password baru minimal 4 karakter");
      return;
    }

    setChangingPass(true);
    try {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const API_BASE_URL = isLocalhost ? 'http://localhost:5000/api' : '/api';
      
      const res = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          oldPassword: passwordForm.oldPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengubah password");

      alert("Password berhasil diubah!");
      setPasswordForm({
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err) {
      alert("Gagal: " + (err as Error).message);
    } finally {
      setChangingPass(false);
    }
  };

  const handleExport = async () => {
    try {
      const data: Record<string, unknown> = {};

      for (const table of db.tables) {
        data[table.name] = await table.toArray();
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `atk_backup_${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Gagal ekspor: " + (err as Error).message);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("Impor data akan menggantikan data yang ada. Lanjutkan?"))
      return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);

        // Use a transaction for safer import
        await db.transaction("rw", db.tables, async () => {
          for (const table of db.tables) {
            if (data[table.name]) {
              await table.clear();
              await table.bulkAdd(data[table.name]);
            }
          }
        });

        alert("Data berhasil diimpor! Halaman akan dimuat ulang.");
        window.location.reload();
      } catch (err) {
        alert("Gagal impor: " + (err as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const handleReset = async () => {
    if (!confirm("PERINGATAN: Seluruh data akan dihapus permanen! Lanjutkan?"))
      return;
    if (
      !confirm(
        "Apakah Anda benar-benar yakin? Tindakan ini tidak bisa dibatalkan.",
      )
    )
      return;

    try {
      await db.delete();
      alert("Database telah direset. Halaman akan dimuat ulang.");
      window.location.reload();
    } catch (err) {
      alert("Gagal reset: " + (err as Error).message);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Pengaturan</h1>

      <div className="space-y-6">
        {/* Ubah Password - SEMUA ROLE */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-6 text-blue-600">
            <Lock size={20} />
            <h2 className="font-bold">Ubah Password</h2>
          </div>
          <form onSubmit={handleChangePassword} className="max-w-md space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Password Lama
              </label>
              <input
                type="password"
                value={passwordForm.oldPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Password Baru
              </label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Konfirmasi Password Baru
              </label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                required
              />
            </div>
            <button
              type="submit"
              disabled={changingPass}
              className="px-8 py-3 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900 disabled:opacity-60 transition-colors shadow-lg shadow-slate-500/10"
            >
              {changingPass ? "Memproses..." : "Update Password"}
            </button>
          </form>
        </div>

        {/* Utama - HANYA ADMIN */}
        {isAdmin && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 overflow-hidden">
          <div className="flex items-center gap-2 mb-4 text-blue-600">
            <SettingsIcon size={20} />
            <h2 className="font-bold">Informasi Utama</h2>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nama Organisasi / Satker
                </label>
                <input 
                  type="text"
                  value={settings.org_name}
                  onChange={(e) =>
                    setSettings({ ...settings, org_name: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Tahun Anggaran
                </label>
                <input 
                  type="text"
                  value={settings.budget_year}
                  onChange={(e) =>
                    setSettings({ ...settings, budget_year: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nomor WhatsApp (CS)
                </label>
                <input 
                  type="text"
                  value={settings.whatsapp_number}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      whatsapp_number: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                  placeholder="628xxx"
                />
              </div>
            </div>

            {/* Pejabat */}
            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-4 text-slate-800">
                <ShieldCheck size={20} className="text-blue-600" />
                <h3 className="font-bold text-sm uppercase tracking-wider">
                  Pejabat Penandatangan
                </h3>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Nama Pejabat
                  </label>
                  <input 
                    type="text"
                    value={settings.official_name}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        official_name: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    NIP Pejabat
                  </label>
                  <input 
                    type="text"
                    value={settings.official_nip}
                    onChange={(e) =>
                      setSettings({ ...settings, official_nip: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Jabatan
                  </label>
                  <input 
                    type="text"
                    value={settings.official_job}
                    onChange={(e) =>
                      setSettings({ ...settings, official_job: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Lokasi */}
            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-4 text-slate-800">
                <MapPin size={20} className="text-blue-600" />
                <h3 className="font-bold text-sm uppercase tracking-wider">
                  Alamat & Lokasi
                </h3>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Alamat Lengkap
                  </label>
                  <textarea 
                    value={settings.address}
                    onChange={(e) =>
                      setSettings({ ...settings, address: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all h-20 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Kota/Kabupaten
                  </label>
                  <input 
                    type="text"
                    value={settings.city}
                    onChange={(e) =>
                      setSettings({ ...settings, city: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button 
                type="submit"
                disabled={saving}
                className="flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-lg shadow-blue-500/20"
              >
                <Save size={20} />
                {saving ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        </div>
        )}

        {/* Data Management - HANYA ADMIN */}
        {isAdmin && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-6 text-slate-800">
            <Database size={20} className="text-blue-600" />
            <h2 className="font-bold">Manajemen Data & Database</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
              <div className="font-bold text-blue-800 mb-1">Cadangkan Data</div>
              <p className="text-xs text-blue-600 mb-4">
                Unduh semua data aplikasi ke file JSON untuk cadangan.
              </p>
              <button 
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors w-full justify-center"
              >
                <Download size={18} />
                Backup JSON
              </button>
            </div>

            <div className="p-4 bg-green-50 rounded-2xl border border-green-100">
              <div className="font-bold text-green-800 mb-1">Pulihkan Data</div>
              <p className="text-xs text-green-600 mb-4">
                Unggah file backup JSON untuk memulihkan data sistem.
              </p>
              <label className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors w-full justify-center cursor-pointer">
                <Upload size={18} />
                Restore JSON
                <input 
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
              </label>
            </div>

            <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
              <div className="font-bold text-red-800 mb-1">Hapus Semua</div>
              <p className="text-xs text-red-600 mb-4">
                Hapus seluruh data database dan kembalikan ke awal.
              </p>
              <button 
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors w-full justify-center"
              >
                <Trash2 size={18} />
                Reset Database
              </button>
            </div>
          </div>

          <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
            <strong>Catatan:</strong> Database menggunakan IndexedDB di browser
            ini. Data Anda disimpan secara lokal dan tidak dikirim ke server
            mana pun untuk keamanan privasi.
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
