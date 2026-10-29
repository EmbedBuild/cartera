// Aleatoriedad y huellas solo con APIs Web (crypto.getRandomValues y crypto.subtle): valen en Node y en Workers.
// «aleatorio(n) → Uint8Array» se inyecta en el entorno para las pruebas.
export const aleatorioPorDefecto = (n) => crypto.getRandomValues(new Uint8Array(n));

export function base64url(bytes) {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function desdeBase64url(texto) {
  const binario = atob(texto.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

export function crearAzar(aleatorio = aleatorioPorDefecto) {
  return {
    // Identificador corto para seguimientos y correos: la cartera tiene que caber en poco espacio.
    id: () => base64url(aleatorio(9)),
    // Token de desarrollo para la API: se imprime una vez y solo se guarda su huella.
    token: () => `cart_${base64url(aleatorio(24))}`,
    // Enlace público de una propuesta: lleva dentro el usuario (para encontrar su cartera sin índice) y 18 bytes al azar.
    tokenPublico: (usuarioId) => `${base64url(new TextEncoder().encode(usuarioId))}.${base64url(aleatorio(18))}`,
  };
}

// Usuario de un enlace público, o null si el enlace no tiene la forma esperada.
export function usuarioDeTokenPublico(token) {
  const [parte, azar] = String(token ?? '').split('.');
  if (!parte || !azar || !/^[\w-]+$/.test(parte) || !/^[\w-]{20,}$/.test(azar)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(desdeBase64url(parte));
  } catch {
    return null;
  }
}

export async function huella(texto) {
  const resumen = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(texto)));
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
