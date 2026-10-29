// Error de una regla de negocio. El código decide la respuesta HTTP; el mensaje es el que lee la persona (o la IA).
export class ErrorDominio extends Error {
  constructor(codigo, mensaje, extra = {}) {
    super(mensaje);
    this.codigo = codigo;
    this.extra = extra;
  }
}

// Junta los fallos de varios campos en un único error de validación.
export function comprobarErrores(errores, mensaje = 'Revisa los datos') {
  if (Object.keys(errores).length) throw new ErrorDominio('validacion', mensaje, { errores });
}
