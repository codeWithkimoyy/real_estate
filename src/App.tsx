import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Navigation from './components/Navigation';
import HomePage from './pages/HomePage';
import ListingsPage from './pages/ListingsPage';
import PropertyDetailPage from './pages/PropertyDetailPage';
import AgentsPage from './pages/AgentsPage';
import DashboardPage from './pages/DashboardPage';
import SellPage from './pages/SellPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

function AppShell() {
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  return (
    <div className="relative min-h-screen app-shell">
      {/* Grain Overlay */}
      <div className="grain-overlay" />

      {/* Navigation - hidden on auth pages */}
      {!isAuthPage ? <Navigation /> : null}

      {/* Main Content */}
      <main className="relative">
        <Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/listings" element={<ListingsPage />} />
          <Route path="/property/:id" element={<PropertyDetailPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route
            path="/dashboard"
            element={(
              <ProtectedRoute requiredPermission="view_dashboard">
                <DashboardPage />
              </ProtectedRoute>
            )}
          />
          <Route path="/sell" element={<SellPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <ScrollToTop />
      <AppShell />
    </Router>
  );
}

export default App;
