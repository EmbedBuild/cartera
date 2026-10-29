// Límites de longitud: lo que no cabe se rechaza con un mensaje, nunca se recorta en silencio.
export const LIMITES = Object.freeze({
  nombre: 120,
  sector: 120,
  email: 160,
  notas: 2000,
  titulo: 160,
  resumen: 2000,
  casoNombre: 160,
  criterio: 500,
  nota: 1000,
  comentario: 1000,
  mensaje: 2000,
  metrica: 120,
});
export const MAX_CASOS = 20;
export const MAX_CRITERIOS = 15;
export const MAX_METRICAS = 10;

// Devuelve el texto limpio o apunta el error del campo. «obligatorio» rechaza el vacío.
export function texto(valor, campo, errores, { max, obligatorio = false, etiqueta = campo } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obligatorio) errores[campo] = `Falta ${etiqueta}`;
    return obligatorio ? undefined : '';
  }
  if (typeof valor !== 'string') {
    errores[campo] = `${mayuscula(etiqueta)} tiene que ser un texto`;
    return undefined;
  }
  const limpio = valor.trim();
  if (!limpio && obligatorio) errores[campo] = `Falta ${etiqueta}`;
  else if (limpio.length > max) errores[campo] = `${mayuscula(etiqueta)} admite como mucho ${max} caracteres`;
  return limpio;
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function mayuscula(t) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Identificador legible a partir de un nombre: «Núcleo Pilates» → «nucleo-pilates».
export function slug(nombre) {
  return (
    String(nombre)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'cliente'
  );
}
