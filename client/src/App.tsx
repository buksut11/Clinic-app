import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Role } from './lib/types';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import PatientProfile from './pages/PatientProfile';
import Appointments from './pages/Appointments';
import Queue from './pages/Queue';
import Consultation from './pages/Consultation';
import Lab from './pages/Lab';
import Pharmacy from './pages/Pharmacy';
import Billing from './pages/Billing';
import InvoiceDetail from './pages/InvoiceDetail';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import ChangePassword from './pages/ChangePassword';

function Protected({ children, roles }: { children: JSX.Element; roles?: Role[] }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/patients" element={<Protected><Patients /></Protected>} />
      <Route path="/patients/:id" element={<Protected><PatientProfile /></Protected>} />
      <Route path="/appointments" element={<Protected roles={['ADMIN', 'DOCTOR', 'RECEPTIONIST']}><Appointments /></Protected>} />
      <Route path="/queue" element={<Protected><Queue /></Protected>} />
      <Route path="/consultation/:appointmentId" element={<Protected roles={['ADMIN', 'DOCTOR', 'NURSE']}><Consultation /></Protected>} />
      <Route path="/lab" element={<Protected roles={['ADMIN', 'DOCTOR', 'NURSE']}><Lab /></Protected>} />
      <Route path="/pharmacy" element={<Protected roles={['ADMIN', 'PHARMACIST']}><Pharmacy /></Protected>} />
      <Route path="/billing" element={<Protected roles={['ADMIN', 'RECEPTIONIST']}><Billing /></Protected>} />
      <Route path="/billing/:id" element={<Protected roles={['ADMIN', 'RECEPTIONIST']}><InvoiceDetail /></Protected>} />
      <Route path="/reports" element={<Protected roles={['ADMIN']}><Reports /></Protected>} />
      <Route path="/settings" element={<Protected roles={['ADMIN']}><Settings /></Protected>} />
      <Route path="/change-password" element={<Protected><ChangePassword /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
