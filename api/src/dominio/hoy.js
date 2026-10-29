import { estadoEfectivo, estaAbierto } from './presupuestos.js';
import { diaLocal, diasDeCalendario, diasEntre, fechaLarga } from './fechas.js';

const DIAS_SIN_SEGUIMIENTO = 7;
const DIAS_VISTO_SIN_RESPUESTA = 3;
const DIAS_FIN_PILOTO = 7;
const DIAS_PARA_CADUCAR = 5;

const enDias = (n) => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`);
const haceDias = (n) => (n === 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`);

// «¿A quién llamo hoy?»: lo que pide una acción, con un motivo que se entiende sin abrir nada.
// Prioridad 1 = hoy sin falta; 2 = esta semana; 3 = dinero que espera.
export function aQuienLlamoHoy({ clientes, presupuestos, seguimientos, ahora }) {
  const hoy = diaLocal(ahora);
  const entradas = new Map();
  const nombre = (clienteId) => clientes.find((c) => c.id === clienteId)?.nombre ?? clienteId;

  function apuntar(clave, { clienteId, presupuesto = null, motivo, prioridad }) {
    const entrada = entradas.get(clave) ?? {
      cliente: { id: clienteId, nombre: nombre(clienteId) },
      presupuesto: presupuesto ? presupuesto.id : null,
      motivos: [],
      prioridad,
    };
    entrada.motivos.push(motivo);
    entrada.prioridad = Math.min(entrada.prioridad, prioridad);
    entradas.set(clave, entrada);
  }

  const ultimoSeguimiento = (clienteId) =>
    seguimientos.filter((s) => s.clienteId === clienteId).sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha))[0] ?? null;

  // 1. La próxima fecha del último seguimiento de cada cliente ya ha llegado.
  for (const cliente of clientes) {
    const ultimo = ultimoSeguimiento(cliente.id);
    if (ultimo?.proximo && ultimo.proximo <= hoy) {
      const retraso = diasDeCalendario(ultimo.proximo, hoy);
      const cuando = retraso === 0 ? 'para hoy' : `para el ${fechaLarga(ultimo.proximo)} (${retraso === 1 ? 'ayer' : `hace ${retraso} días`})`;
      apuntar(`seguimiento:${cliente.id}`, {
        clienteId: cliente.id,
        motivo: `Quedaste en volver a contactar ${cuando}. Última nota: «${ultimo.nota}»`,
        prioridad: 1,
      });
    }
  }

  for (const p of presupuestos) {
    const estado = estadoEfectivo(p, ahora);
    const clave = `presupuesto:${p.id}`;
    if (estaAbierto(p, ahora) && p.tipo !== 'piloto') {
      const ultimo = ultimoSeguimiento(p.clienteId);
      const ultimaAccion = ultimo && Date.parse(ultimo.fecha) > Date.parse(p.enviadoEn) ? ultimo.fecha : p.enviadoEn;
      const sinAccion = diasEntre(ultimaAccion, ahora);
      const aperturas = p.nAperturas ? ` (lo ha abierto ${p.nAperturas === 1 ? 'una vez' : `${p.nAperturas} veces`})` : ' (no lo ha abierto)';
      // 2. Enviado o visto y sin seguimiento desde hace una semana.
      if (sinAccion >= DIAS_SIN_SEGUIMIENTO) {
        const desde = ultimaAccion === p.enviadoEn ? `enviado ${haceDias(sinAccion)} y sin seguimiento` : `sin seguimiento desde ${haceDias(sinAccion)}`;
        apuntar(clave, { clienteId: p.clienteId, presupuesto: p, motivo: `${p.numero} «${p.titulo}»: ${desde}${aperturas}`, prioridad: 2 });
      }
      // 3. Visto hace días y sin respuesta ni seguimiento después.
      if (estado === 'visto' && p.primeraApertura) {
        const desdeVisto = diasEntre(p.primeraApertura, ahora);
        const atendido = ultimo && Date.parse(ultimo.fecha) > Date.parse(p.primeraApertura);
        if (desdeVisto >= DIAS_VISTO_SIN_RESPUESTA && !atendido) {
          apuntar(clave, {
            clienteId: p.clienteId,
            presupuesto: p,
            motivo: `Lo abrió por primera vez ${haceDias(desdeVisto)} y no ha contestado`,
            prioridad: 2,
          });
        }
      }
      // 4. Caduca pronto.
      const quedan = diasEntre(ahora, p.caduca);
      if (quedan <= DIAS_PARA_CADUCAR) {
        apuntar(clave, { clienteId: p.clienteId, presupuesto: p, motivo: `${p.numero} caduca ${enDias(quedan)} (${fechaLarga(p.caduca)})`, prioridad: 1 });
      }
    }
    // 5. Pilotos que terminan pronto, con o sin propuesta de pago.
    if (p.tipo === 'piloto' && estado === 'aceptado' && p.piloto?.fechaFin) {
      const quedan = diasDeCalendario(hoy, p.piloto.fechaFin);
      if (quedan <= DIAS_FIN_PILOTO && quedan >= -DIAS_FIN_PILOTO) {
        const pago = presupuestos.find(
          (o) => o.clienteId === p.clienteId && o.tipo === 'proyecto' && Date.parse(o.creado) >= Date.parse(p.creado) && !['rechazado', 'sustituido'].includes(estadoEfectivo(o, ahora)),
        );
        const fin = quedan >= 0 ? `El piloto «${p.titulo}» termina ${enDias(quedan)}` : `El piloto «${p.titulo}» terminó ${haceDias(-quedan)}`;
        const siguiente = pago ? `; la propuesta de pago ${pago.numero} está ${estadoEfectivo(pago, ahora)}` : ' y no hay propuesta de pago';
        apuntar(clave, { clienteId: p.clienteId, presupuesto: p, motivo: fin + siguiente, prioridad: pago ? 2 : 1 });
      }
    }
    // 6. Dinero que espera: actas aceptadas sin facturar.
    if (estado === 'aceptado' && !p.gratuito) {
      const pendientes = p.casosDeUso.filter((c) => c.acta.estado === 'aceptada' && !c.facturado);
      if (pendientes.length) {
        const lista = pendientes.map((c) => `${c.codigo} «${c.nombre}»`).join(', ');
        apuntar(clave, {
          clienteId: p.clienteId,
          presupuesto: p,
          motivo: `${p.numero}: ${lista} con el acta aceptada y sin facturar`,
          prioridad: 3,
        });
      }
    }
  }

  return [...entradas.values()]
    .map((e) => ({ ...e, motivo: e.motivos.join('. ') }))
    .sort((a, b) => a.prioridad - b.prioridad || a.cliente.nombre.localeCompare(b.cliente.nombre, 'es'));
}
