/* Catalogue gallery: full photos, bounded 1–4x zoom, pinch, pan and keyboard controls. */
(() => {
  'use strict';
  let product = null, index = 0, returnFocus = null;
  let scale = 1, x = 0, y = 0, gesture = null, lastTap = null, lastTouch = 0;
  const pointers = new Map();
  const labels = {
    hi: {close:'फोटो बंद करें',prev:'पिछली फोटो',next:'अगली फोटो',in:'फोटो बड़ी करें',out:'फोटो छोटी करें',reset:'पूरी फोटो',zoom:'फोटो zoom',photo:'फोटो',hint:'दो उँगलियों से फैलाएँ या double-tap करें। Zoom के बाद फोटो खिसकाकर देखें।',toolbar:'फोटो zoom के विकल्प'},
    en: {close:'Close photos',prev:'Previous photo',next:'Next photo',in:'Zoom in',out:'Zoom out',reset:'Fit photo',zoom:'Photo zoom',photo:'Photo',hint:'Pinch or double-tap to zoom. Drag the enlarged photo to see details.',toolbar:'Photo zoom controls'},
    ur: {close:'تصاویر بند کریں',prev:'پچھلی تصویر',next:'اگلی تصویر',in:'تصویر بڑی کریں',out:'تصویر چھوٹی کریں',reset:'پوری تصویر',zoom:'تصویر زوم',photo:'تصویر',hint:'دو انگلیوں سے پھیلائیں یا دو بار ٹیپ کریں۔ زوم کے بعد تصویر کھسکا کر دیکھیں۔',toolbar:'تصویر زوم کے اختیارات'}
  };
  const t = () => labels[document.documentElement.lang] || labels.hi;
  const dialog = document.createElement('dialog');
  dialog.className = 'kgn-gallery';
  dialog.setAttribute('aria-labelledby', 'kgnGalleryTitle');
  dialog.innerHTML = `<div class="kgn-gallery-head"><strong id="kgnGalleryTitle"></strong><button type="button" id="kgnGalleryClose">×</button></div>
    <div class="kgn-gallery-stage"><div class="kgn-gallery-viewport" id="kgnGalleryViewport" tabindex="0" role="group" aria-describedby="kgnGalleryHint"><img id="kgnGalleryImage" alt="" draggable="false"></div><button type="button" id="kgnGalleryPrev">‹</button><button type="button" id="kgnGalleryNext">›</button></div>
    <div class="kgn-gallery-zoom" role="group"><button type="button" id="kgnGalleryZoomOut">−</button><output id="kgnGalleryZoomLevel" aria-live="polite">1×</output><button type="button" id="kgnGalleryZoomIn">+</button><button type="button" id="kgnGalleryReset"></button></div>
    <p id="kgnGalleryHint"></p><p id="kgnGalleryCount" aria-live="polite"></p><div id="kgnGalleryThumbs" class="kgn-gallery-thumbs"></div>`;
  const $ = id => dialog.querySelector('#' + id);
  const viewport = $('kgnGalleryViewport'), image = $('kgnGalleryImage');
  const images = () => product?.images?.length ? product.images.slice(0, 4) : [product?.image];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function drawZoom() {
    const width = viewport.clientWidth, height = viewport.clientHeight;
    const fit = image.naturalWidth && image.naturalHeight
      ? Math.min(width / image.naturalWidth, height / image.naturalHeight) : 1;
    const photoWidth = image.naturalWidth ? image.naturalWidth * fit : width;
    const photoHeight = image.naturalHeight ? image.naturalHeight * fit : height;
    const maxX = Math.max(0, (photoWidth * scale - width) / 2);
    const maxY = Math.max(0, (photoHeight * scale - height) / 2);
    x = clamp(x, -maxX, maxX); y = clamp(y, -maxY, maxY);
    image.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    viewport.classList.toggle('is-zoomed', scale > 1);
    viewport.classList.toggle('is-dragging', pointers.size > 0 && scale > 1);
    $('kgnGalleryZoomLevel').textContent = Number(scale.toFixed(1)) + '×';
    $('kgnGalleryZoomOut').disabled = scale <= 1;
    $('kgnGalleryZoomIn').disabled = scale >= 4;
    $('kgnGalleryReset').disabled = scale === 1;
  }
  function resetZoom() {
    pointers.clear(); gesture = null; lastTap = null;
    scale = 1; x = 0; y = 0; drawZoom();
  }
  function zoomAt(value, from, to = from) {
    const rect = viewport.getBoundingClientRect();
    const center = {x:rect.left + rect.width / 2, y:rect.top + rect.height / 2};
    from = from || center; to = to || center;
    const next = clamp(value, 1, 4), ratio = next / scale;
    x = to.x - center.x - (from.x - center.x - x) * ratio;
    y = to.y - center.y - (from.y - center.y - y) * ratio;
    scale = next; drawZoom();
  }
  function toggleZoom(point) { if (scale > 1) resetZoom(); else zoomAt(2.5, point); }
  function paint() {
    const all = images(), words = t();
    $('kgnGalleryTitle').textContent = displayName(product);
    image.src = imgSrc(all[index]); image.alt = displayName(product) + ' · ' + (index + 1);
    $('kgnGalleryCount').textContent = (index + 1) + ' / ' + all.length;
    for (const [id, key] of [['kgnGalleryClose','close'],['kgnGalleryPrev','prev'],['kgnGalleryNext','next'],['kgnGalleryZoomIn','in'],['kgnGalleryZoomOut','out']]) $(id).setAttribute('aria-label', words[key]);
    viewport.setAttribute('aria-label', words.zoom);
    dialog.querySelector('.kgn-gallery-zoom').setAttribute('aria-label', words.toolbar);
    $('kgnGalleryReset').textContent = words.reset;
    $('kgnGalleryHint').textContent = words.hint;
    const host = $('kgnGalleryThumbs'); host.replaceChildren();
    all.forEach((src, i) => {
      const button = document.createElement('button'); button.type = 'button';
      button.setAttribute('aria-label', words.photo + ' ' + (i + 1));
      button.setAttribute('aria-pressed', String(i === index));
      const pic = document.createElement('img'); pic.src = imgSrc(src); pic.alt = '';
      button.append(pic); button.onclick = () => { index = i; paint(); }; host.append(button);
    });
    $('kgnGalleryPrev').disabled = all.length < 2;
    $('kgnGalleryNext').disabled = all.length < 2;
    resetZoom();
  }
  function move(delta) { index = (index + delta + images().length) % images().length; paint(); }
  function close() { dialog.close(); }
  function point(e) { return {x:e.clientX, y:e.clientY}; }
  function pair() {
    const [a, b] = [...pointers.values()];
    return {center:{x:(a.x + b.x) / 2, y:(a.y + b.y) / 2}, distance:Math.hypot(a.x - b.x, a.y - b.y)};
  }
  function down(id, p, kind) {
    pointers.set(id, p);
    if (kind !== 'mouse') lastTouch = Date.now();
    if (pointers.size === 1) gesture = {start:p, startScale:scale, at:Date.now(), moved:false, pinched:false};
    else { gesture.pinched = true; gesture.moved = true; lastTap = null; }
    drawZoom();
  }
  function drag(id, p) {
    if (!pointers.has(id)) return;
    const old = pointers.get(id), before = pointers.size >= 2 ? pair() : null;
    pointers.set(id, p);
    if (before) {
      const after = pair();
      if (before.distance > 0) zoomAt(scale * after.distance / before.distance, before.center, after.center);
    } else {
      if (Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 10) gesture.moved = true;
      if (scale > 1) { x += p.x - old.x; y += p.y - old.y; drawZoom(); }
    }
  }
  function up(id, p, kind, cancelled = false) {
    if (!pointers.has(id)) return;
    const ended = gesture;
    pointers.delete(id);
    if (pointers.size) {
      gesture = {start:[...pointers.values()][0], startScale:scale, at:Date.now(), moved:true, pinched:true};
    } else {
      gesture = null;
      if (!cancelled && ended && !ended.pinched) {
        const dx = p.x - ended.start.x, dy = p.y - ended.start.y;
        if (scale === 1 && ended.startScale === 1 && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) move(dx < 0 ? 1 : -1);
        else if (!ended.moved && Math.hypot(dx, dy) <= 10 && kind !== 'mouse' && Date.now() - ended.at < 350) {
          if (lastTap && Date.now() - lastTap.at < 350 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) { toggleZoom(p); lastTap = null; }
          else lastTap = {...p, at:Date.now()};
        } else lastTap = null;
      } else lastTap = null;
    }
    drawZoom();
  }
  function installGestures() {
    if ('PointerEvent' in window) {
      viewport.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault(); viewport.focus({preventScroll:true});
        down(e.pointerId, point(e), e.pointerType);
        try { viewport.setPointerCapture(e.pointerId); } catch {}
      });
      viewport.addEventListener('pointermove', e => drag(e.pointerId, point(e)));
      viewport.addEventListener('pointerup', e => up(e.pointerId, point(e), e.pointerType));
      viewport.addEventListener('pointercancel', e => up(e.pointerId, point(e), e.pointerType, true));
      viewport.addEventListener('lostpointercapture', e => up(e.pointerId, point(e), e.pointerType, true));
    } else {
      // Older touch browsers keep pinch/drag; buttons and double-click remain usable with a mouse.
      viewport.addEventListener('touchstart', e => { e.preventDefault(); for (const p of e.changedTouches) down(p.identifier, point(p), 'touch'); }, {passive:false});
      viewport.addEventListener('touchmove', e => { e.preventDefault(); for (const p of e.changedTouches) drag(p.identifier, point(p)); }, {passive:false});
      for (const name of ['touchend','touchcancel']) viewport.addEventListener(name, e => { e.preventDefault(); for (const p of e.changedTouches) up(p.identifier, point(p), 'touch', name === 'touchcancel'); }, {passive:false});
    }
    viewport.addEventListener('dblclick', e => { if (Date.now() - lastTouch > 500) { e.preventDefault(); toggleZoom(point(e)); } });
    viewport.addEventListener('wheel', e => { if (!e.ctrlKey && e.deltaY) { e.preventDefault(); zoomAt(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), point(e)); } }, {passive:false});
    image.addEventListener('dragstart', e => e.preventDefault());
  }
  function install() {
    document.body.append(dialog);
    if (typeof dialog.showModal !== 'function' && window.dialogPolyfill) window.dialogPolyfill.registerDialog(dialog);
    document.addEventListener('click', e => {
      const trigger = e.target.closest('[data-gallery]'); if (!trigger) return;
      product = products.find(p => p.id === trigger.dataset.gallery); if (!product) return;
      returnFocus = trigger; index = 0; paint(); dialog.showModal();
      document.body.classList.add('kgn-gallery-open'); drawZoom();
    });
    $('kgnGalleryClose').onclick = close;
    $('kgnGalleryPrev').onclick = () => move(-1); $('kgnGalleryNext').onclick = () => move(1);
    $('kgnGalleryZoomIn').onclick = () => zoomAt(scale + 0.5);
    $('kgnGalleryZoomOut').onclick = () => zoomAt(scale - 0.5);
    $('kgnGalleryReset').onclick = resetZoom;
    dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
    dialog.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(scale + 0.5); }
      else if (e.key === '-') { e.preventDefault(); zoomAt(scale - 0.5); }
      else if (e.key === '0') { e.preventDefault(); resetZoom(); }
      else if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
        if (scale > 1) { e.preventDefault(); x += e.key === 'ArrowLeft' ? 40 : e.key === 'ArrowRight' ? -40 : 0; y += e.key === 'ArrowUp' ? 40 : e.key === 'ArrowDown' ? -40 : 0; drawZoom(); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); move(e.key === 'ArrowLeft' ? -1 : 1); }
      }
    });
    dialog.addEventListener('close', () => { resetZoom(); document.body.classList.remove('kgn-gallery-open'); returnFocus?.focus(); });
    image.addEventListener('load', drawZoom);
    window.addEventListener('resize', () => { if (dialog.open) drawZoom(); });
    if ('ResizeObserver' in window) new ResizeObserver(() => { if (dialog.open) drawZoom(); }).observe(viewport);
    installGestures();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
})();
