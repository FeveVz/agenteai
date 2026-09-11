/**
 * Identidad visual de ESTE despliegue.
 *
 * Un solo repositorio atiende a varias clientas, cada una con su propio
 * proyecto de Vercel. Lo que las distingue son las variables de entorno, y
 * estas se hornean en el build: cada proyecto de Vercel compila su propio
 * bundle, así que el de Pamela no puede decir "Ceinys" ni por accidente.
 *
 * Ojo con la diferencia entre esto y `configuracion_agencia`:
 *
 *   · La BASE DE DATOS manda en todo lo que el agente DICE y en lo que ve
 *     el comprador dentro de la app (nombre de la empresa, horarios, FAQ).
 *     Se edita en caliente desde el panel.
 *
 *   · Estas variables cubren lo que tiene que existir ANTES de que cargue
 *     JavaScript: el <title>, el meta description y el favicon. Es lo que
 *     lee el bot de WhatsApp cuando alguien reenvía el enlace de agenda, y
 *     ese bot no ejecuta scripts. Por eso no puede salir de la base.
 *
 * Los valores por defecto son neutros a propósito: si una variable falta,
 * la página queda genérica en vez de mostrar la marca de otra clienta.
 */

const leer = (valor, porDefecto) => {
  const v = String(valor == null ? '' : valor).trim();
  return v || porDefecto;
};

export const MARCA = {
  /** Nombre comercial. Ej: "Ceinys", "Pamela Barrios". */
  nombre: leer(import.meta.env.VITE_MARCA_NOMBRE, 'Agente IA'),

  /** Bajada corta. Ej: "Constructora e Inmobiliaria". */
  descriptor: leer(import.meta.env.VITE_MARCA_DESCRIPTOR, ''),

  /** Cómo se llama la asesora virtual. Ej: "Valeria". */
  agente: leer(import.meta.env.VITE_MARCA_AGENTE, 'la asesora virtual'),
};
