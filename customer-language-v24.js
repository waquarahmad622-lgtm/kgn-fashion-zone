/* KGN V24 - WhatsApp enquiry language polish. Load AFTER customer-bundles.js?v=23 */
(()=>{'use strict';
function install(){
  if(typeof window.makeMessage!=='function')return;
  const original=window.makeMessage;
  window.makeMessage=function(){
    let msg=original();
    const l=document.documentElement.lang||'hi';
    if(l==='hi'){
      msg=msg
        .replaceAll('/piece','/पीस')
        .replaceAll(' | Total: ',' | कुल: ')
        .replaceAll(' | Rate on enquiry',' | रेट पूछताछ पर')
        .replaceAll('ग्रैंड टोटल:','कुल राशि:')
        .replaceAll('रेट enquiry estimate हैं; stock और final invoice confirm करें।','रेट अनुमानित हैं; स्टॉक और अंतिम बिल की पुष्टि करें।')
        .replaceAll('रेट वाले आइटम का सबटोटल:','जिन आइटम के रेट उपलब्ध हैं उनका उप-कुल:')
        .replaceAll('RATE PENDING:','रेट बाकी:')
        .replaceAll('FINAL TOTAL: बाकी Rate confirm होने के बाद','अंतिम कुल: बाकी रेट की पुष्टि के बाद')
        .replaceAll('स्टॉक और उपलब्ध साइज़ की पुष्टि करें. यह इन्क्वायरी है, पक्का ऑर्डर नहीं।','कृपया स्टॉक और उपलब्ध साइज़ की पुष्टि करें। यह केवल इन्क्वायरी है, पक्का ऑर्डर नहीं।');
    }else if(l==='ur'){
      msg=msg
        .replaceAll('/piece','/پیس')
        .replaceAll(' | Total: ',' | کل: ')
        .replaceAll(' | Rate on enquiry',' | قیمت انکوائری پر')
        .replaceAll('گرینڈ ٹوٹل:','کل رقم:')
        .replaceAll('قیمتیں انکوائری کا تخمینہ ہیں؛ اسٹاک اور حتمی انوائس کی تصدیق کریں۔','قیمتیں تخمینی ہیں؛ اسٹاک اور حتمی بل کی تصدیق کریں۔')
        .replaceAll('قیمت والے آئٹمز کا سب ٹوٹل:','جن آئٹمز کی قیمت دستیاب ہے ان کا ذیلی کل:')
        .replaceAll('قیمت زیر التوا:','قیمت باقی:')
        .replaceAll('حتمی کل: باقی قیمت کی تصدیق کے بعد','حتمی کل: باقی قیمت کی تصدیق کے بعد');
    }
    return msg;
  };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})();
