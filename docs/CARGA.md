# Prueba de carga

**Objetivo inicial:** 5.000 personas en cola y 200 compras por minuto sin errores ni sobreventa.

## Resultado (23/10/2026, ordenador de trabajo, modo demostración)

Entorno: Windows 11, una sola API Node 24 con **PGlite** (PostgreSQL en WebAssembly, un único proceso) y almacenes en memoria; pasarela simulada. Es el escenario **más desfavorable** (sin PostgreSQL ni Redis reales y todo en una máquina de escritorio).

```
1) Cola virtual: 5000 personas en 8.5 s
   correctas 5000 · errores 0 · números únicos 5000 · con pase inmediato 5
   latencia p50 329 ms · p95 378 ms
   consultas de turno: 200/200 correctas · p95 53 ms

2) Compras: 200 en 59.7 s (201 compras/minuto completadas)
   correctas 200 · fallidas 0 · reintentos por butaca ocupada 0
   tiempo de compra completa p50 44 ms · p95 57 ms

3) Sobreventa: butacas repetidas entre compras correctas = 0

RESULTADO: OK
```

Cada «compra» incluye reservar con «mejor sitio» en el plano de Puerto del Rosario, enviar los datos, pagar en la pasarela simulada, recibir el aviso de pago firmado y emitir la entrada.

Además, los tests automáticos comprueban en cada cambio (CI, también con PostgreSQL 16 y Redis 7 reales): 300 reservas simultáneas de la misma butaca → 1; 200 pagos simultáneos sobre la misma butaca → 1 entrada y 199 devoluciones; 5.000 entradas a la cola con números únicos.

## Cómo repetirla

```bash
LIMITE_COMPRA_POR_MINUTO=100000 LIMITE_GLOBAL_POR_MINUTO=1000000 npm run demo
node scripts/carga/prueba-carga.mjs --cola 5000 --compras 200 --minutos 1
```

(Los límites se suben porque todas las peticiones salen del mismo ordenador; en producción cada persona tiene su IP.)

Contra el entorno completo (`docker compose up`), lo mismo con `--api http://localhost:4000`. La prueba se niega a ejecutarse si la API no está en modo demostración, para no lanzarla nunca contra producción.

## Pendiente para producción

- Repetirla en el VPS real con PostgreSQL y Redis, y desde varias máquinas (k6 o Artillery en la nube) para simular IPs distintas y medir Cloudflare.
- Dimensionado orientativo: 2 instancias de la API detrás de Traefik/Coolify, PostgreSQL con `max_connections` ≥ 100 y pool de 20 por instancia, Redis con persistencia AOF.
