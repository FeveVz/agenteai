import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Agendar from './pages/Agendar';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<Dashboard />} />
      {/* Pública: la abre el cliente desde el link que le manda Valeria */}
      <Route path="/agendar" element={<Agendar />} />
    </Routes>
  );
}
