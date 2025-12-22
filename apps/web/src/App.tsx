import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthProvider } from '@/context/AuthContext';
import { AudioProvider } from '@/context/AudioContext';
import { UIProvider } from '@/context/UIContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

// Pages
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { SearchPage } from '@/pages/SearchPage';
import { EmergencyPage } from '@/pages/EmergencyPage';
import { SettingsPage } from '@/pages/SettingsPage';
// import { NarrativePage } from '@/pages/NarrativePage'; // Uncomment when ready

export default function App() {
  return (
    <AuthProvider>
      <AudioProvider>
        <UIProvider>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected App Routes */}
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/" element={<HomePage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/emergency" element={<EmergencyPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                
                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
        </UIProvider>
      </AudioProvider>
    </AuthProvider>
  );
}
