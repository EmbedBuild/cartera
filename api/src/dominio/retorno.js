import { ErrorDominio } from './errores.js';
import { calcularImportes, euros } from './importes.js';

// Hoja de retorno de un piloto: lo que ahorra al mes, lo que costaría seguir y cuándo se amortiza.
export function hojaDeRetorno(presupuesto, precioPunto) {
  if (presupuesto.tipo !== 'piloto') {
    throw new ErrorDominio('regla', `${presupuesto.id} no es un piloto: solo los pilotos tienen hoja de retorno`);
  }
  const metricas = presupuesto.piloto.metricas.map((m) => {
    const ahorro = Math.round((m.antes - m.despues) * m.valorUnidad);
    return { ...m, ahorroMensualCentimos: ahorro, texto: `${m.nombre}: de ${m.antes} a ${m.despues} ${m.unidad} al mes × ${euros(m.valorUnidad)} = ${euros(ahorro)}` };
  });
  const ahorro = metricas.reduce((s, m) => s + m.ahorroMensualCentimos, 0);
  const { instalacion, mantenimientoMensual } = calcularImportes(presupuesto, precioPunto);
  const neto = ahorro - mantenimientoMensual;
  const meses = neto > 0 ? Math.round((instalacion / neto) * 10) / 10 : null;
  const conclusion =
    meses === null
      ? `Con estas métricas no se amortiza: el ahorro (${euros(ahorro)} al mes) no cubre la cuota (${euros(mantenimientoMensual)} al mes).`
      : `Ahorra ${euros(ahorro)} al mes; con la cuota de ${euros(mantenimientoMensual)} quedan ${euros(neto)} netos, y la instalación de ${euros(instalacion)} se recupera en ${String(meses).replace('.', ',')} meses.`;
  return {
    presupuesto: presupuesto.id,
    titulo: presupuesto.titulo,
    fechaFin: presupuesto.piloto.fechaFin,
    metricas,
    ahorroMensualCentimos: ahorro,
    instalacionCentimos: instalacion,
    cuotaMensualCentimos: mantenimientoMensual,
    netoMensualCentimos: neto,
    mesesParaAmortizar: meses,
    seAmortiza: meses !== null,
    conclusion,
    nota: 'Importes sin IVA. Instalación y cuota: lo que costaría pasar el piloto a pago, con el precio del punto del cliente.',
  };
}
