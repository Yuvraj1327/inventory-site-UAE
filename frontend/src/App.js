import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";
import Orders from "@/pages/Orders";
import Parties from "@/pages/Parties";
import Scanner from "@/pages/Scanner";
import Chat from "@/pages/Chat";
import Reminders from "@/pages/Reminders";
import Inventory from "@/pages/Inventory";
import Purchases from "@/pages/Purchases";
import Invoices from "@/pages/Invoices";
import Portal from "@/pages/Portal";
import LostSales from "@/pages/LostSales";
import SupplierMonitoring from "@/pages/SupplierMonitoring";
import AIAgentControlCenter from "@/pages/AIAgentControlCenter";
import CustomerIntelligence from "@/pages/CustomerIntelligence";
import Accounting from "@/pages/Accounting";

function App() {
  return (
    <div className="App">
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/portal" element={<ProtectedRoute role="customer"><Portal /></ProtectedRoute>} />
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
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
