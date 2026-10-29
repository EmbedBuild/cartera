import { escaparHtml as e } from '../cartera.js';
import { fechaLarga } from '../dominio/fechas.js';
import { euros } from '../dominio/importes.js';

const ESTADO_CERRADO = {
  aceptado: (p) => `Aceptada el ${fechaLarga(p.decision.fecha)}. Gracias.`,
  rechazado: (p) => `Rechazada el ${fechaLarga(p.decision.fecha)}.${p.decision.comentario ? ` Comentario: «${p.decision.comentario}»` : ''}`,
  caducado: (p) => `Esta propuesta caducó el ${fechaLarga(p.caduca)}. Si te sigue interesando, pide una nueva.`,
  sustituido: () => 'Hay una versión más nueva de esta propuesta.',
};

function documento(titulo, cuerpo) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${e(titulo)}</title>
<link rel="stylesheet" href="/propuesta.css">
</head>
<body>
<main>
${cuerpo}
</main>
</body>
</html>`;
}

export function paginaNoExiste() {
  return documento('Propuesta no encontrada', '<h1>Esta propuesta no existe</h1><p>Revisa el enlace del correo o pide uno nuevo a quien te la envió.</p>');
}

// La propuesta tal y como la ve el cliente: casos de uso, criterios, importes con IVA y los botones para decidir.
export function paginaPropuesta({ token, presupuesto: p, proveedor, enlaceVersionNueva }, { aviso = null } = {}) {
  const abierta = ['enviado', 'visto'].includes(p.estado);
  const i = p.importes;
  const casos = p.casosDeUso
    .map(
      (c) => `<section class="caso">
<h3><span class="codigo">${e(c.codigo)}</span> ${e(c.nombre)}</h3>
<p class="cifras">${c.puntos} ${c.puntos === 1 ? 'punto' : 'puntos'} · ${e(c.importe)}</p>
<ul class="criterios">
${c.criterios.map((k) => `<li><b>Dado</b> ${e(k.dado)}, <b>cuando</b> ${e(k.cuando)}, <b>entonces</b> ${e(k.entonces)}.</li>`).join('\n')}
</ul>
</section>`,
    )
    .join('\n');
  const cerrado = ESTADO_CERRADO[p.estado];
  const estado = cerrado
    ? `<p class="estado estado-${e(p.estado)}">${e(cerrado(p))}${enlaceVersionNueva ? ` <a href="${e(enlaceVersionNueva)}">Ver la versión nueva</a>` : ''}</p>`
    : '';
  const decidir = abierta
    ? `<section class="decidir">
<h2>¿Qué te parece?</h2>
<form method="post" action="/p/${e(token)}/aceptar">
<button class="aceptar" type="submit">Aceptar la propuesta</button>
</form>
<form method="post" action="/p/${e(token)}/rechazar">
<label for="comentario">Si la rechazas, ¿nos dices por qué? (opcional)</label>
<textarea id="comentario" name="comentario" maxlength="1000" rows="3"></textarea>
<button class="rechazar" type="submit">Rechazar</button>
</form>
</section>`
    : '';
  return documento(
    `Propuesta ${p.numero}: ${p.titulo}`,
    `<header>
<p class="eyebrow">Propuesta ${e(p.numero)}${p.version > 1 ? ` · versión ${p.version}` : ''}${p.gratuito ? ' · piloto gratuito' : ''}</p>
<h1>${e(p.titulo)}</h1>
<p class="de">De ${e(proveedor)} para ${e(p.cliente.nombre)}${p.enviadoEn ? ` · ${e(fechaLarga(p.enviadoEn))}` : ''}</p>
${p.caduca && abierta ? `<p class="validez">Válida hasta el ${e(fechaLarga(p.caduca))}</p>` : ''}
</header>
${aviso ? `<p class="aviso">${e(aviso)}</p>` : ''}
${estado}
${p.resumen ? `<p class="resumen">${e(p.resumen)}</p>` : ''}
<h2>Qué incluye</h2>
<p class="nota">Cada caso de uso es algo que podrás usar y comprobar por tu cuenta. Sus criterios de aceptación dicen cómo se comprueba.</p>
${casos}
<h2>Importe</h2>
<table class="importes">
<tr><th>Instalación (${p.puntos} puntos a ${e(p.precioPunto)})</th><td>${e(euros(i.instalacionCentimos))}</td></tr>
<tr><th>IVA 21 %</th><td>${e(euros(i.ivaInstalacionCentimos))}</td></tr>
<tr class="total"><th>Total instalación</th><td>${e(euros(i.totalInstalacionCentimos))}</td></tr>
<tr><th>Mantenimiento al mes</th><td>${e(euros(i.mantenimientoMensualCentimos))}</td></tr>
<tr><th>IVA 21 %</th><td>${e(euros(i.ivaMantenimientoCentimos))}</td></tr>
<tr class="total"><th>Total al mes</th><td>${e(euros(i.totalMantenimientoCentimos))}</td></tr>
</table>
<p class="nota">${p.gratuito ? 'Es un piloto gratuito: estos importes son lo que costaría seguir después.' : 'Cada caso de uso se factura cuando firmas su acta, es decir, cuando has comprobado que cumple todos sus criterios.'}</p>
${decidir}`,
  );
}
