import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// Hook para animaciones al hacer scroll (Intersection Observer)
function useScrollAnimation() {
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-fade-in-up');
            entry.target.style.opacity = '1';
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    const elementos = ref.current?.querySelectorAll('.animar-al-scroll');
    elementos?.forEach((el) => {
      el.style.opacity = '0';
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return ref;
}

export default function Landing() {
  const navigate = useNavigate();
  const seccionCaracteristicas = useScrollAnimation();
  const seccionPasos = useScrollAnimation();

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🦷</span>
            <span className="font-semibold text-slate-800 text-lg">Clínica Dental Sonrisa</span>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors duration-200"
          >
            Dashboard
          </button>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-sky-50 via-white to-blue-50">
        {/* Decoración de fondo */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-100 rounded-full opacity-30 -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-sky-100 rounded-full opacity-40 translate-y-1/2 -translate-x-1/3" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Texto */}
            <div className="animate-fade-in-up">
              <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-sm font-medium px-4 py-2 rounded-full mb-6">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Disponible 24/7 por WhatsApp
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-slate-900 leading-tight mb-6">
                Tu Clínica Dental,{' '}
                <span className="text-blue-700">Siempre Disponible</span>
              </h1>
              <p className="text-lg text-slate-600 leading-relaxed mb-8">
                Sarah, nuestra recepcionista virtual con IA, atiende a tus pacientes por WhatsApp
                en cualquier momento. Agendá, cancelá y consultá turnos sin esperas ni llamadas.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-8 py-3 rounded-xl transition-all duration-200 shadow-lg shadow-blue-200 hover:shadow-blue-300 hover:-translate-y-0.5"
                >
                  Ir al Dashboard →
                </button>
                <a
                  href="#como-funciona"
                  className="border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 font-medium px-8 py-3 rounded-xl transition-all duration-200 text-center"
                >
                  ¿Cómo funciona?
                </a>
              </div>
            </div>

            {/* Ilustración */}
            <div className="flex justify-center animate-fade-in" style={{ animationDelay: '200ms' }}>
              <div className="relative">
                <div className="w-72 h-72 bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl shadow-2xl shadow-blue-200 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-8xl mb-4">🦷</div>
                    <div className="text-white text-4xl">💬</div>
                  </div>
                </div>
                {/* Chat bubble decorativo */}
                <div className="absolute -top-4 -right-4 bg-white rounded-2xl shadow-lg p-4 max-w-48 border border-slate-100">
                  <p className="text-xs text-slate-500 mb-1">Sarah — Ahora</p>
                  <p className="text-sm text-slate-800">¡Hola! ¿Querés agendar un turno? 😊</p>
                </div>
                <div className="absolute -bottom-4 -left-4 bg-green-50 rounded-2xl shadow-lg p-4 max-w-44 border border-green-100">
                  <p className="text-xs text-green-600 font-medium mb-1">✅ Turno confirmado</p>
                  <p className="text-sm text-slate-700">Martes 22/03 — 14:30 hs</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Características ──────────────────────────────────────────────── */}
      <section ref={seccionCaracteristicas} className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 animar-al-scroll">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Todo lo que necesita tu clínica
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              Un sistema completo que automatiza la gestión de turnos y mejora la experiencia de tus pacientes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                emoji: '🕐',
                titulo: 'Disponible 24/7',
                descripcion:
                  'Tus pacientes pueden agendar turnos a cualquier hora, incluso los fines de semana. Sin esperas, sin llamadas perdidas.',
                color: 'from-blue-50 to-sky-50',
                borde: 'border-blue-100',
              },
              {
                emoji: '📅',
                titulo: 'Turnos Automáticos',
                descripcion:
                  'Agendá, cancelá o reprogramá turnos directamente por WhatsApp. El sistema gestiona todo sin intervención manual.',
                color: 'from-emerald-50 to-teal-50',
                borde: 'border-emerald-100',
              },
              {
                emoji: '🤖',
                titulo: 'IA Inteligente',
                descripcion:
                  'Sarah recuerda el contexto de cada conversación, responde al instante y nunca comete errores de agenda.',
                color: 'from-purple-50 to-violet-50',
                borde: 'border-purple-100',
              },
            ].map((card, i) => (
              <div
                key={card.titulo}
                className={`animar-al-scroll bg-gradient-to-br ${card.color} border ${card.borde} rounded-2xl p-8 hover:shadow-lg transition-all duration-300 hover:-translate-y-1`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="text-5xl mb-5">{card.emoji}</div>
                <h3 className="text-xl font-semibold text-slate-800 mb-3">{card.titulo}</h3>
                <p className="text-slate-600 leading-relaxed">{card.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cómo funciona ────────────────────────────────────────────────── */}
      <section
        id="como-funciona"
        ref={seccionPasos}
        className="py-20 bg-gradient-to-br from-slate-50 to-sky-50"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14 animar-al-scroll">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Cómo funciona
            </h2>
            <p className="text-slate-500 text-lg">
              En tres simples pasos, tu paciente tiene su turno confirmado.
            </p>
          </div>

          <div className="relative">
            {/* Línea conectora */}
            <div className="absolute left-8 top-12 bottom-12 w-0.5 bg-blue-200 hidden md:block" />

            <div className="space-y-8">
              {[
                {
                  paso: 1,
                  titulo: 'Escribí al WhatsApp de la clínica',
                  descripcion:
                    'El paciente manda un mensaje de WhatsApp al número de la clínica, en cualquier momento del día.',
                  icono: '💬',
                },
                {
                  paso: 2,
                  titulo: 'Sarah te atiende al instante',
                  descripcion:
                    'La IA responde de inmediato, entiende qué necesita el paciente y consulta la disponibilidad en tiempo real.',
                  icono: '🤖',
                },
                {
                  paso: 3,
                  titulo: 'Tu turno queda confirmado',
                  descripcion:
                    'El turno se agenda automáticamente en el sistema. El paciente recibe confirmación y el staff lo ve en el dashboard.',
                  icono: '✅',
                },
              ].map((item, i) => (
                <div
                  key={item.paso}
                  className="animar-al-scroll flex gap-6 items-start"
                  style={{ animationDelay: `${i * 150}ms` }}
                >
                  <div className="flex-shrink-0 w-16 h-16 bg-blue-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 z-10">
                    <span className="text-2xl">{item.icono}</span>
                  </div>
                  <div className="bg-white rounded-2xl p-6 flex-1 shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-200">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                        Paso {item.paso}
                      </span>
                      <h3 className="font-semibold text-slate-800 text-lg">{item.titulo}</h3>
                    </div>
                    <p className="text-slate-500 leading-relaxed">{item.descripcion}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Final ────────────────────────────────────────────────────── */}
      <section className="py-20 bg-blue-700">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Empezá hoy mismo
          </h2>
          <p className="text-blue-200 text-lg mb-8">
            Accedé al dashboard para configurar tu clínica y conectar con WhatsApp en minutos.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-white text-blue-700 hover:bg-blue-50 font-semibold px-10 py-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5 text-lg"
          >
            Ir al Dashboard →
          </button>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🦷</span>
            <span className="text-slate-300 font-medium">Clínica Dental Sonrisa</span>
          </div>
          <p className="text-sm">Sistema de gestión de turnos con IA — {new Date().getFullYear()}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
          >
            Acceder al Dashboard →
          </button>
        </div>
      </footer>
    </div>
  );
}
