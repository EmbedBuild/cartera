// Entrega de correos. El manejador guarda siempre el correo en la bandeja de salida de la cartera (es el registro
// del envío); el adaptador del entorno decide si además sale: entorno.correo.enviarCorreo({ para, asunto, texto, html }).
//
// - Buzón interno (el de por defecto): no sale nada.
// - Real (Workers con send_email, o SMTP): todo correo debe ir al buzón de pruebas; redirigirAPruebas deja el
//   destinatario original en el asunto.

export function crearBuzonInterno() {
  return {
    via: 'buzon-interno',
    async enviarCorreo({ para }) {
      return { via: 'buzon-interno', entregadoA: para };
    },
  };
}

export function redirigirAPruebas(correo, buzonPruebas) {
  return {
    ...correo,
    para: buzonPruebas,
    asunto: `[para ${correo.paraNombre ? `${correo.paraNombre} <${correo.para}>` : correo.para}] ${correo.asunto}`,
  };
}
