import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import AdminComponents from './pages/admin/Components';
import FGProducts from './pages/admin/FGProducts';
import BOMMaster from './pages/admin/BOMMaster';
import Reports from './pages/admin/Reports';
import StockUpdate from './pages/admin/StockUpdate';
import Users from './pages/admin/Users';
import { clearCurrentUser, getCurrentUser, setCurrentUser } from './services/session';
import { fetchCurrentUser } from './services/api';
import { canOpenRoute } from './services/permissions';

function ProtectedRoute({ routeKey, children }) {
  const user = getCurrentUser();
  if (!user) return <Login />;
  if (!canOpenRoute(user, routeKey)) return <AdminDashboard />;
  return children;
}

function App() {
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    fetchCurrentUser()
      .then(setCurrentUser)
      .catch(() => clearCurrentUser())
      .finally(() => setAuthReady(true));
  }, []);

  return (
    <BrowserRouter>
      {!authReady ? (
        <div className="grid min-h-screen place-items-center bg-[#05050a] text-sm text-[#9c94a8]">Checking session…</div>
      ) : <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/admin" element={<ProtectedRoute routeKey="dashboard"><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/components" element={<ProtectedRoute routeKey="components"><AdminComponents /></ProtectedRoute>} />
        <Route path="/admin/fgproducts" element={<ProtectedRoute routeKey="products"><FGProducts /></ProtectedRoute>} />
        <Route path="/admin/bommaster" element={<ProtectedRoute routeKey="bom"><BOMMaster /></ProtectedRoute>} />
        <Route path="/admin/stock" element={<ProtectedRoute routeKey="stock"><StockUpdate /></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute routeKey="reports"><Reports /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute routeKey="users"><Users /></ProtectedRoute>} />
      </Routes>}
    </BrowserRouter>
  );
}

export default App;
