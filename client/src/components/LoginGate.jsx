import { useState, useEffect, useCallback } from 'react';
import { estadoAuth, iniciarSesion, obtenerToken } from '../lib/api';

/**
 * Puerta de acceso al panel.
 *
 * Ojo: esto es UX, no seguridad. Lo que realmente protege los datos es el
 * middleware del backend — sin token válido, la API responde 401 aunque
 * alguien saltee esta pantalla.
 */
export default function LoginGate({ children }) {
  const [estado, setEstado] = useState('verificando'); // verificando | login | abierto
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const verificar = useCallback(async () => {
    try {
      const { proteccion_activa } = await estadoAuth();
      if (!proteccion_activa) return setEstado('abierto');
      setEstado(obtenerToken() ? 'abierto' : 'login');
    } catch {
      // Si /auth/estado no responde, mostramos el login igual: es preferible
      // pedir contraseña de más que dejar el panel abierto por un error de red.
      setEstado('login');
    }
  }, []);

  useEffect(() => { verificar(); }, [verificar]);

  useEffect(() => {
    const alExpirar = () => { setEstado('login'); setError('Tu sesión expiró. Ingresa de nuevo.'); };
    window.addEventListener('ceinys:sesion-expirada', alExpirar);
    return () => window.removeEventListener('ceinys:sesion-expirada', alExpirar);
  }, []);

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      await iniciarSesion(password);
      setPassword('');
      setEstado('abierto');
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (estado === 'verificando') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-ceinys-orange border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (estado === 'login') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4 font-sans">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <h1 className="text-2xl font-bold text-white tracking-tight">CEINYS</h1>
              <span className="w-2 h-2 bg-ceinys-orange rounded-sm" />
            </div>
            <p className="text-xs text-gray-500 uppercase tracking-[0.2em]">Panel de Control</p>
          </div>

          <form onSubmit={enviar} className="bg-gray-950 border border-gray-800 rounded-2xl p-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-gray-400">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
                className="w-full px-4 py-2.5 rounded-xl bg-black border border-gray-800 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-ceinys-orange focus:border-transparent transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={enviando || !password}
              className="w-full bg-ceinys-orange hover:bg-ceinys-orange-light disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold px-6 py-3 rounded-xl transition-all duration-200"
            >
              {enviando ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-600 mt-6">
            Acá se ven conversaciones y datos de clientes.
          </p>
        </div>
      </div>
    );
  }

  return children;
}
