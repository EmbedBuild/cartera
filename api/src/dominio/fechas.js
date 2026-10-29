// La cartera trabaja con días de calendario de España: «hoy» y las próximas fechas son días locales.
const ZONA = 'Europe/Madrid';
export const DIA_MS = 24 * 60 * 60 * 1000;

// Día local en formato AAAA-MM-DD.
export function diaLocal(fecha) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(fecha),
  );
}

// Días completos entre dos instantes (tiempo real transcurrido).
export function diasEntre(desde, hasta) {
  return Math.floor((new Date(hasta).getTime() - new Date(desde).getTime()) / DIA_MS);
}

// Días de calendario entre dos días locales AAAA-MM-DD.
export function diasDeCalendario(desde, hasta) {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);
}

export function sumarDias(fecha, dias) {
  return new Date(new Date(fecha).getTime() + dias * DIA_MS);
}

// «28 de octubre de 2026», para los textos que leen el cliente y la IA.
export function fechaLarga(fecha) {
  const valor = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T12:00:00Z` : fecha;
  return new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(valor),
  );
}

export function esDia(valor) {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`));
}
