import { useEffect, useState } from "react";
import { db, type User, hashPassword } from "../lib/db";
import {
  Plus,
  Trash2,
  Edit,
  Upload,
  Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useRef } from "react";

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    nip: "",
    username: "",
    name: "",
    password: "",
    role: ["pegawai"] as User["role"],
    work_unit: "",
  });

  const roleLabels: Record<string, string> = {
    admin: "Administrator",
    operator: "Operator",
    pegawai: "Pegawai",
    verifikator: "Verifikator",
    penanggungjawab: "Penanggungjawab",
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await db.users.toArray();
      setUsers(data);
    } catch (err) {
      console.error("Error loading users:", err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      nip: "",
      username: "",
      name: "",
      password: "",
      role: ["pegawai"],
      work_unit: "",
    });
    setEditingId(null);
  };

  const handleEdit = (user: User) => {
    setForm({
      nip: user.nip,
      username: user.username,
      name: user.name,
      password: "", // Don't show hash
      role: user.role,
      work_unit: user.work_unit,
    });
    setEditingId(user.id!);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userData: any = {
        nip: form.nip,
        username: form.username,
        name: form.name,
        role: form.role,
        work_unit: form.work_unit,
      };

      if (form.password) {
        userData.password_hash = await hashPassword(form.password);
      }

      if (editingId) {
        await db.users.update(editingId, userData);
      } else {
        if (!form.password)
          throw new Error("Password wajib diisi untuk user baru");
        userData.created_at = new Date().toISOString();
        await db.users.add(userData as User);
      }

      setShowModal(false);
      resetForm();
      loadData();
    } catch (err) {
      alert("Gagal: " + (err as Error).message);
    }
  };

  const toggleRole = (role: string) => {
    const currentRoles = [...form.role];
    const index = currentRoles.indexOf(role as unknown as User["role"][number]);
    if (index > -1) {
      if (currentRoles.length > 1) {
        currentRoles.splice(index, 1);
      } else {
        alert("User harus memiliki minimal satu role");
      }
    } else {
      currentRoles.push(role as unknown as User["role"][number]);
    }
    setForm({ ...form, role: currentRoles as User["role"] });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Yakin hapus user ini?")) return;
    await db.users.delete(id);
    loadData();
  };

  const excelInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const data = users.map((u) => ({
      NIP: u.nip,
      NAMA: u.name,
      ROLE: u.role.join(", "),
      "UNIT KERJA": u.work_unit,
      USERNAME: u.username,
      PASSWORD: "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Users");
    XLSX.writeFile(wb, "Data_User_ATK.xlsx");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      for (const row of jsonData) {
        const nip = String(row.NIP || "");
        const username = String(row.USERNAME || nip || "");
        if (!username) continue;

        const roles = String(row.ROLE || "pegawai")
          .split(",")
          .map((r) => r.trim().toLowerCase())
          .filter((r) =>
            [
              "admin",
              "operator",
              "pegawai",
              "verifikator",
              "penanggungjawab",
            ].includes(r),
          ) as User["role"];

        const existing = await db.users
          .where("username")
          .equals(username)
          .first();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userData: any = {
          nip: nip || (existing?.nip ?? ""),
          name: row.NAMA || existing?.name || "User Baru",
          role: roles.length > 0 ? roles : (existing?.role ?? ["pegawai"]),
          work_unit: row["UNIT KERJA"] || existing?.work_unit || "",
        };

        if (row.PASSWORD) {
          userData.password_hash = await hashPassword(String(row.PASSWORD));
        }

        if (existing) {
          await db.users.update(existing.id!, userData);
        } else {
          if (!userData.password_hash) {
            userData.password_hash = await hashPassword("123456");
          }
          userData.username = username;
          userData.created_at = new Date().toISOString();
          await db.users.add(userData as User);
        }
      }
      alert("Import selesai");
      loadData();
    } catch (err) {
      alert("Gagal import: " + (err as Error).message);
    }
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
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Kelola User</h1>
        <div className="flex flex-wrap gap-2">
          <input 
            type="file"
            ref={excelInputRef}
            onChange={handleImport}
            className="hidden"
            accept=".xlsx, .xls"
          />
          <button 
            onClick={() => excelInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-xl font-semibold hover:bg-green-100"
          >
            <Upload size={18} />
            Import Excel
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-xl font-semibold hover:bg-slate-50"
          >
            <Download size={18} />
            Export Excel
          </button>
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Tambah User
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                NIP
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Nama
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Username
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Role
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Unit Kerja
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50">
                <td className="px-5 py-4 text-slate-600">{user.nip}</td>
                <td className="px-5 py-4 font-semibold text-slate-800">
                  {user.name}
                </td>
                <td className="px-5 py-4 text-slate-600">{user.username}</td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-1">
                    {user.role.map((r) => (
                      <span
                        key={r}
                        className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-semibold"
                      >
                        {roleLabels[r]}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-4 text-slate-600">
                  {user.work_unit || "-"}
                </td>
                <td className="px-5 py-4">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleEdit(user)}
                      className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"
                    >
                      <Edit size={18} />
                    </button>
                    <button 
                      onClick={() => handleDelete(user.id!)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingId ? "Edit User" : "Tambah User Baru"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    NIP
                  </label>
                  <input 
                    type="text"
                    value={form.nip}
                    onChange={(e) => setForm({ ...form, nip: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Username
                  </label>
                  <input 
                    type="text"
                    value={form.username}
                    onChange={(e) =>
                      setForm({ ...form, username: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Nama Lengkap
                </label>
                <input 
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Password {editingId && "(Kosongkan jika tidak ganti)"}
                </label>
                <input 
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                  required={!editingId}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Role (Bisa pilih lebih dari 1)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(roleLabels).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-slate-100 hover:bg-slate-50"
                    >
                      <input 
                        type="checkbox"
                        checked={form.role.includes(key as unknown as User["role"][number])}
                        onChange={() => toggleRole(key)}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Unit Kerja
                </label>
                <input 
                  type="text"
                  value={form.work_unit}
                  onChange={(e) =>
                    setForm({ ...form, work_unit: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="flex-1 py-2.5 border-2 border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
