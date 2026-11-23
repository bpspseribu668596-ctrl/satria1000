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
import Monitoring from "./pages/Monitoring";
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
              <Route path="/app/new-request" element={<NewRequest />} />
              <Route path="/app/my-requests" element={<MyRequests />} />
              <Route path="/app/all-requests" element={<AllRequests />} />
              <Route path="/app/request/:id" element={<RequestDetail />} />
              <Route path="/app/requests/:id" element={<RequestDetail />} />
              <Route path="/app/verification" element={<Verification />} />
              <Route path="/app/approval" element={<Approval />} />
              <Route path="/app/users" element={<Users />} />
              <Route path="/app/atk-items" element={<ATKItems />} />
              <Route path="/app/purchases" element={<Purchases />} />
              <Route path="/app/purchases/new" element={<NewPurchase />} />
              <Route path="/app/purchases/:id" element={<PurchaseDetail />} />
              <Route path="/app/atk-requests" element={<ATKRequests />} />
              <Route path="/app/atk-requests/new" element={<NewATKRequest />} />
              <Route
                path="/app/atk-requests/:id"
                element={<ATKRequestDetail />}
              />
              <Route path="/app/initial-balance" element={<SaldoAwal />} />
              <Route path="/app/stock-opname" element={<StokOpname />} />
              <Route path="/app/monitoring" element={<Monitoring />} />
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
              <Route path="/app/settings" element={<Settings />} />
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
