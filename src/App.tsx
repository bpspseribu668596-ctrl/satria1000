import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { AuthProvider } from "./context/AuthContext";
import { seedDatabase } from "./lib/db";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";

// Pages
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewRequest from "./pages/NewRequest";
import MyRequests from "./pages/MyRequests";
import ApprovedRequests from "./pages/ApprovedRequests";
import AllRequests from "./pages/AllRequests";
import RequestDetail from "./pages/RequestDetail";
import Verification from "./pages/Verification";
import Approval from "./pages/Approval";
import Users from "./pages/Users";
import ATKItems from "./pages/ATKItems";
import Settings from "./pages/Settings";
import Purchases from "./pages/Purchases";
import NewPurchase from "./pages/NewPurchase";
import PurchaseDetail from "./pages/PurchaseDetail";
import NewATKRequest from "./pages/NewATKRequest";
import ATKRequests from "./pages/ATKRequests";
import ATKRequestDetail from "./pages/ATKRequestDetail";
import StockCard from "./pages/StockCard";
import SaldoAwal from "./pages/SaldoAwal";
import StokOpname from "./pages/StokOpname";
import TransferMasuk from "./pages/TransferMasuk";
import NewTransferMasuk from "./pages/NewTransferMasuk";
import TransferMasukDetail from "./pages/TransferMasukDetail";
import TransferKeluar from "./pages/TransferKeluar";
import NewTransferKeluar from "./pages/NewTransferKeluar";
import TransferKeluarDetail from "./pages/TransferKeluarDetail";
import InventoryReport from "./pages/InventoryReport";

import PublicVerifyRequest from "./pages/PublicVerifyRequest";
import PublicVerifyStockCard from "./pages/PublicVerifyStockCard";

function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedDatabase().then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes (Dapat diakses langsung saat scan QR Code tanpa login) */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/verify/request/:id" element={<PublicVerifyRequest />} />
          <Route path="/verify/stock-card/:itemId" element={<PublicVerifyStockCard />} />
          <Route path="/verify/stock-card" element={<PublicVerifyStockCard />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/app" element={<Dashboard />} />
              <Route path="/app/new-request" element={
                <ProtectedRoute allowedRoles={["pegawai", "verifikator", "penanggungjawab", "admin"]} />
              }>
                <Route index element={<NewRequest />} />
              </Route>
              <Route path="/app/my-requests" element={
                <ProtectedRoute allowedRoles={["pegawai", "verifikator", "penanggungjawab", "admin"]} />
              }>
                <Route index element={<MyRequests />} />
              </Route>
              <Route path="/app/approved-requests" element={
                <ProtectedRoute allowedRoles={["operator"]} />
              }>
                <Route index element={<ApprovedRequests />} />
              </Route>
              <Route path="/app/all-requests" element={
                <ProtectedRoute allowedRoles={["verifikator", "penanggungjawab", "admin"]} />
              }>
                <Route index element={<AllRequests />} />
              </Route>
              <Route path="/app/request/:id" element={<RequestDetail />} />
              <Route path="/app/requests/:id" element={<RequestDetail />} />
              <Route path="/app/verification" element={
                <ProtectedRoute allowedRoles={["verifikator", "admin"]} />
              }>
                <Route index element={<Verification />} />
              </Route>
              <Route path="/app/approval" element={
                <ProtectedRoute allowedRoles={["penanggungjawab", "admin"]} />
              }>
                <Route index element={<Approval />} />
              </Route>
              <Route path="/app/users" element={
                <ProtectedRoute allowedRoles={["admin"]} />
              }>
                <Route index element={<Users />} />
              </Route>
              <Route path="/app/atk-items" element={<ATKItems />} />
              <Route path="/app/purchases" element={<Purchases />} />
              <Route path="/app/purchases/new" element={<NewPurchase />} />
              <Route path="/app/purchases/:id" element={<PurchaseDetail />} />
              <Route path="/app/atk-requests" element={
                <ProtectedRoute allowedRoles={["pegawai", "verifikator", "penanggungjawab", "admin"]} />
              }>
                <Route index element={<ATKRequests />} />
              </Route>
              <Route path="/app/atk-requests/new" element={
                <ProtectedRoute allowedRoles={["pegawai", "verifikator", "penanggungjawab", "admin"]} />
              }>
                <Route index element={<NewATKRequest />} />
              </Route>
              <Route
                path="/app/atk-requests/:id"
                element={<ATKRequestDetail />}
              />
              <Route path="/app/initial-balance" element={<SaldoAwal />} />
              <Route path="/app/stock-opname" element={<StokOpname />} />
              <Route path="/app/monitoring" element={<Navigate to="/app" replace />} />
              <Route path="/app/stock-card" element={<StockCard />} />
              <Route path="/app/inventory-report" element={<InventoryReport />} />
              <Route path="/app/transfer-masuk" element={<TransferMasuk />} />
              <Route
                path="/app/transfer-masuk/new"
                element={<NewTransferMasuk />}
              />
              <Route
                path="/app/transfer-masuk/:id"
                element={<TransferMasukDetail />}
              />
              <Route path="/app/transfer-keluar" element={<TransferKeluar />} />
              <Route
                path="/app/transfer-keluar/new"
                element={<NewTransferKeluar />}
              />
              <Route
                path="/app/transfer-keluar/:id"
                element={<TransferKeluarDetail />}
              />
              <Route path="/app/settings" element={
                <ProtectedRoute allowedRoles={["pegawai", "verifikator", "penanggungjawab", "admin"]} />
              }>
                <Route index element={<Settings />} />
              </Route>
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
