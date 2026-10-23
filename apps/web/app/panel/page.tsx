'use client';
import Link from 'next/link';
import { useSesion } from '@/lib/sesion';

export default function Resumen() {
  const { yo } = useSesion();
  const org = yo?.organizadores.find((o) => o.id === yo.organizadorId);
  return (
    <>
      <h1>Hola, {yo?.usuario.nombre.split(' ')[0]}</h1>
      {org ? (
        <p className="muted">Estás trabajando en <b>{org.nombre}</b>{org.es_prueba && <> <span className="tag demo">de prueba</span></>}</p>
      ) : (
        <p className="aviso warn">Elige un organizador arriba para empezar.</p>
      )}
      {yo && !yo.usuario.totpActivo && (
        <p className="aviso warn">
          Tu cuenta aún no tiene verificación en dos pasos. <Link href="/panel/seguridad">Actívala ahora</Link>: es obligatoria para el equipo en producción.
        </p>
      )}
    </>
  );
}
