import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { NarrativePage } from './pages/NarrativePage';
import { EmergencyPage } from './pages/EmergencyPage';
import { useAuth } from './context/AuthContext'; // Assuming context exists
import { Loader2 } from 'lucide-react';

// Simple Auth Guard
function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="h-screen w-full flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  
  // For now, we allow access but might redirect to login if strictly required
  // if (!user) return <Navigate to="/login" replace />;
  
  return children;
}

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* Public Routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/narrative/:id" element={<NarrativePage />} />
        <Route path="/emergency" element={<EmergencyPage />} />

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
