import { useQuery } from '@tanstack/react-query';
import { obtenerConfiguracion } from '../../lib/api';
import { MARCA } from '../../config/marca';

/**
 * Cómo se llama el agente, según la base.
 *
 * Por qué no alcanza con MARCA.agente: ese valor viene de una variable de
 * build (VITE_MARCA_AGENTE), así que Pamela cambiaba el nombre en
 * Configuración, el agente empezaba a presentarse con el nombre nuevo por
 * WhatsApp, y el panel seguía diciendo el viejo en todas sus frases ("Camila
 * no va a poder dar precio ni metraje"). Para que el panel se enterara había
 * que volver a desplegar, y mientras tanto parecía que el cambio no se había
 * guardado.
 *
 * MARCA.agente queda como respaldo mientras la consulta carga o si el campo
 * está vacío. Las variables de build siguen siendo las que mandan en el
 * <title>, el meta y el favicon, que tienen que existir antes del JavaScript.
 *
 * Usa la misma clave de consulta que TabConfiguracion, así que no agrega ni
 * una llamada extra: react-query devuelve lo que ya está en caché.
 */
export function useNombreAgente() {
  const { data } = useQuery({ queryKey: ['configuracion'], queryFn: obtenerConfiguracion });
  const deLaBase = String(data?.config?.nombre_agente || '').trim();
  return deLaBase || MARCA.agente;
}
