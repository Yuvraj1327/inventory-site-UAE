import "@/App.css";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import ErrorBoundary from "@/components/ErrorBoundary";

// Every page is its own chunk, fetched on first visit instead of all
// upfront — this is what actually moves the needle on initial load time,
// since the app has ~15 fairly heavy pages (tables, charts, dialogs) that
// most visits only ever touch a couple of.
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Transactions = lazy(() => import("@/pages/Transactions"));
const Orders = lazy(() => import("@/pages/Orders"));
const Parties = lazy(() => import("@/pages/Parties"));
const Scanner = lazy(() => import("@/pages/Scanner"));
const Chat = lazy(() => import("@/pages/Chat"));
const Reminders = lazy(() => import("@/pages/Reminders"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const Purchases = lazy(() => import("@/pages/Purchases"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const Portal = lazy(() => import("@/pages/Portal"));
const LostSales = lazy(() => import("@/pages/LostSales"));
const SupplierMonitoring = lazy(() => import("@/pages/SupplierMonitoring"));
const AIAgentControlCenter = lazy(() => import("@/pages/AIAgentControlCenter"));
const CustomerIntelligence = lazy(() => import("@/pages/CustomerIntelligence"));
const Accounting = lazy(() => import("@/pages/Accounting"));

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="h-6 w-6 rounded-full border-2 border-border border-t-foreground animate-spin" />
    </div>
  );
}

// Gives ErrorBoundary a fresh key per route, so a crash on one page
// doesn't permanently wedge navigation to every other page.

function App() {
  return (
    <div className="App">
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/portal" element={<ProtectedRoute role="customer"><ErrorBoundary resetKey="portal"><Portal /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/" element={<ProtectedRoute role={["admin", "staff"]}><Layout /></ProtectedRoute>}>
                <Route index element={<Dashboard />} />
                <Route path="transactions" element={<Transactions />} />
                <Route path="orders" element={<Orders />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="purchases" element={<Purchases />} />
                <Route path="invoices" element={<Invoices />} />
                <Route path="accounting" element={<Accounting />} />
                <Route path="lost-sales" element={<LostSales />} />
                <Route path="supplier-monitoring" element={<SupplierMonitoring />} />
                <Route path="ai-agent" element={<AIAgentControlCenter />} />
                <Route path="customer-intelligence" element={<CustomerIntelligence />} />
                <Route path="customers" element={<Parties kind="customer" />} />
                <Route path="suppliers" element={<Parties kind="supplier" />} />
                <Route path="reminders" element={<Reminders />} />
                <Route path="scanner" element={<Scanner />} />
                <Route path="assistant" element={<Chat />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
