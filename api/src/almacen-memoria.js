// Almacén en memoria: para las pruebas y como referencia de la interfaz que implementan
// el de fichero (Node) y el de Durable Objects (Workers). Todo es asíncrono y la cartera va por usuario.
//
//   leerCartera(usuarioId) → cartera | null       guardarCartera(usuarioId, cartera)
//   leerUsuario(usuarioId) → usuario | null        guardarUsuario(usuario)
//   buscarUsuarioPorHuella(huella) → usuario | null   listarUsuarios() → usuario[]
//
// Se guarda texto JSON, no el objeto, para que nadie comparta referencias con lo guardado (como en un almacén real).
export function crearAlmacenMemoria() {
  const carteras = new Map();
  const usuarios = new Map();
  const copia = (texto) => (texto === undefined ? null : JSON.parse(texto));
  return {
    leerCartera: async (id) => copia(carteras.get(id)),
    guardarCartera: async (id, cartera) => {
      carteras.set(id, JSON.stringify(cartera));
    },
    leerUsuario: async (id) => copia(usuarios.get(id)),
    guardarUsuario: async (usuario) => {
      usuarios.set(usuario.id, JSON.stringify(usuario));
    },
    buscarUsuarioPorHuella: async (h) =>
      [...usuarios.values()].map(copia).find((u) => u.tokens?.some((t) => t.huella === h && !t.revocado)) ?? null,
    listarUsuarios: async () => [...usuarios.values()].map(copia),
  };
}
