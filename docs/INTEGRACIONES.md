# Integraciones

## Webhooks para n8n

Panel → **Integraciones** → «Añadir webhook». Taquilla envía un `POST` con JSON a la dirección indicada cuando ocurre:

| Evento | Cuándo |
|---|---|
| `venta` | Se emite un pedido pagado (también invitaciones) |
| `agotado` | Una función se queda sin plazas |
| `devolucion` | Se devuelve una o varias entradas |
| `aforo_90` | Una función llega al 90 % del aforo (una sola vez) |
| `prueba` | Al pulsar «Enviar prueba» |

Ejemplo de cuerpo:

```json
{
  "evento": "venta",
  "enviado_en": "2026-11-01T10:15:00.000Z",
  "prueba": true,
  "funcion": { "id": "…", "codigo": "t01", "titulo": "Prueba técnica de venta · Antigua", "fecha": "2026-11-27", "hora": "20:30",
               "estado": "a_la_venta", "recinto": "Centro Cultural Polivalente de Antigua", "evento": "asombra-2026",
               "plazas": 379, "ocupadas": 120, "ocupacion": 31.7 },
  "pedido": { "codigo": "PED-H58QD7", "canal": "web", "total_cent": 4600, "gastos_cent": 200, "entradas": 2 }
}
```

No incluye nombre ni correo del comprador (datos personales). Si un flujo de n8n los necesita, se consultan desde el panel con permisos.

**Firma**: cabecera `X-Taquilla-Firma: t=<segundos>,v1=<hex>` donde `v1 = HMAC-SHA256(secreto, t + "." + cuerpo)`. El secreto (`whsec_…`) se muestra una sola vez al crear el webhook. En n8n, nodo *Code*:

```js
const crypto = require('crypto');
const [t, v1] = $json.headers['x-taquilla-firma'].split(',').map((x) => x.split('=')[1]);
const ok = crypto.createHmac('sha256', 'whsec_…').update(`${t}.${JSON.stringify($json.body)}`).digest('hex') === v1;
if (!ok || Math.abs(Date.now() / 1000 - Number(t)) > 300) throw new Error('Firma no válida');
return $input.all();
```

Reintentos: hasta 5 con espera creciente. Cada entrega queda registrada (estado y respuesta) en el panel. En producción solo se aceptan direcciones `https` públicas.

## Botón / widget «Comprar»

Panel → **Integraciones** → «Botón Comprar para otras webs» genera el código. Dos modos:

```html
<!-- Botón para una función -->
<script src="https://TAQUILLA/widget.js" data-funcion="ID" data-texto="Comprar entradas" data-color="#2469b0"></script>

<!-- Cartelera completa del festival (iframe que ajusta su altura) -->
<script src="https://TAQUILLA/widget.js" data-evento="asombra-2026" data-modo="cartelera" data-idioma="es"></script>
```

La compra se abre siempre en Taquilla, en una pestaña nueva (así el pago y las cookies funcionan en todos los navegadores). Para la web de ASOMBRA (`Procreartes/asombra-web`) bastaría con pegar el código donde hoy está el enlace a Entradas Canarias, **cuando se decida vender aquí** (de momento no se ha tocado esa web).

## Idiomas

Web pública, compra, entradas, cuenta del cliente, widget y correo de confirmación en **español, inglés y alemán**. Las traducciones al inglés y al alemán están marcadas como **pendientes de revisión nativa** (`apps/web/lib/i18n.tsx`, `apps/api/src/servicios/plantillas.ts`). El panel interno está en español. Los textos legales y los nombres de las funciones están en el idioma en que se escribieron.
