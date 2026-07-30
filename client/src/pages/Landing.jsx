import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// Espejo de los proyectos sembrados en la tabla `proyectos`.
// Se deja fijo a propósito: la landing es pública y no debería
// depender de que Supabase esté arriba para poder renderizar.
const PROYECTOS = [
  'Altos de Sacta',
  'Valle Sacta',
  'Arenas del Valle',
  'Sol de Carhuaz',
  'Club Carhuaz',
  'La Palma Paracas',
  'Monte Alegre',
  'Los Sauces',
  'Casa Sauces',
];

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

function LogoCeinys({ className = '' }) {
  return (
    <span className={`inline-flex items-baseline gap-2 ${className}`}>
      <span className="font-bold tracking-tight text-white">CEINYS</span>
      <span className="w-2 h-2 bg-ceinys-orange rounded-sm" />
    </span>
  );
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
          <div className="flex flex-col">
            <LogoCeinys className="text-xl" />
            <span className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mt-0.5">
              Constructora e Inmobiliaria
            </span>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-ceinys-orange hover:bg-ceinys-orange-light text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors duration-200"
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
                CADA CONSULTA
              </h1>
              <h1 className="text-5xl md:text-6xl font-bold leading-none mb-2 tracking-tight text-ceinys-orange">
                ATENDIDA
              </h1>
              <h1 className="text-5xl md:text-6xl font-bold leading-none mb-8 tracking-tight">
                CADA VISITA<br />
                <span className="text-ceinys-blue">AGENDADA.</span>
              </h1>
              <p className="text-gray-400 text-lg leading-relaxed mb-10 max-w-lg">
                Valeria, nuestra asesora con IA, atiende por WhatsApp a toda hora. Responde
                sobre los proyectos de Ceinys, entiende qué busca cada cliente y le agenda
                la visita — sin que un asesor tenga que estar conectado.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="bg-ceinys-orange hover:bg-ceinys-orange-light text-white font-bold px-8 py-4 rounded-xl transition-all duration-200"
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
                  { valor: `${PROYECTOS.length}`, label: 'Proyectos en cartera' },
                  { valor: '24/7', label: 'Atención por WhatsApp' },
                  { valor: '0', label: 'Consultas sin responder' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <p className="text-3xl font-bold text-ceinys-orange">{stat.valor}</p>
                    <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-center animate-fade-in" style={{ animationDelay: '200ms' }}>
              <div className="relative">
                <div className="w-72 h-72 bg-gray-900 border border-gray-800 rounded-3xl flex items-center justify-center">
                  <div className="text-center px-6">
                    <p className="text-white text-5xl font-bold tracking-tighter leading-none">CEI</p>
                    <p className="text-ceinys-orange text-5xl font-bold tracking-tighter leading-none">NYS</p>
                    <div className="mt-4 pt-4 border-t border-gray-800">
                      <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em]">
                        Constructora<br />e Inmobiliaria
                      </p>
                    </div>
                  </div>
                </div>
                <div className="absolute -top-4 -right-6 bg-white rounded-2xl shadow-2xl p-4 max-w-52">
                  <p className="text-xs text-gray-400 mb-1">Valeria — Ahora</p>
                  <p className="text-sm text-gray-800 font-medium">
                    ¡Hola! ¿Buscás un lote para vivir o para invertir?
                  </p>
                </div>
                <div className="absolute -bottom-4 -left-6 bg-ceinys-blue rounded-2xl shadow-lg p-4 max-w-48">
                  <p className="text-xs text-sky-50 font-medium mb-1">Visita confirmada</p>
                  <p className="text-sm text-white font-semibold">Altos de Sacta — sábado 10:00</p>
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
            Ceinys — Constructora e Inmobiliaria
          </p>
        </div>
      </section>

      {/* Qué hace el agente */}
      <section ref={refCards} className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16 animar-al-scroll">
            <h2 className="text-4xl md:text-5xl font-bold text-black mb-4 leading-tight">
              Lo que Valeria<br />hace por el equipo
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              Tu asesora IA filtra y agenda mientras el equipo comercial cierra ventas.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                numero: '01',
                titulo: 'Disponible 24/7',
                descripcion: 'Ningún interesado queda sin respuesta. Valeria contesta a cualquier hora, fines de semana y feriados incluidos.',
              },
              {
                numero: '02',
                titulo: 'Agenda visitas',
                descripcion: 'Coordina la visita al proyecto con fecha, hora y nombre real del cliente. El asesor recibe todo listo en el panel.',
              },
              {
                numero: '03',
                titulo: 'Califica el interés',
                descripcion: 'Detecta si busca vivienda o inversión, qué zona le interesa y su presupuesto — antes de que un asesor invierta tiempo.',
              },
            ].map((card, i) => (
              <div
                key={card.titulo}
                className="animar-al-scroll border border-gray-200 rounded-2xl p-8 hover:border-ceinys-orange hover:shadow-lg transition-all duration-300 group"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <p className="text-ceinys-orange font-bold text-sm mb-6">{card.numero}</p>
                <h3 className="text-xl font-bold text-black mb-3 group-hover:text-ceinys-orange transition-colors">{card.titulo}</h3>
                <p className="text-gray-500 leading-relaxed">{card.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Proyectos */}
      <section className="py-20 bg-black">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Nuestros proyectos</h2>
            <p className="text-gray-500">
              Valeria solo habla de estos proyectos — nunca inventa uno que no exista
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {PROYECTOS.map((proyecto) => (
              <span
                key={proyecto}
                className="border border-gray-700 text-gray-300 hover:border-ceinys-orange hover:text-ceinys-orange text-sm font-medium px-4 py-2 rounded-full transition-colors cursor-default"
              >
                {proyecto}
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
            <p className="text-gray-500 text-lg">Del primer mensaje a la visita confirmada en segundos.</p>
          </div>
          <div className="space-y-6">
            {[
              {
                paso: '01',
                titulo: 'El interesado escribe al WhatsApp',
                descripcion: 'Cualquier persona que vio un anuncio o pasó por un proyecto escribe al número de Ceinys, a cualquier hora.',
              },
              {
                paso: '02',
                titulo: 'Valeria responde al instante',
                descripcion: 'Entiende si busca vivienda o inversión, le cuenta de los proyectos que encajan y lo guía hacia una visita.',
              },
              {
                paso: '03',
                titulo: 'La visita queda agendada',
                descripcion: 'Se registra con nombre, fecha, hora y proyecto. El asesor lo ve en el panel y solo se ocupa de recibir al cliente.',
              },
            ].map((item, i) => (
              <div key={item.paso} className="animar-al-scroll flex gap-6 items-start group" style={{ animationDelay: `${i * 150}ms` }}>
                <div className="flex-shrink-0 w-16 h-16 bg-black group-hover:bg-ceinys-orange rounded-xl flex items-center justify-center transition-colors duration-300">
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
            CONSTRUIMOS.<br />
            <span className="text-ceinys-orange">VOS DECIDÍS DÓNDE.</span>
          </h2>
          <p className="text-gray-500 text-lg mb-10">
            Cargá los datos de cada proyecto y Valeria empieza a captar visitas por WhatsApp.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-ceinys-orange hover:bg-ceinys-orange-light text-white font-bold px-12 py-4 rounded-xl transition-all duration-200 text-lg"
          >
            Ir al Panel →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-950 text-gray-500 py-10 border-t border-gray-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <LogoCeinys />
            <span className="text-sm">Constructora e Inmobiliaria</span>
          </div>
          <p className="text-sm">Agente IA de atención por WhatsApp</p>
          <button onClick={() => navigate('/dashboard')} className="text-ceinys-orange hover:text-ceinys-orange-light text-sm transition-colors font-medium">
            Panel de Control →
          </button>
        </div>
      </footer>
    </div>
  );
}
