import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

// --- Context Providers ---
import { AuthProvider } from '@/context/AuthContext';
import { AudioProvider } from '@/context/AudioContext';
import { UIProvider } from '@/context/UIContext';

// --- Pages ---
import { LoginPage } from '@/pages/LoginPage';
import { HomePage } from '@/pages/HomePage';
import { SearchPage } from '@/pages/SearchPage';
import { SavedPage } from '@/pages/SavedPage';         // Migrated
import { DashboardPage } from '@/pages/DashboardPage'; // Migrated
import { ProfilePage } from '@/pages/ProfilePage';
import { EmergencyPage } from '@/pages/EmergencyPage'; // Migrated
import { SettingsPage } from '@/pages/SettingsPage';   // Migrated
import { NarrativePage } from '@/pages/NarrativePage'; // Detailed Article View
import { ExplorePage } from '@/pages/ExplorePage';     // Discovery View

export default function App() {
  return (
    <AuthProvider>
      <AudioProvider>
        <UIProvider>
            <Routes>
              
              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected App Routes 
                  All routes inside this wrapper get the Header, Player, and Modals automatically.
              */}
              <Route element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }>
                {/* Core Feeds */}
                <Route path="/" element={<HomePage />} />
                <Route path="/explore" element={<ExplorePage />} />
                
                {/* Discovery & Search */}
                <Route path="/search" element={<SearchPage />} />
                
                {/* Personalization */}
                <Route path="/saved" element={<SavedPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                
                {/* Utilities */}
                <Route path="/emergency" element={<EmergencyPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                
                {/* Dynamic Content */}
                <Route path="/narrative/:id" element={<NarrativePage />} />
                
                {/* Fallback - Redirect unknown URLs to Home */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
        </UIProvider>
      </AudioProvider>
    </AuthProvider>
  );
}
