import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import { ExplorePage } from './pages/ExplorePage'; // New Import
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { NarrativePage } from './pages/NarrativePage';
import { EmergencyPage } from './pages/EmergencyPage';
import { LoginPage } from './pages/LoginPage';
import { useAuth } from './context/AuthContext';
import { Loader2 } from 'lucide-react';

// Guards (Same as before)
function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen w-full flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnlyRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/profile" replace />;
  return children;
}

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* Public Routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/explore" element={<ExplorePage />} /> {/* New Route */}
        <Route path="/narrative/:id" element={<NarrativePage />} />
        <Route path="/emergency" element={<EmergencyPage />} />
        
        {/* Auth Route */}
        <Route path="/login" element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        } />

        {/* Protected Routes */}
        <Route path="/profile" element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        } />
      </Route>
    </Routes>
  );
}

export default App;
