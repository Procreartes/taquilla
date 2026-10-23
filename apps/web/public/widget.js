/*! Taquilla · botón/widget «Comprar» para insertar en otras webs.
 *
 *  Botón:    <script src="https://TAQUILLA/widget.js" data-funcion="ID-DE-LA-FUNCION" data-texto="Comprar entradas"></script>
 *  Cartelera:<script src="https://TAQUILLA/widget.js" data-evento="asombra-2026" data-modo="cartelera"></script>
 *
 *  Atributos opcionales: data-color="#2340b5", data-idioma="es|en|de".
 *  La compra se abre siempre en una pestaña nueva de Taquilla (pago seguro, sin cookies de terceros).
 */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var base = new URL(s.src).origin;
  var d = s.dataset;
  var idioma = /^(es|en|de)$/.test(d.idioma || '') ? d.idioma : '';
  var q = idioma ? '?lang=' + idioma : '';
  var destino = d.funcion ? '/f/' + encodeURIComponent(d.funcion) : '/e/' + encodeURIComponent(d.evento || '');
  if (d.modo === 'cartelera' || d.modo === 'ficha') {
    var i = document.createElement('iframe');
    i.src = base + '/widget' + (d.funcion ? '/f/' + encodeURIComponent(d.funcion) : '/e/' + encodeURIComponent(d.evento || '')) + q;
    i.title = d.titulo || 'Entradas';
    i.loading = 'lazy';
    i.style.cssText = 'width:100%;border:0;min-height:160px;display:block';
    window.addEventListener('message', function (e) {
      if (e.origin === base && e.source === i.contentWindow && e.data && typeof e.data.taquillaAltura === 'number') i.style.height = Math.min(e.data.taquillaAltura, 20000) + 'px';
    });
    s.parentNode.insertBefore(i, s.nextSibling);
    return;
  }
  var a = document.createElement('a');
  a.href = base + destino + q;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = d.texto || 'Comprar entradas';
  var color = /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color : '#2340b5';
  a.style.cssText = 'display:inline-block;background:' + color + ';color:#fff;font:700 16px system-ui,sans-serif;padding:12px 22px;border-radius:999px;text-decoration:none;min-height:44px;box-sizing:border-box';
  s.parentNode.insertBefore(a, s.nextSibling);
})();
