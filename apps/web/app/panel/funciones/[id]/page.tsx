'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { api, eur, fechaLarga } from '@/lib/api';
import { useSesion } from '@/lib/sesion';
import { ESTADO_FUNCION, MODO_VENTA } from '@/lib/textos';
import NavFuncion from '@/componentes/NavFuncion';
import FormFuncion from '@/componentes/FormFuncion';
import { useSearchParams } from 'next/navigation';

export default function Funcion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { puede } = useSesion();
  const [f, setF] = useState<any>(null);
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  const [msgDatos, setMsgDatos] = useState<{ tipo: string; texto: string } | null>(null);
  const esNueva = useSearchParams().get('nueva') === '1';

  const aplicar = (d: any) => {
    setF(d);
    setPrecios(Object.fromEntries(d.zonas.map((z: any) => [z.codigo, z.precio_cent === null ? '' : String(z.precio_cent / 100)])));
  };
  useEffect(() => {
    api(`/api/funciones/${id}`).then(aplicar);
  }, [id]);
  if (!f) return <p role="status">Cargando…</p>;

  const accion = async (fn: () => Promise<any>, ok: string) => {
    setMsg(null);
    try {
      aplicar(await fn());
      setMsg({ tipo: 'ok', texto: ok });
    } catch (err: any) {
      setMsg({ tipo: 'bad', texto: err.message });
    }
  };
  const guardarPrecios = (e: React.FormEvent) => {
    e.preventDefault();
    const cuerpo: Record<string, number | null> = {};
    for (const [z, v] of Object.entries(precios)) cuerpo[z] = v.trim() === '' ? null : Math.round(Number(v.replace(',', '.')) * 100);
    if (Object.values(cuerpo).some((v) => v !== null && (!Number.isFinite(v) || v < 0))) return setMsg({ tipo: 'bad', texto: 'Revisa los precios: tienen que ser números positivos.' });
    accion(() => api(`/api/funciones/${id}/precios`, { metodo: 'PUT', cuerpo: { precios: cuerpo } }), 'Precios guardados.');
  };
  const editarPrecios = puede('precios.editar') && !['cancelada', 'finalizada'].includes(f.estado);
  const estado = ESTADO_FUNCION[f.estado];

  return (
    <div className="stack">
      <p><Link href={`/panel/eventos/${f.evento_id}`}>← {f.evento_nombre}</Link></p>
      <div className="fila" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>{f.titulo}</h1>
          <p className="muted">{fechaLarga(f.fecha)} · {f.hora ?? 'hora por confirmar'} · {f.recinto_nombre}{f.municipio ? `, ${f.municipio}` : ''}</p>
        </div>
        <span className={`tag ${estado.clase}`}>{estado.texto}</span>
      </div>
      <NavFuncion id={id} />
      {f.es_prueba && <p className="aviso warn">Función de PRUEBA: no es real y sus entradas no valen para nada.</p>}
      {f.verificar && <p className="aviso warn">Hay datos de esta función pendientes de verificar.</p>}
      {f.venta_externa_url && <p className="aviso">La venta oficial de esta función está en Entradas Canarias: <a href={f.venta_externa_url} target="_blank" rel="noopener noreferrer">ver venta oficial</a>. Aquí no se vende.</p>}

      <section className="panel stack">
        <h2>Venta</h2>
        <p>Modo: <b>{MODO_VENTA[f.modo_venta]}</b>
          {f.modo_venta === 'numerada' && <> · Plano «{f.plano_nombre}» v{f.plano_version} ({f.plano_plazas} plazas, {f.plano_estado === 'congelada' ? 'congelado' : 'borrador'})</>}
          {f.modo_venta === 'general' && <> · Aforo: {f.aforo ?? <span className="tag demo">por confirmar</span>} · Vendidas: {f.vendidas_general}</>}
        </p>
        {f.motivos_no_vendible.length > 0 && f.estado === 'borrador' && (
          <div className="aviso warn"><b>Aún no se puede poner a la venta:</b><ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>{f.motivos_no_vendible.map((m: string) => <li key={m}>{m}</li>)}</ul></div>
        )}
        {puede('eventos.editar') && (
          <div className="fila">
            {['borrador', 'pausada'].includes(f.estado) && (
              <button className="btn acento" disabled={f.motivos_no_vendible.length > 0} onClick={() => accion(() => api(`/api/funciones/${id}/poner-a-la-venta`, { cuerpo: {} }), 'La función está a la venta.')}>Poner a la venta</button>
            )}
            {['a_la_venta', 'agotada'].includes(f.estado) && (
              <button className="btn sec" onClick={() => accion(() => api(`/api/funciones/${id}/pausar`, { cuerpo: {} }), 'Venta pausada.')}>Pausar la venta</button>
            )}
          </div>
        )}
      </section>

      {esNueva && f.estado === 'borrador' && (
        <p className="aviso ok" role="status">Función creada en borrador. Revisa los precios (abajo), las invitaciones y acreditaciones, y cuando esté todo listo pulsa «Poner a la venta».</p>
      )}

      <details className="panel">
        <summary><b>Datos de la función e imágenes</b> <span className="small muted">· {f.publicada ? 'visible en la web' : 'oculta en la web'}</span></summary>
        <div style={{ marginTop: 12 }}>
          <FormFuncion key={f.actualizado_en ?? f.id} boton="Guardar datos de la función" desactivado={!puede('eventos.editar')}
            bloqueoVenta={f.estado !== 'borrador'}
            inicial={{ ...f, fecha: String(f.fecha).slice(0, 10), artistas: f.artistas ?? [] }}
            onGuardar={async (d) => {
              setMsgDatos(null);
              try {
                const cuerpo: Record<string, unknown> = { ...d };
                if (f.estado !== 'borrador') { delete cuerpo.recinto_id; delete cuerpo.modo_venta; delete cuerpo.version_plano_id; }
                aplicar(await api(`/api/funciones/${id}`, { metodo: 'PATCH', cuerpo }));
                setMsgDatos({ tipo: 'ok', texto: 'Datos de la función guardados.' });
              } catch (err: any) {
                setMsgDatos({ tipo: 'bad', texto: err.message });
              }
            }} />
          {msgDatos && <p className={`aviso ${msgDatos.tipo}`} role="status">{msgDatos.texto}</p>}
        </div>
      </details>

      {f.modo_venta !== 'libre' && puede('eventos.editar') && <Cola f={f} onGuardar={(cuerpo) => accion(() => api(`/api/funciones/${id}`, { metodo: 'PATCH', cuerpo }), 'Cola virtual guardada.')} />}

      {f.modo_venta !== 'libre' && (
        <form className="panel stack" onSubmit={guardarPrecios}>
          <h2>Precios por zona</h2>
          <p className="small muted">En euros, con el impuesto incluido. Déjalo vacío si aún no hay precio oficial: la función no se podrá vender.</p>
          <div className="rejilla">
            {f.zonas.map((z: any) => (
              <label key={z.codigo} className="campo">
                <span><i className="mu" style={{ background: z.color, marginRight: 6, verticalAlign: 'middle' }} aria-hidden="true" />{z.nombre}</span>
                <input inputMode="decimal" disabled={!editarPrecios} value={precios[z.codigo] ?? ''} placeholder="Por confirmar" onChange={(e) => setPrecios({ ...precios, [z.codigo]: e.target.value })} />
                <span className="ayuda">{z.precio_cent === null ? 'Sin precio' : `Ahora: ${eur(z.precio_cent)}`}</span>
              </label>
            ))}
          </div>
          {editarPrecios && <div><button className="btn">Guardar precios</button></div>}
        </form>
      )}
      {msg && <p className={`aviso ${msg.tipo}`} role="status">{msg.texto}</p>}
    </div>
  );
}

/** Cola virtual para salidas a la venta fuertes. */
function Cola({ f, onGuardar }: { f: any; onGuardar: (c: object) => void }) {
  const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  const [activa, setActiva] = useState<boolean>(f.cola_virtual);
  const [apertura, setApertura] = useState(local(f.cola_apertura));
  const [ritmo, setRitmo] = useState<string>(f.cola_ritmo ? String(f.cola_ritmo) : '');
  return (
    <form className="panel stack" onSubmit={(e) => { e.preventDefault(); onGuardar({ cola_virtual: activa, cola_apertura: apertura ? new Date(apertura).toISOString() : null, cola_ritmo: ritmo ? Number(ritmo) : null }); }}>
      <h2>Cola virtual</h2>
      <p className="small muted">Para salidas a la venta con mucha gente: el público espera en una sala y entra a comprar por turnos, a un ritmo fijo.</p>
      <label className="check"><input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} /> Activar la sala de espera</label>
      <div className="g2">
        <label className="campo">Hora de apertura de la venta<input type="datetime-local" value={apertura} onChange={(e) => setApertura(e.target.value)} /></label>
        <label className="campo">Personas que entran por minuto<span className="ayuda">Vacío = valor por defecto de la plataforma</span><input type="number" min={1} value={ritmo} onChange={(e) => setRitmo(e.target.value)} /></label>
      </div>
      <div><button className="btn sec">Guardar cola</button></div>
    </form>
  );
}
