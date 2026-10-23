import { eur } from '@/lib/api';

export default function TablaLiquidacion({ l }: { l: any }) {
  const fila = (t: string, v: number, opciones: { fuerte?: boolean; menos?: boolean; nota?: string } = {}) => (
    <tr>
      <td>{opciones.fuerte ? <b>{t}</b> : t}{opciones.nota && <><br /><span className="small muted">{opciones.nota}</span></>}</td>
      <td className="num">{opciones.fuerte ? <b>{opciones.menos ? '−' : ''}{eur(v)}</b> : `${opciones.menos ? '−' : ''}${eur(v)}`}</td>
    </tr>
  );
  return (
    <table className="tabla">
      <tbody>
        {fila(`Bruto de taquilla (${l.entradas} entradas)`, l.bruto)}
        {fila('Devoluciones', l.devoluciones, { menos: true })}
        {fila('Recaudación (impuestos incluidos)', l.brutoNeto, { fuerte: true })}
        {fila(`${l.impuesto.nombre} incluido (${l.impuesto.tipo} %)`, l.impuesto.cuota, { nota: 'Lo ingresa el organizador. Tipo pendiente de confirmar por la asesoría.' })}
        {fila('Base imponible', l.base)}
        {fila('Comisiones de la pasarela (Stripe)', l.comisionPasarela, { menos: true, nota: l.comisionEstimada ? 'Estimada (1,5 % + 0,25 € por pago) hasta que Stripe la informe.' : undefined })}
        {fila('Neto para el organizador', l.netoOrganizador, { fuerte: true })}
        {fila(`Derechos de autor (${l.derechosAutor.porcentaje} % sobre la base)`, l.derechosAutor.importe, { menos: true, nota: 'Porcentaje pendiente de confirmar con la SGAE.' })}
        {fila('Neto a repartir', l.netoTrasDerechos, { fuerte: true })}
        {l.reparto.map((r: any) => fila(`→ ${r.nombre} (${r.porcentaje} %)`, r.importe))}
        {fila('Gastos de gestión (de la plataforma, no se reparten)', l.gastosGestion.netos, { nota: `Cobrados ${eur(l.gastosGestion.cobrados)} · devueltos ${eur(l.gastosGestion.devueltos)}` })}
        <tr><td>Invitaciones</td><td className="num">{l.invitaciones}</td></tr>
      </tbody>
    </table>
  );
}
