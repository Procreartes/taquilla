# Entradas y puerta

## Códigos QR

| QR | Dónde | Contenido |
|---|---|---|
| Rotatorio | Móvil (enlace del pedido o «Mis entradas») | `T1R.<función>.<entrada>.<ventana>.<firma>` — cambia cada 15 s |
| Estático | PDF (impreso o en el móvil) | `T1S.<función>.<entrada>.<firma>` |

- Las firmas son HMAC-SHA256 con `SECRETO_QR` (solo en el servidor).
- El móvil del cliente recibe solo la *llave* de sus entradas (derivada del secreto), con la que calcula el QR de cada ventana de 15 s. Se aceptan ±30 s de desfase de reloj.
- Una captura de pantalla del QR rotatorio caduca en menos de un minuto («QR caducado»).
- El personal de puerta también puede teclear el código impreso (`TKT-XXXXXXXX`).

## App de puerta (`/puerta`)

1. Entrar con un usuario con permiso de puerta (rol «Puerta», «Producción» o «Administración»).
2. Elegir la función: el móvil descarga la lista de entradas de esa función (con lo necesario para comprobar las firmas sin conexión).
3. Leer con la cámara o teclear el código. Mensajes: **Adelante**, **Ya utilizada** (con la hora), **QR caducado**, **Es de otra función** (y cuál), **Entrada anulada**, **Código manipulado**, **Código no válido**.
4. **Con conexión** la validación la decide el servidor de forma atómica: aunque dos puertas lean la misma entrada a la vez, solo una dice «Adelante».
5. **Sin conexión** valida con la lista descargada y guarda las lecturas. Al volver la red las sincroniza (cada 20 s). Si otra puerta había dejado pasar esa entrada antes, se avisa de la **doble entrada** para revisarla.
6. Se puede «instalar» en el móvil (Añadir a pantalla de inicio) y abrir sin conexión.

**Límite conocido:** sin conexión, dos dispositivos distintos no pueden saber lo que ha validado el otro hasta que sincronizan. Por eso se recomienda una red Wi-Fi propia en puerta y usar el modo sin conexión solo como respaldo.

## Cuenta del cliente (`/cuenta`)

Sin contraseñas: la persona escribe su correo y recibe un enlace (30 minutos) que abre su cuenta durante 30 días en ese navegador. Si el correo no tiene compras, no se envía nada (y la respuesta es la misma, para no revelar quién ha comprado).

## Apple Wallet y Google Wallet

Preparado en `apps/api/src/servicios/monederos.ts`. Hace falta:
- **Apple**: cuenta Apple Developer, *Pass Type ID*, certificado de firma y certificado WWDR (`APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT`, `APPLE_PASS_KEY`, `APPLE_WWDR_CERT`).
- **Google**: emisor de Google Wallet API y cuenta de servicio (`GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT`).

Los pases llevarán el QR estático (los monederos no admiten un código que cambie cada 15 s sin un servidor de actualizaciones).
