import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

function useScrollAnimation() {
  const ref = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('animate-fade-in-up');
          e.target.style.opacity = '1';
          observer.unobserve(e.target);
        }
      }),
      { threshold: 0.1 }
    );
    const els = ref.current?.querySelectorAll('.animar-al-scroll');
    els?.forEach((el) => { el.style.opacity = '0'; observer.observe(el); });
    return () => observer.disconnect();
  }, []);
  return ref;
}

export default function Landing() {
  const navigate = useNavigate();
  const refCards = useScrollAnimation();
  const refPasos = useScrollAnimation();

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-bold text-slate-800 text-lg tracking-tight">Suggestion</span>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors duration-200"
          >
            Panel de Control
          </button>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-violet-50 via-white to-purple-50">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-100 rounded-full opacity-40 -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-100 rounded-full opacity-30 translate-y-1/2 -translate-x-1/3" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
          <div className="grid md:grid-cols-2 gap-14 items-center">
            <div className="animate-fade-in-up">
              <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 text-sm font-medium px-4 py-2 rounded-full mb-6">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Atención 24/7 por WhatsApp
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-slate-900 leading-tight mb-4">
                Consigue lo posible{' '}
                <span className="text-violet-600">haciendo lo imposible</span>
              </h1>
              <p className="text-lg text-slate-500 leading-relaxed mb-8">
                Valeria, nuestra asistente con IA, atiende a tus prospectos por WhatsApp en cualquier momento.
                Agenda reuniones, responde consultas y califica leads — sin que intervenga nadie del equipo.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="bg-violet-600 hover:bg-violet-700 text-white font-semibold px-8 py-3 rounded-xl transition-all duration-200 shadow-lg shadow-violet-200 hover:-translate-y-0.5"
                >
                  Ir al Panel →
                </button>
                <a
                  href="#como-funciona"
                  className="border border-slate-200 hover:border-violet-300 text-slate-700 hover:text-violet-700 font-medium px-8 py-3 rounded-xl transition-all duration-200 text-center"
                >
                  ¿Cómo funciona?
                </a>
              </div>

              {/* Stats */}
              <div className="flex gap-8 mt-10 pt-8 border-t border-slate-100">
                {[
                  { valor: '150+', label: 'Clientes satisfechos' },
                  { valor: '500+', label: 'Proyectos completados' },
                  { valor: '95%', label: 'Tasa de retención' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <p className="text-2xl font-bold text-violet-600">{stat.valor}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Ilustración */}
            <div className="flex justify-center animate-fade-in" style={{ animationDelay: '200ms' }}>
              <div className="relative">
                <div className="w-72 h-72 bg-gradient-to-br from-violet-600 to-purple-700 rounded-3xl shadow-2xl shadow-violet-200 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-7xl mb-3">💼</div>
                    <div className="text-white text-4xl">💬</div>
                  </div>
                </div>
                <div className="absolute -top-4 -right-6 bg-white rounded-2xl shadow-xl p-4 max-w-52 border border-slate-100">
                  <p className="text-xs text-slate-400 mb-1">Valeria — Ahora</p>
                  <p className="text-sm text-slate-800">¡Hola! ¿Te interesa impulsar tu marca? 🚀</p>
                </div>
                <div className="absolute -bottom-4 -left-6 bg-violet-50 rounded-2xl shadow-lg p-4 max-w-48 border border-violet-100">
                  <p className="text-xs text-violet-600 font-medium mb-1">✅ Reunión confirmada</p>
                  <p className="text-sm text-slate-700">Consultoría — Mar 22, 14:30</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Servicios ────────────────────────────────────────────────────── */}
      <section ref={refCards} className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 animar-al-scroll">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Lo que Valeria hace por vos
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              Tu asistente IA trabaja mientras tu equipo cierra negocios.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                emoji: '🕐',
                titulo: 'Disponible 24/7',
                descripcion: 'Ningún prospecto queda sin respuesta. Valeria atiende a cualquier hora, incluso fines de semana y feriados.',
                color: 'from-violet-50 to-purple-50',
                borde: 'border-violet-100',
              },
              {
                emoji: '📅',
                titulo: 'Agenda Automática',
                descripcion: 'Coordina reuniones de consultoría, presentaciones y seguimientos sin que nadie del equipo intervenga.',
                color: 'from-blue-50 to-indigo-50',
                borde: 'border-blue-100',
              },
              {
                emoji: '🎯',
                titulo: 'Califica Leads',
                descripcion: 'Identifica qué servicio necesita cada prospecto, tamaño de empresa y objetivo — información lista para el equipo de ventas.',
                color: 'from-emerald-50 to-teal-50',
                borde: 'border-emerald-100',
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

      {/* ── Servicios de la agencia ──────────────────────────────────────── */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Nuestros servicios</h2>
            <p className="text-slate-500">Valeria conoce cada uno en detalle y los presenta con precisión</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              'Marketing Digital', 'Redes Sociales', 'Meta Ads & Google Ads',
              'SEO', 'Branding', 'Desarrollo Web',
              'Consultoría Estratégica', 'CRM y Automatización', 'Producción Audiovisual',
              'Investigación de Mercado',
            ].map((servicio) => (
              <span
                key={servicio}
                className="bg-white border border-violet-200 text-violet-700 text-sm font-medium px-4 py-2 rounded-full shadow-sm"
              >
                {servicio}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cómo funciona ────────────────────────────────────────────────── */}
      <section id="como-funciona" ref={refPasos} className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14 animar-al-scroll">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Cómo funciona</h2>
            <p className="text-slate-500 text-lg">Del primer mensaje a la reunión confirmada en segundos.</p>
          </div>
          <div className="relative">
            <div className="absolute left-8 top-12 bottom-12 w-0.5 bg-violet-200 hidden md:block" />
            <div className="space-y-8">
              {[
                { paso: 1, icono: '💬', titulo: 'El prospecto escribe al WhatsApp', descripcion: 'Cualquier persona interesada en los servicios de Suggestion escribe al número de WhatsApp, en cualquier momento.' },
                { paso: 2, icono: '🤖', titulo: 'Valeria responde al instante', descripcion: 'La IA entiende qué necesita el prospecto, responde con información precisa sobre servicios y lo guía hacia una reunión.' },
                { paso: 3, icono: '📅', titulo: 'La reunión queda confirmada', descripcion: 'Se agenda automáticamente con nombre, empresa y servicio de interés. El equipo recibe todo listo en el panel.' },
              ].map((item, i) => (
                <div key={item.paso} className="animar-al-scroll flex gap-6 items-start" style={{ animationDelay: `${i * 150}ms` }}>
                  <div className="flex-shrink-0 w-16 h-16 bg-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-200 z-10">
                    <span className="text-2xl">{item.icono}</span>
                  </div>
                  <div className="bg-white rounded-2xl p-6 flex-1 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="bg-violet-100 text-violet-700 text-xs font-semibold px-2.5 py-1 rounded-full">Paso {item.paso}</span>
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

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-20 bg-gradient-to-br from-violet-600 to-purple-700">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Empezá ahora</h2>
          <p className="text-violet-200 text-lg mb-8">
            Configurá Valeria para Suggestion y empezá a captar reuniones automáticamente.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-white text-violet-700 hover:bg-violet-50 font-semibold px-10 py-4 rounded-xl transition-all duration-200 shadow-lg hover:-translate-y-0.5 text-lg"
          >
            Ir al Panel →
          </button>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-violet-600 rounded flex items-center justify-center">
              <span className="text-white font-bold text-xs">S</span>
            </div>
            <span className="text-slate-300 font-medium">Suggestion</span>
            <span className="text-slate-600">·</span>
            <span className="text-sm">Agencia de Marketing Digital</span>
          </div>
          <p className="text-sm">suggesion.mk@gmail.com · +51 937770159</p>
          <button onClick={() => navigate('/dashboard')} className="text-violet-400 hover:text-violet-300 text-sm transition-colors">
            Panel de Control →
          </button>
        </div>
      </footer>
    </div>
  );
}
