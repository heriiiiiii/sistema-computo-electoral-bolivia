import { Navigate, Route, Routes } from 'react-router-dom';
import DashboardLayout from './components/layout/DashboardLayout';
import DashboardHome from './pages/DashboardHome';
import ComparacionPage from './pages/ComparacionPage';
import ActasPage from './pages/ActasPage';
import InconsistenciasPage from './pages/InconsistenciasPage';
import GeograficoPage from './pages/GeograficoPage';
import TecnicoPage from './pages/TecnicoPage';

export default function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route path="/" element={<DashboardHome />} />
        <Route path="/comparacion" element={<ComparacionPage />} />
        <Route path="/actas" element={<ActasPage />} />
        <Route path="/inconsistencias" element={<InconsistenciasPage />} />
        <Route path="/geografico" element={<GeograficoPage />} />
        <Route path="/tecnico" element={<TecnicoPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}