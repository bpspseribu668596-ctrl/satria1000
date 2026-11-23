import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard,
  FilePlus,
  FileText,
  ListChecks,
  ShieldCheck,
  Users as UsersIcon,
  Package,
  Settings,
  LogOut,
  Menu,
  X,
  ShoppingCart,
  PlusCircle,
  BarChart3,
  ClipboardList,
  CircleDollarSign,
  ClipboardCheck,
  ArrowDownLeft,
  ArrowUpRight,
  FileSpreadsheet,
} from "lucide-react";
import { useState, useEffect } from "react";

const navItems = [
  // SECTION: FRONT OFFICE / TRANSAKSI
  {
    to: "/app",
    icon: LayoutDashboard,
    label: "Dashboard",
    roles: ["pegawai", "verifikator", "operator", "penanggungjawab", "admin"],
  },
  {
    to: "/app/new-request",
    icon: FilePlus,
    label: "Permintaan ATK",
    roles: ["pegawai", "operator", "verifikator", "penanggungjawab", "admin"],
  },
  {
    to: "/app/atk-requests",
    icon: PlusCircle,
    label: "Permohonan Pengadaan ATK",
    roles: ["pegawai", "operator", "verifikator", "penanggungjawab", "admin"],
  },
  {
    to: "/app/my-requests",
    icon: FileText,
    label: "Permintaan Saya",
    roles: ["pegawai"],
  },
  {
    to: "/app/all-requests",
    icon: FileText,
    label: "Semua Permintaan",
    roles: ["pegawai", "verifikator", "operator", "penanggungjawab", "admin"],
  },
  {
    to: "/app/verification",
    icon: ListChecks,
    label: "Verifikasi",
    roles: ["verifikator", "admin"],
  },
  {
    to: "/app/approval",
    icon: ShieldCheck,
    label: "Persetujuan",
    roles: ["penanggungjawab", "admin"],
  },

  // SECTION: GUDANG / INVENTORI
  { divider: true, roles: ["admin", "operator", "penanggungjawab"] },
  {
    to: "/app/atk-items",
    icon: Package,
    label: "Master ATK",
    roles: ["admin", "operator", "penanggungjawab"],
  },
  {
    to: "/app/initial-balance",
    icon: CircleDollarSign,
    label: "Saldo Awal",
    roles: ["admin", "operator", "penanggungjawab"],
  },
  {
    to: "/app/purchases",
    icon: ShoppingCart,
    label: "Pembelian",
    roles: ["admin", "operator", "penanggungjawab"],
  },
  {
    to: "/app/transfer-masuk",
    icon: ArrowDownLeft,
    label: "Transfer Masuk",
    roles: ["admin", "operator", "penanggungjawab"],
  },
  {
    to: "/app/transfer-keluar",
    icon: ArrowUpRight,
    label: "Transfer Keluar",
    roles: ["admin", "operator", "penanggungjawab"],
  },
  {
    to: "/app/stock-opname",
    icon: ClipboardCheck,
    label: "Stok Opname",
    roles: ["admin", "operator", "penanggungjawab"],
  },

  // SECTION: LAPORAN
  { divider: true, roles: ["admin", "operator", "penanggungjawab"] },
  {
    to: "/app/monitoring",
    icon: BarChart3,
    label: "Monitoring Stok",
    roles: ["admin", "operator", "penanggungjawab"],
  },
  {
    to: "/app/stock-card",
    icon: ClipboardList,
    label: "Kartu Kendali",
    roles: ["admin", "operator", "penanggungjawab"],
  },
  {
    to: "/app/inventory-report",
    icon: FileSpreadsheet,
    label: "Laporan Persediaan",
    roles: ["admin", "operator", "penanggungjawab", "verifikator"],
  },

  // SECTION: SYSTEM
  { divider: true, roles: ["admin"] },
  { to: "/app/users", icon: UsersIcon, label: "Kelola User", roles: ["admin"] },
  {
    to: "/app/settings",
    icon: Settings,
    label: "Pengaturan",
    roles: ["pegawai", "verifikator", "operator", "penanggungjawab", "admin"],
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const roleDisplayName: Record<string, string> = {
    admin: "Administrator",
    operator: "Operator",
    pegawai: "Pegawai",
    verifikator: "Verifikator",
    penanggungjawab: "Penanggung Jawab",
  };

  const getUserRolesDisplay = () => {
    if (!user?.role) return "";
    return (user.role as string[])
      .map((r) => roleDisplayName[r] || r)
      .join(", ");
  };

  return (
    <div className="min-h-screen bg-slate-100 flex overflow-x-hidden">
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 right-4 z-50 p-2 bg-white rounded-lg shadow-lg text-slate-600 print:hidden"
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed flex flex-col inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform duration-300 lg:translate-x-0 print:hidden ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 p-4 border-b border-white/10 h-16">
          <img
            src="/bpslogo.svg"
            alt="Logo"
            className="h-10 w-10 object-contain"
          />
          <div className="flex-1">
            <div className="font-bold text-sm">SATRIA</div>
            <div className="text-[10px] text-slate-400">
              Sistem ATK Terintegrasi & Akurat
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-hide">
          {navItems.map((item, i) => {
            const currentRoles = (user?.role || []) as string[];
            const hasAccess = (item.roles as string[]).some((r) =>
              currentRoles.includes(r),
            );
            if (!hasAccess) return null;

            if ("divider" in item && item.divider) {
              return <div key={i} className="h-px bg-white/10 my-3" />;
            }

            const Icon = item.icon!;
            return (
              <NavLink
                key={item.to}
                to={item.to!}
                end={item.to === "/app"}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                <Icon size={20} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl mb-2">
            <div className="w-10 h-10 shrink-0 bg-blue-600 rounded-xl flex items-center justify-center font-bold">
              {user?.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{user?.name}</div>
              <div className="text-[10px] text-slate-400 truncate">
                {getUserRolesDisplay()}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors text-xs font-medium border border-red-500/20"
          >
            <LogOut size={16} />
            Keluar
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-slate-900/60 z-40 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 lg:ml-64 min-h-screen relative z-0">
        <div className="p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
