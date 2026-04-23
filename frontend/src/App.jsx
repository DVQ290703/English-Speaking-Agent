import { Navigate, Route, Routes } from "react-router-dom";

import { getAuthSession } from "./auth/tokenStorage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import VoiceAgent from "./pages/VoiceAgent";

function ProtectedRoute({ children }) {
  const session = getAuthSession();
  if (!session?.token) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/demo" element={<VoiceAgent />} />
      <Route path="/VoiceAgent" element={<VoiceAgent />} />
      <Route path="/chat" element={<VoiceAgent />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
