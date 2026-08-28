import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { YearProvider } from './context/YearContext';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import StudentDetail from './pages/StudentDetail';
import CollectFee from './pages/CollectFee';
import Reports from './pages/Reports';
import Setup from './pages/Setup';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

function Protected({ children }) {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center text-sm text-muted">
        Loading…
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <Protected>
                  <YearProvider>
                    <AppLayout />
                  </YearProvider>
                </Protected>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="students" element={<Students />} />
              <Route path="students/:id" element={<StudentDetail />} />
              <Route path="collect" element={<CollectFee />} />
              <Route path="reports" element={<Reports />} />
              <Route path="setup" element={<Setup />} />
              {/* Old links still work */}
              <Route path="academic-years" element={<Navigate to="/setup" replace />} />
              <Route path="settings" element={<Navigate to="/setup" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
