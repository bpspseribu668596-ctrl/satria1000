import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  FileText,
  CheckSquare,
  MessageSquare,
  BarChart3,
  Lock,
  Users,
  LogIn,
  ArrowRight,
  Sparkles,
  Clock,
  TrendingUp,
  Shield,
  Zap,
  ChevronRight,
} from "lucide-react";

// Counter animation component
function Counter({ end, suffix = "" }: { end: number; suffix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const increment = end / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [end]);

  return (
    <span>
      {count}
      {suffix}
    </span>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 text-slate-900 overflow-hidden">
      {/* Animated Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-blue-400/20 rounded-full blur-[120px] animate-pulse" />
        <div
          className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] bg-purple-400/15 rounded-full blur-[100px] animate-pulse"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute bottom-[-10%] left-[30%] w-[400px] h-[400px] bg-cyan-400/10 rounded-full blur-[80px] animate-pulse"
          style={{ animationDelay: "2s" }}
        />
      </div>

      {/* Navbar */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Lambang_Badan_Pusat_Statistik_%28BPS%29_Indonesia.svg/1160px-Lambang_Badan_Pusat_Statistik_%28BPS%29_Indonesia.svg.png"
              alt="Logo BPS"
              className="h-10 w-10"
            />
            <div>
              <div className="font-bold text-lg text-slate-900">SATRIA</div>
              <div className="text-xs text-slate-500">
                Sistem ATK Terintegrasi & Akurat
              </div>
            </div>
          </div>
          <Link
            to="/login"
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 transition-all text-sm shadow-lg shadow-blue-500/25"
          >
            <LogIn size={16} />
            Masuk
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-16 px-4">
        <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 border border-blue-200 rounded-full text-blue-600 text-sm mb-6">
              <Sparkles size={14} />
              <span>Solusi Digital Terbaru 2025</span>
            </div>

            <div className="mb-6">
              <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black leading-[0.9] tracking-tight">
                <span className="bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400 bg-clip-text text-transparent">
                  SATRIA
                </span>
              </h1>
              <div className="flex items-center gap-2 mt-4 mb-3">
                <div className="h-[3px] w-12 bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full" />
                <div className="h-[3px] w-4 bg-blue-300 rounded-full" />
              </div>
              <p className="text-sm sm:text-base lg:text-lg font-bold text-slate-600 tracking-[0.2em] uppercase">
                Sistem ATK Terintegrasi & Akurat
              </p>
              <p className="text-xs sm:text-sm lg:text-base font-semibold text-slate-500 tracking-[0.2em] uppercase mt-1">
                Badan Pusat Statistik Kota Jakarta Selatan
              </p>
            </div>

            <div className="flex flex-wrap gap-4 mb-10">
              <Link
                to="/login"
                className="group flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl font-bold text-lg hover:shadow-xl hover:shadow-blue-500/25 transition-all hover:-translate-y-0.5"
              >
                Masuk Sekarang
                <ArrowRight
                  size={20}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </Link>
              <button  className="flex items-center gap-2 px-8 py-4 bg-white border border-slate-200 rounded-2xl font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                Lihat Demo
              </button>
            </div>

            {/* Trust Pills */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-full text-green-700 text-sm font-medium">
                <CheckSquare size={14} />
                Transparan
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-full text-blue-700 text-sm font-medium">
                <Zap size={14} />
                Real-time
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 border border-purple-200 rounded-full text-purple-700 text-sm font-medium">
                <MessageSquare size={14} />
                Terintegrasi WhatsApp
              </div>
            </div>
          </div>

          {/* Right - Floating Cards */}
          <div className="relative hidden lg:block">
            {/* Main Dashboard Card */}
            <div className="relative bg-white/90 backdrop-blur-xl border border-slate-200 rounded-3xl p-6 shadow-2xl shadow-slate-300/50 transform rotate-2 hover:rotate-0 transition-transform duration-500">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center text-white">
                    <BarChart3 size={20} />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">
                      Dashboard ATK
                    </div>
                    <div className="text-xs text-slate-500">Live Preview</div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 bg-red-500 rounded-full" />
                  <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                </div>
              </div>

              {/* Mini Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  {
                    label: "Pending",
                    value: "12",
                    color: "from-yellow-500 to-orange-500",
                  },
                  {
                    label: "Approved",
                    value: "45",
                    color: "from-green-500 to-emerald-500",
                  },
                  {
                    label: "Stok",
                    value: "89",
                    color: "from-blue-500 to-cyan-500",
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100"
                  >
                    <div
                      className={`text-xl font-bold bg-gradient-to-r ${item.color} bg-clip-text text-transparent`}
                    >
                      {item.value}
                    </div>
                    <div className="text-xs text-slate-500">{item.label}</div>
                  </div>
                ))}
              </div>

              {/* Recent Requests */}
              <div className="space-y-2">
                {[
                  { item: "Kertas HVS A4", qty: "10 rim", status: "approved" },
                  { item: "Pulpen Hitam", qty: "24 pcs", status: "pending" },
                  { item: "Staples", qty: "5 box", status: "approved" },
                ].map((req, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full ${req.status === "approved" ? "bg-green-500" : "bg-yellow-500"}`}
                      />
                      <span className="text-sm text-slate-700">{req.item}</span>
                    </div>
                    <span className="text-xs text-slate-500">{req.qty}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating Badge */}
            <div className="absolute -top-4 -right-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg animate-bounce">
              ✓ Real-time
            </div>

            {/* Floating Notification */}
            <div className="absolute -bottom-4 -left-8 bg-white border border-slate-200 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Notifikasi WhatsApp
                  </div>
                  <div className="text-xs text-slate-500">
                    Request #0042 disetujui
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="relative py-12 border-y border-slate-200 bg-white/70 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              {
                icon: FileText,
                value: 500,
                suffix: "+",
                label: "Permintaan Diproses",
                color: "text-blue-600",
              },
              {
                icon: Users,
                value: 50,
                suffix: "",
                label: "Pengguna Aktif",
                color: "text-purple-600",
              },
              {
                icon: TrendingUp,
                value: 99,
                suffix: "%",
                label: "Tingkat Approval",
                color: "text-green-600",
              },
              {
                icon: Clock,
                value: 24,
                suffix: "h",
                label: "Response Time",
                color: "text-cyan-600",
              },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <stat.icon size={24} className={`mx-auto mb-3 ${stat.color}`} />
                <div className="text-3xl font-black text-slate-900 mb-1">
                  <Counter end={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-sm text-slate-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Bento Grid */}
      <section className="py-24 relative">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black mb-4 text-slate-900">
              Fitur <span className="text-blue-600">Unggulan</span>
            </h2>
            <p className="text-slate-600 max-w-xl mx-auto">
              SATRIA hadir dengan fitur lengkap untuk manajemen ATK yang modern
              dan efisien
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {/* Large Card */}
            <div className="md:col-span-2 bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-3xl p-8 hover:border-blue-300 transition-all group">
              <div className="flex items-start justify-between mb-6">
                <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                  <BarChart3 size={28} />
                </div>
                <ChevronRight
                  size={20}
                  className="text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all"
                />
              </div>
              <h3 className="text-xl font-bold mb-2 text-slate-900">
                Dashboard Real-time
              </h3>
              <p className="text-slate-600 mb-6">
                Monitoring stok, permintaan, dan approval secara real-time
                dengan visualisasi yang intuitif
              </p>
              <div className="grid grid-cols-4 gap-3">
                {["Pending", "Verified", "Approved", "Completed"].map(
                  (s, i) => (
                    <div
                      key={i}
                      className="bg-white rounded-xl p-3 text-center border border-slate-100 shadow-sm"
                    >
                      <div className="text-lg font-bold text-slate-900">
                        {[12, 8, 45, 123][i]}
                      </div>
                      <div className="text-xs text-slate-500">{s}</div>
                    </div>
                  ),
                )}
              </div>
            </div>

            {/* Right Cards */}
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 hover:border-green-300 hover:shadow-lg transition-all group">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-green-600 mb-4 group-hover:scale-110 transition-transform">
                  <CheckSquare size={24} />
                </div>
                <h3 className="font-bold mb-1 text-slate-900">
                  Multi-level Approval
                </h3>
                <p className="text-sm text-slate-600">
                  Workflow approval transparan
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-3xl p-6 hover:border-purple-300 hover:shadow-lg transition-all group">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 mb-4 group-hover:scale-110 transition-transform">
                  <MessageSquare size={24} />
                </div>
                <h3 className="font-bold mb-1 text-slate-900">
                  Notifikasi WhatsApp
                </h3>
                <p className="text-sm text-slate-600">Alert langsung ke WA</p>
              </div>
            </div>

            {/* Bottom Row */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 hover:border-red-300 hover:shadow-lg transition-all group">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center text-red-600 mb-4 group-hover:scale-110 transition-transform">
                <Lock size={24} />
              </div>
              <h3 className="font-bold mb-1 text-slate-900">
                Aman & Terkontrol
              </h3>
              <p className="text-sm text-slate-600">
                Role-based access control
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-3xl p-6 hover:border-yellow-300 hover:shadow-lg transition-all group">
              <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center text-yellow-600 mb-4 group-hover:scale-110 transition-transform">
                <Zap size={24} />
              </div>
              <h3 className="font-bold mb-1 text-slate-900">Proses Cepat</h3>
              <p className="text-sm text-slate-600">Workflow yang efisien</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-3xl p-6 hover:border-cyan-300 hover:shadow-lg transition-all group">
              <div className="w-12 h-12 bg-cyan-100 rounded-xl flex items-center justify-center text-cyan-600 mb-4 group-hover:scale-110 transition-transform">
                <Shield size={24} />
              </div>
              <h3 className="font-bold mb-1 text-slate-900">Audit Trail</h3>
              <p className="text-sm text-slate-600">
                Tracking lengkap aktivitas
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-slate-50/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-black mb-4 text-slate-900">
              Cara Kerja
            </h2>
            <p className="text-slate-600">Proses sederhana dalam 4 langkah</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                step: 1,
                title: "Buat Request",
                desc: "Ajukan permintaan ATK melalui form digital",
                icon: FileText,
              },
              {
                step: 2,
                title: "Verifikasi",
                desc: "Admin memverifikasi ketersediaan stok",
                icon: CheckSquare,
              },
              {
                step: 3,
                title: "Approval",
                desc: "Pimpinan menyetujui permintaan",
                icon: Shield,
              },
              {
                step: 4,
                title: "Selesai",
                desc: "Cetak surat dan ambil barang",
                icon: Sparkles,
              },
            ].map((item, i) => (
              <div key={i} className="relative text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-black text-white shadow-lg shadow-blue-500/25">
                  {item.step}
                </div>
                <h3 className="font-bold mb-2 text-slate-900">{item.title}</h3>
                <p className="text-sm text-slate-600">{item.desc}</p>
                {i < 3 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-blue-300 to-transparent" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-black mb-6 text-slate-900">
            Siap Mendigitalkan
            <br />
            Manajemen ATK Anda?
          </h2>
          <p className="text-slate-600 mb-10 max-w-xl mx-auto">
            Bergabung dengan pengguna lainnya dan nikmati kemudahan pengelolaan
            ATK yang modern
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl font-bold text-xl hover:shadow-xl hover:shadow-blue-500/25 transition-all hover:-translate-y-1"
          >
            Mulai Sekarang
            <ArrowRight size={24} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Lambang_Badan_Pusat_Statistik_%28BPS%29_Indonesia.svg/1160px-Lambang_Badan_Pusat_Statistik_%28BPS%29_Indonesia.svg.png"
                alt="Logo"
                className="h-8 w-8"
              />
              <span className="text-slate-500 text-sm">
                © 2025 SATRIA - BPS Jakarta Selatan
              </span>
            </div>
            <div className="flex gap-6 text-sm text-slate-500">
              <a href="#" className="hover:text-blue-600 transition-colors">
                Bantuan
              </a>
              <a href="#" className="hover:text-blue-600 transition-colors">
                Kontak
              </a>
              <a href="#" className="hover:text-blue-600 transition-colors">
                Kebijakan Privasi
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
