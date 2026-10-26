'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Org = Record<string, any>;

export default function DatosOrganizador() {
  const [org, setOrg] = useState<Org | null>(null);
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  useEffect(() => {
    api('/api/organizador').then(setOrg);
  }, []);
  if (!org) return <p role="status">Cargando…</p>;
  const set = (k: string, v: unknown) => setOrg({ ...org, [k]: v });

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const o = org!;
    const vacio = (v: any) => (v === '' ? null : v);
    try {
      const r = await api('/api/organizador', {
        metodo: 'PATCH',
        cuerpo: {
          nombre: o.nombre,
          razon_social: vacio(o.razon_social),
          cif: vacio(o.cif),
          direccion_fiscal: vacio(o.direccion_fiscal),
          email_contacto: vacio(o.email_contacto),
          telefono: vacio(o.telefono),
          logo_url: vacio(o.logo_url),
          color_primario: o.color_primario,
          color_secundario: o.color_secundario,
          impuesto_nombre: o.impuesto_nombre,
          impuesto_tipo: Number(o.impuesto_tipo),
          impuesto_pendiente: o.impuesto_pendiente,
          gastos_gestion_cent: Number(o.gastos_gestion_cent),
          gastos_gestion_pct: o.gastos_gestion_pct === '' || o.gastos_gestion_pct === null || o.gastos_gestion_pct === undefined ? null : Number(o.gastos_gestion_pct),
          max_entradas_pedido: Number(o.max_entradas_pedido),
        },
      });
      setOrg(r);
      setMsg({ tipo: 'ok', texto: 'Guardado.' });
    } catch (err: any) {
      setMsg({ tipo: 'bad', texto: err.datos?.detalles?.map((d: any) => `${d.campo}: ${d.mensaje}`).join(' · ') || err.message });
    }
  }

  const texto = (k: string, etiqueta: string, tipo = 'text') => (
    <label className="campo">{etiqueta}
      <input type={tipo} value={org[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
    </label>
  );

  return (
    <form className="stack" onSubmit={guardar}>
      <h1>Datos del organizador</h1>
      {org.es_prueba && <p className="aviso warn">Organizador de prueba: sus datos no son reales.</p>}
      <section className="panel stack">
        <h2>Identidad y datos fiscales</h2>
        <div className="g2">
          {texto('nombre', 'Nombre comercial')}
          {texto('razon_social', 'Razón social')}
          {texto('cif', 'CIF / NIF')}
          {texto('email_contacto', 'Correo de contacto', 'email')}
          {texto('telefono', 'Teléfono', 'tel')}
          {texto('logo_url', 'Dirección del logo (URL)', 'url')}
        </div>
        {texto('direccion_fiscal', 'Dirección fiscal')}
        <div className="g2">
          <label className="campo">Color principal<input type="color" value={org.color_primario} onChange={(e) => set('color_primario', e.target.value)} /></label>
          <label className="campo">Color secundario<input type="color" value={org.color_secundario} onChange={(e) => set('color_secundario', e.target.value)} /></label>
        </div>
      </section>
      <section className="panel stack">
        <h2>Venta</h2>
        <div className="g3">
          <label className="campo">Impuesto
            <select value={org.impuesto_nombre} onChange={(e) => set('impuesto_nombre', e.target.value)}>
              <option value="IGIC">IGIC (Canarias)</option>
              <option value="IVA">IVA (Península y Baleares)</option>
            </select>
          </label>
          <label className="campo">Tipo (%)<input type="number" step="0.01" min="0" max="99" value={org.impuesto_tipo} onChange={(e) => set('impuesto_tipo', e.target.value)} /></label>
          <label className="campo">Gastos de gestión por entrada (céntimos)<input type="number" min="0" value={org.gastos_gestion_cent} onChange={(e) => set('gastos_gestion_cent', e.target.value)} /></label>
          <label className="campo">Gastos de gestión en % del precio (vacío = importe fijo)<input type="number" step="0.01" min="0" max="50" value={org.gastos_gestion_pct ?? ''} onChange={(e) => set('gastos_gestion_pct', e.target.value)} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={org.impuesto_pendiente} onChange={(e) => set('impuesto_pendiente', e.target.checked)} /> El tipo de impuesto está pendiente de confirmar por la asesoría</label>
        <label className="campo" style={{ maxWidth: 260 }}>Máximo de entradas por compra<input type="number" min="1" max="50" value={org.max_entradas_pedido} onChange={(e) => set('max_entradas_pedido', e.target.value)} /></label>
      </section>
      <section className="panel stack">
        <h2>Cobros (Stripe Connect)</h2>
        <p className="small">Estado: <b>{String(org.stripe_estado).replace('_', ' ')}</b>{org.stripe_cuenta_id && <> · <span className="mono">{org.stripe_cuenta_id}</span></>}</p>
        <p className="small muted">Cada organizador cobra sus ventas en su propia cuenta de Stripe; la plataforma se queda los gastos de gestión. Solo modo de prueba.</p>
        <div><button type="button" className="btn sec sm" onClick={async () => { try { const r = await api('/api/organizador/stripe/conectar', { cuerpo: {} }); window.location.href = r.url; } catch (e: any) { setMsg({ tipo: 'bad', texto: e.message }); } }}>{org.stripe_cuenta_id ? 'Continuar el alta en Stripe' : 'Conectar con Stripe'}</button></div>
      </section>
      {msg && <p className={`aviso ${msg.tipo}`} role="status">{msg.texto}</p>}
      <div><button className="btn">Guardar cambios</button></div>
    </form>
  );
}
