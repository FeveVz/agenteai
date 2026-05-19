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
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold text-white text-xl tracking-tight">Sugpestion</span>
            <span className="w-2 h-2 bg-sky-400 rounded-full" />
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors duration-200"
          >
            Panel de Control
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-black text-white overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-24 md:py-32">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="animate-fade-in-up">
              <div className="inline-flex items-center gap-2 border border-gray-700 text-gray-400 text-xs font-medium px-4 py-2 rounded-full mb-8">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                Atención 24/7 por WhatsApp
              </div>
              <h1 className="text-5xl md:text-6xl font-bold leading-none mb-2 tracking-tight">
                CONSIGUE LO
              </h1>
              <h1 className="text-5xl md:text-6xl font-bold leading-none mb-2 tracking-tight text-sky-400">
                POSIBLE
              </h1>
              <h1 className="text-5xl md:text-6xl font-bold leading-none mb-8 tracking-tight">
                HACIENDO LO<br />
                <span className="text-sky-400">IMPOSIBLE.</span>
              </h1>
              <p className="text-gray-400 text-lg leading-relaxed mb-10 max-w-lg">
                Valeria, nuestra asistente con IA, atiende a tus prospectos por WhatsApp en cualquier momento.
                Agenda reuniones, responde consultas y califica leads — sin que intervenga nadie del equipo.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="bg-sky-500 hover:bg-sky-400 text-white font-bold px-8 py-4 rounded-xl transition-all duration-200"
                >
                  Ir al Panel →
                </button>
                <a
                  href="#como-funciona"
                  className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-medium px-8 py-4 rounded-xl transition-all duration-200 text-center"
                >
                  ¿Cómo funciona?
                </a>
              </div>

              <div className="flex gap-10 mt-12 pt-10 border-t border-gray-800">
                {[
                  { valor: '150+', label: 'Clientes satisfechos' },
                  { valor: '500+', label: 'Proyectos completados' },
                  { valor: '95%', label: 'Tasa de retención' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <p className="text-3xl font-bold text-sky-400">{stat.valor}</p>
                    <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-center animate-fade-in" style={{ animationDelay: '200ms' }}>
              <div className="relative">
                <div className="w-72 h-72 bg-gray-900 border border-gray-800 rounded-3xl flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-white text-6xl font-bold tracking-tighter">Sugp</p>
                    <p className="text-sky-400 text-6xl font-bold tracking-tighter">esti</p>
                    <p className="text-white text-6xl font-bold tracking-tighter">on</p>
                    <span className="inline-block w-2 h-2 bg-sky-400 rounded-full -mt-2 ml-1" />
                  </div>
                </div>
                <div className="absolute -top-4 -right-6 bg-white rounded-2xl shadow-2xl p-4 max-w-52">
                  <p className="text-xs text-gray-400 mb-1">Valeria — Ahora</p>
                  <p className="text-sm text-gray-800 font-medium">¡Hola! ¿Te interesa impulsar tu marca?</p>
                </div>
                <div className="absolute -bottom-4 -left-6 bg-sky-500 rounded-2xl shadow-lg p-4 max-w-48">
                  <p className="text-xs text-sky-100 font-medium mb-1">Reunión confirmada</p>
                  <p className="text-sm text-white font-semibold">Consultoría — confirmada</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tagline */}
      <section className="bg-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-center text-gray-400 text-sm font-medium tracking-widest uppercase">
            No todo es lo que ves — Suggestion, Agencia de Marketing Digital
          </p>
        </div>
      </section>

      {/* Servicios del agente */}
      <section ref={refCards} className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16 animar-al-scroll">
            <h2 className="text-4xl md:text-5xl font-bold text-black mb-4 leading-tight">
              Lo que Valeria<br />hace por vos
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              Tu asistente IA trabaja mientras tu equipo cierra negocios.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                numero: '01',
                titulo: 'Disponible 24/7',
                descripcion: 'Ningún prospecto queda sin respuesta. Valeria atiende a cualquier hora, incluso fines de semana y feriados.',
              },
              {
                numero: '02',
                titulo: 'Agenda Automática',
                descripcion: 'Coordina reuniones de consultoría, presentaciones y seguimientos sin que nadie del equipo intervenga.',
              },
              {
                numero: '03',
                titulo: 'Califica Leads',
                descripcion: 'Identifica qué servicio necesita cada prospecto, tamaño de empresa y objetivo — información lista para el equipo de ventas.',
              },
            ].map((card, i) => (
              <div
                key={card.titulo}
                className="animar-al-scroll border border-gray-200 rounded-2xl p-8 hover:border-black hover:shadow-lg transition-all duration-300 group"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <p className="text-sky-500 font-bold text-sm mb-6">{card.numero}</p>
                <h3 className="text-xl font-bold text-black mb-3 group-hover:text-sky-500 transition-colors">{card.titulo}</h3>
                <p className="text-gray-500 leading-relaxed">{card.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Servicios de la agencia */}
      <section className="py-20 bg-black">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Nuestros servicios</h2>
            <p className="text-gray-500">Valeria conoce cada uno en detalle y los presenta con precisión</p>
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
                className="border border-gray-700 text-gray-300 hover:border-sky-500 hover:text-sky-400 text-sm font-medium px-4 py-2 rounded-full transition-colors cursor-default"
              >
                {servicio}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" ref={refPasos} className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16 animar-al-scroll">
            <h2 className="text-4xl md:text-5xl font-bold text-black mb-4">Cómo funciona</h2>
            <p className="text-gray-500 text-lg">Del primer mensaje a la reunión confirmada en segundos.</p>
          </div>
          <div className="space-y-6">
            {[
              { paso: '01', titulo: 'El prospecto escribe al WhatsApp', descripcion: 'Cualquier persona interesada en los servicios de Suggestion escribe al número de WhatsApp, en cualquier momento.' },
              { paso: '02', titulo: 'Valeria responde al instante', descripcion: 'La IA entiende qué necesita el prospecto, responde con información precisa sobre servicios y lo guía hacia una reunión.' },
              { paso: '03', titulo: 'La reunión queda confirmada', descripcion: 'Se agenda automáticamente con nombre, empresa y servicio de interés. El equipo recibe todo listo en el panel.' },
            ].map((item, i) => (
              <div key={item.paso} className="animar-al-scroll flex gap-6 items-start group" style={{ animationDelay: `${i * 150}ms` }}>
                <div className="flex-shrink-0 w-16 h-16 bg-black group-hover:bg-sky-500 rounded-xl flex items-center justify-center transition-colors duration-300">
                  <span className="text-white font-bold text-lg">{item.paso}</span>
                </div>
                <div className="border border-gray-200 rounded-2xl p-6 flex-1 hover:border-gray-400 transition-colors">
                  <h3 className="font-bold text-black text-lg mb-2">{item.titulo}</h3>
                  <p className="text-gray-500 leading-relaxed">{item.descripcion}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-black">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
            CADA VES ME<br />SIENTO MEJOR.
          </h2>
          <p className="text-gray-500 text-lg mb-10">
            Suggestion es aliento. Configurá Valeria y empezá a captar reuniones automáticamente.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-sky-500 hover:bg-sky-400 text-white font-bold px-12 py-4 rounded-xl transition-all duration-200 text-lg"
          >
            Ir al Panel →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-950 text-gray-500 py-10 border-t border-gray-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold">Sugpestion</span>
            <span className="w-1.5 h-1.5 bg-sky-400 rounded-full" />
            <span className="text-sm">Agencia de Marketing Digital</span>
          </div>
          <p className="text-sm">suggesion.mk@gmail.com · +51 937770159</p>
          <button onClick={() => navigate('/dashboard')} className="text-sky-500 hover:text-sky-400 text-sm transition-colors font-medium">
            Panel de Control →
          </button>
        </div>
      </footer>
    </div>
  );
}
