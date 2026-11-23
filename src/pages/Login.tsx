import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(username.trim(), password);
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setLoading(false);
    }
  };

  const demoUsers = [
    { nip: "admin", pass: "admin123", role: "Administrator" },
    { nip: "verifikator", pass: "verif123", role: "Verifikator" },
    { nip: "penanggungjawab", pass: "super123", role: "Penanggung Jawab" },
    { nip: "pegawai", pass: "test123", role: "Pegawai" },
    { nip: "operator", pass: "oper123", role: "Operator" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Lambang_Badan_Pusat_Statistik_%28BPS%29_Indonesia.svg/1160px-Lambang_Badan_Pusat_Statistik_%28BPS%29_Indonesia.svg.png"
              alt="Logo"
              className="h-16 w-16 mx-auto mb-4"
            />
            <h1 className="text-2xl font-bold text-slate-800">
              Masuk ke Sistem
            </h1>
            <p className="text-slate-500">
              SATRIA — Sistem ATK Terintegrasi & Akurat
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Username
              </label>
              <input 
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                placeholder="Masukkan username"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Password
              </label>
              <input 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                placeholder="Masukkan password"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-xl font-bold text-lg hover:shadow-lg hover:shadow-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : null}
              {loading ? "Memproses..." : "Masuk"}
            </button>
          </form>

          {/* Demo Users */}
          <div className="mt-6 p-4 bg-slate-50 rounded-xl">
            <div className="text-sm font-semibold text-slate-700 mb-2">
              🔑 Akun Demo:
            </div>
            <div className="space-y-1 text-sm">
              {demoUsers.map((u) => (
                <div
                  key={u.nip}
                  className="flex justify-between text-slate-600"
                >
                  <span>
                    {u.nip} / {u.pass}
                  </span>
                  <span className="text-slate-400">{u.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Link
          to="/"
          className="flex items-center justify-center gap-2 mt-6 text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft size={18} />
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}
