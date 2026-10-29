import { ETAPAS, NOMBRE_ETAPA } from './clientes.js';
import { estadoEfectivo, estaAbierto } from './presupuestos.js';
import { calcularImportes, euros } from './importes.js';

// El embudo en cifras. En juego = presupuestos enviados o vistos y en plazo; los pilotos gratuitos no suman dinero.
export function resumenEmbudo({ clientes, presupuestos, precioDe, ahora }) {
  const dePago = presupuestos.filter((p) => !p.gratuito);
  const importe = (p) => calcularImportes(p, precioDe(p)).instalacion;

  const etapas = ETAPAS.map((etapa) => {
    const ids = clientes.filter((c) => c.etapa === etapa).map((c) => c.id);
    const abiertos = dePago.filter((p) => ids.includes(p.clienteId) && estaAbierto(p, ahora));
    const enJuego = abiertos.reduce((s, p) => s + importe(p), 0);
    return { etapa, nombre: NOMBRE_ETAPA[etapa], clientes: ids.length, presupuestosAbiertos: abiertos.length, enJuegoCentimos: enJuego, enJuego: euros(enJuego) };
  });

  const borradores = dePago.filter((p) => p.estado === 'borrador');
  const aceptados = dePago.filter((p) => estadoEfectivo(p, ahora) === 'aceptado');
  const instalacion = aceptados.reduce((s, p) => s + importe(p), 0);
  const facturado = aceptados.reduce((s, p) => s + p.casosDeUso.reduce((t, c) => t + (c.facturado?.importe ?? 0), 0), 0);
  const cuotas = aceptados.reduce((s, p) => s + calcularImportes(p, precioDe(p)).mantenimientoMensual, 0);
  const enJuego = etapas.reduce((s, e) => s + e.enJuegoCentimos, 0);
  const caducados = dePago.filter((p) => estadoEfectivo(p, ahora) === 'caducado');

  return {
    etapas,
    enJuegoCentimos: enJuego,
    enJuego: euros(enJuego),
    borradores: { cantidad: borradores.length, importeCentimos: borradores.reduce((s, p) => s + importe(p), 0) },
    aceptado: {
      presupuestos: aceptados.length,
      instalacionCentimos: instalacion,
      facturadoCentimos: facturado,
      pendienteDeFacturarCentimos: instalacion - facturado,
      cuotasMensualesCentimos: cuotas,
      texto: `Aceptado ${euros(instalacion)}: facturado ${euros(facturado)}, pendiente de facturar ${euros(instalacion - facturado)}. Cuotas de mantenimiento: ${euros(cuotas)} al mes.`,
    },
    caducados: caducados.length,
    nota: 'Importes sin IVA. En juego: presupuestos enviados o vistos que no han caducado.',
  };
}
