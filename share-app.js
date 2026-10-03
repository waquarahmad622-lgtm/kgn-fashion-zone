/* Share the public app link only, never a customer's enquiry or current URL. */
(() => {
  'use strict';
  const APP_URL = 'https://waquarahmad622-lgtm.github.io/kgn-fashion-zone/index.html';
  const APP_NAME = 'K.G.N. Fashion Zone';
  const copy = {
    hi: {
      button: 'ऐप शेयर करें', title: 'अपनों तक पहुँचाएँ',
      description: 'WhatsApp, Gmail या मैसेज से ऐप का लिंक भेजें।',
      whatsapp: 'WhatsApp', gmail: 'Gmail', sms: 'मैसेज', copy: 'लिंक कॉपी',
      native: 'और ऐप्स में शेयर करें', close: 'बंद करें', link: 'ऐप का लिंक',
      email: 'अन्य ईमेल ऐप से भेजें', copied: 'लिंक कॉपी हो गया।',
      manual: 'लिंक चुना गया है। उसे दबाकर रखें और कॉपी करें।',
      failed: 'यहाँ शेयर नहीं हो पाया। ऊपर कोई विकल्प चुनें या लिंक कॉपी करें।',
      message: 'K.G.N. Fashion Zone का ऐप खोलें और लेडीज़, जेंट्स व किड्स के फैंसी कपड़ों का कलेक्शन देखें। केवल थोक बिक्री।'
    },
    en: {
      button: 'Share app', title: 'Pass it along',
      description: 'Send the app link through WhatsApp, Gmail or Messages.',
      whatsapp: 'WhatsApp', gmail: 'Gmail', sms: 'Messages', copy: 'Copy link',
      native: 'Share in other apps', close: 'Close', link: 'App link',
      email: 'Use another email app', copied: 'Link copied.',
      manual: 'Link selected. Press and hold it to copy.',
      failed: 'Sharing could not open. Choose an option above or copy the link.',
      message: 'Open the K.G.N. Fashion Zone app to browse ladies’, gents’ and kids’ fancy garments. Wholesale only.'
    },
    ur: {
      button: 'ایپ شیئر کریں', title: 'اپنوں تک پہنچائیں',
      description: 'واٹس ایپ، جی میل یا میسج سے ایپ کا لنک بھیجیں۔',
      whatsapp: 'واٹس ایپ', gmail: 'جی میل', sms: 'میسج', copy: 'لنک کاپی',
      native: 'دیگر ایپس میں شیئر کریں', close: 'بند کریں', link: 'ایپ کا لنک',
      email: 'دوسری ای میل ایپ سے بھیجیں', copied: 'لنک کاپی ہو گیا۔',
      manual: 'لنک منتخب ہے۔ اسے دبا کر رکھیں اور کاپی کریں۔',
      failed: 'شیئر نہیں ہو سکا۔ اوپر کوئی آپشن چنیں یا لنک کاپی کریں۔',
      message: 'کے جی این فیشن زون کی ایپ کھولیں اور لیڈیز، جینٹس اور بچوں کے فینسی کپڑوں کا کلیکشن دیکھیں۔ صرف ہول سیل۔'
    }
  };
  function init() {
    const trigger = document.getElementById('kgnShareTrigger');
    const dialog = document.getElementById('kgnShareDialog');
    if (!trigger || !dialog || trigger.dataset.shareReady) return;
    trigger.dataset.shareReady = 'true';
    const close = document.getElementById('kgnShareClose');
    const native = document.getElementById('kgnShareNative');
    const link = document.getElementById('kgnShareLink');
    const status = document.getElementById('kgnShareStatus');
    let previousFocus;
    let sharing = false;
    let statusKey = '';
    const language = () => Object.prototype.hasOwnProperty.call(copy, document.documentElement.lang) ? document.documentElement.lang : 'hi';
    const labels = () => copy[language()];
    function update() {
      const lang = language();
      const text = copy[lang];
      dialog.lang = lang;
      dialog.dir = lang === 'ur' ? 'rtl' : 'ltr';
      document.querySelectorAll('[data-kgn-share-label]').forEach(el => {
        const value = text[el.dataset.kgnShareLabel];
        if (value) el.textContent = value;
      });
      trigger.setAttribute('aria-label', text.button);
      close.setAttribute('aria-label', text.close);
      const message = text.message + '\n\n' + APP_URL;
      const body = encodeURIComponent(message);
      const subject = encodeURIComponent(APP_NAME);
      document.getElementById('kgnShareWhatsApp').href = 'https://wa.me/?text=' + body;
      document.getElementById('kgnShareGmail').href = 'https://mail.google.com/mail/?view=cm&fs=1&su=' + subject + '&body=' + body;
      document.getElementById('kgnShareEmail').href = 'mailto:?subject=' + subject + '&body=' + body;
      // iOS Messages uses &body; Android and other SMS handlers use ?body.
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      document.getElementById('kgnShareSms').href = 'sms:' + (ios ? '&' : '?') + 'body=' + body;
      link.value = APP_URL;
      native.hidden = typeof navigator.share !== 'function';
      status.textContent = statusKey ? text[statusKey] : '';
    }
    function setStatus(key) { statusKey = key; status.textContent = key ? labels()[key] : ''; }
    trigger.addEventListener('click', () => {
      if (dialog.open) return;
      previousFocus = document.activeElement;
      setStatus('');
      update();
      dialog.showModal();
      document.body.classList.add('kgn-share-open');
      trigger.setAttribute('aria-expanded', 'true');
      close.focus();
    });
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button:not(:disabled), a[href], input')].filter(el => el.getClientRects().length);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('kgn-share-open');
      trigger.setAttribute('aria-expanded', 'false');
      if (previousFocus && previousFocus.isConnected) previousFocus.focus({preventScroll: true});
    });
    document.getElementById('kgnShareCopy').addEventListener('click', async () => {
      setStatus('');
      try {
        await navigator.clipboard.writeText(APP_URL);
        setStatus('copied');
      } catch (_) {
        link.focus();
        link.select();
        link.setSelectionRange(0, link.value.length);
        setStatus('manual');
      }
    });
    link.addEventListener('click', () => { link.select(); link.setSelectionRange(0, link.value.length); });
    native.addEventListener('click', async () => {
      if (sharing || typeof navigator.share !== 'function') return;
      sharing = true;
      native.disabled = true;
      setStatus('');
      try {
        // Invoke immediately from the tap so the browser retains user activation.
        await navigator.share({title: APP_NAME, text: labels().message, url: APP_URL});
      } catch (error) {
        if (!error || error.name !== 'AbortError') setStatus('failed');
      } finally {
        sharing = false;
        native.disabled = false;
      }
    });
    update();
    new MutationObserver(update).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();
})();
