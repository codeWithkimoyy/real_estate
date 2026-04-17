import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Navigation from './components/Navigation';
import HomePage from './pages/HomePage';
import ListingsPage from './pages/ListingsPage';
import PropertyDetailPage from './pages/PropertyDetailPage';
import AgentsPage from './pages/AgentsPage';
import DashboardPage from './pages/DashboardPage';
import SellPage from './pages/SellPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ProtectedRoute from './components/ProtectedRoute';
import { getStoredAuth, refreshToken } from './lib/auth';
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
  const isAuthPage = ['/login', '/register', '/forgot-password', '/reset-password'].includes(location.pathname);

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
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const bootstrapAuth = async () => {
      if (getStoredAuth()) {
        await refreshToken();
      }
      setAuthReady(true);
    };

    void bootstrapAuth();
  }, []);

  if (!authReady) {
    return null;
  }

  return (
    <Router>
      <ScrollToTop />
      <AppShell />
    </Router>
  );
}

export default App;
