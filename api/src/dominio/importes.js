import { ErrorDominio } from './errores.js';

// Ponderación de la sesión 5: los criterios, el riesgo (datos personales, pagos) y lo que aún no se conoce.
export const INCERTIDUMBRE = Object.freeze({ baja: 0, media: 1, alta: 3 });
export const PUNTOS_DATOS_PERSONALES = 2;
export const PUNTOS_PAGOS = 2;
export const TARIFA_POR_DEFECTO = 25000; // 250 € el punto, en céntimos
export const IVA_POR_CIENTO = 21;
export const VALIDEZ_DIAS = 30;

// Puntos de un caso de uso: siempre de la fórmula, nunca de lo que llegue de fuera.
export function puntosDeCaso(caso) {
  const { datosPersonales = false, pagos = false, incertidumbre = 'baja' } = caso.ponderacion ?? {};
  return (
    caso.criterios.length +
    (datosPersonales ? PUNTOS_DATOS_PERSONALES : 0) +
    (pagos ? PUNTOS_PAGOS : 0) +
    INCERTIDUMBRE[incertidumbre]
  );
}

// 10 % de la instalación al mes, redondeado a 10 € (1.000 céntimos).
export function mantenimientoPorDefecto(instalacion) {
  return Math.round((instalacion * 0.1) / 1000) * 1000;
}

export const iva = (centimos) => Math.round((centimos * IVA_POR_CIENTO) / 100);

// Todos los importes de un presupuesto con un precio del punto dado. Céntimos enteros en todo el cálculo.
export function calcularImportes(presupuesto, precioPunto) {
  const casos = presupuesto.casosDeUso.map((caso) => {
    const puntos = puntosDeCaso(caso);
    return { codigo: caso.codigo, puntos, importe: puntos * precioPunto };
  });
  const puntos = casos.reduce((s, c) => s + c.puntos, 0);
  const instalacion = casos.reduce((s, c) => s + c.importe, 0);
  const mantenimientoMensual = presupuesto.mantenimientoPactado ?? mantenimientoPorDefecto(instalacion);
  return {
    casos,
    puntos,
    criterios: presupuesto.casosDeUso.reduce((s, c) => s + c.criterios.length, 0),
    precioPunto,
    instalacion,
    ivaInstalacion: iva(instalacion),
    totalInstalacion: instalacion + iva(instalacion),
    mantenimientoMensual,
    ivaMantenimiento: iva(mantenimientoMensual),
    totalMantenimiento: mantenimientoMensual + iva(mantenimientoMensual),
  };
}

const FORMATO = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
// Con espacio normal antes del €: el texto lo leen personas y una IA, y se compara en las pruebas.
export const euros = (centimos) => FORMATO.format(centimos / 100).replace(/\u00a0/g, ' ');

// Importe que escribe una persona (en euros, con hasta dos decimales) a céntimos enteros.
export function centimosDesdeEuros(valor, campo, etiqueta) {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 10_000_000) {
    const mensaje = `${etiqueta} tiene que ser un importe en euros, de 0 a 10.000.000`;
    throw new ErrorDominio('validacion', mensaje, { errores: { [campo]: mensaje } });
  }
  return Math.round(valor * 100);
}
