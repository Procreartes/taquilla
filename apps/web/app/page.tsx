import Link from 'next/link';

export default function Inicio() {
  return (
    <main id="contenido" className="wrap">
      <h1>Taquilla</h1>
      <p className="muted">Plataforma propia de venta de entradas. Entorno local de pruebas.</p>
      <div className="fila">
        <Link className="btn" href="/entrar">Entrar al panel</Link>
      </div>
    </main>
  );
}
