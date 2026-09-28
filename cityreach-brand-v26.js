/* CityReach Solutions V27 — Hindi / English / Urdu developer branding */
(()=>{'use strict';

const DEV_EMAIL='cityreachsolutions@gmail.com';
const DEV_WHATSAPP='919651041100';

const COPY={
  hi:{
    developer:'ऐप डेवलपर',
    brand:'सिटीरीच सॉल्यूशंस',
    contact:'ऐप और वेबसाइट बनवाने के लिए संपर्क करें।',
    gmailLabel:'सिटीरीच सॉल्यूशंस को ईमेल करें',
    whatsappLabel:'सिटीरीच सॉल्यूशंस से WhatsApp पर संपर्क करें',
    subject:'ऐप और वेबसाइट डेवलपमेंट इन्क्वायरी',
    emailBody:
      'नमस्ते सिटीरीच सॉल्यूशंस,\n\nमुझे ऐप / वेबसाइट बनवाने के बारे में जानकारी चाहिए।',
    whatsappBody:
      'नमस्ते सिटीरीच सॉल्यूशंस, मुझे ऐप / वेबसाइट बनवाने के बारे में जानकारी चाहिए।'
  },

  en:{
    developer:'App Developer',
    brand:'CityReach Solutions',
    contact:'Contact us to get your app or website developed.',
    gmailLabel:'Email CityReach Solutions',
    whatsappLabel:'Contact CityReach Solutions on WhatsApp',
    subject:'App and Website Development Enquiry',
    emailBody:
      'Hello CityReach Solutions,\n\nI would like to enquire about app / website development.',
    whatsappBody:
      'Hello CityReach Solutions, I would like to enquire about app / website development.'
  },

  ur:{
    developer:'ایپ ڈیولپر',
    brand:'سٹی ریچ سلوشنز',
    contact:'ایپ اور ویب سائٹ بنوانے کے لیے رابطہ کریں۔',
    gmailLabel:'سٹی ریچ سلوشنز کو ای میل کریں',
    whatsappLabel:'سٹی ریچ سلوشنز سے واٹس ایپ پر رابطہ کریں',
    subject:'ایپ اور ویب سائٹ ڈیولپمنٹ انکوائری',
    emailBody:
      'السلام علیکم سٹی ریچ سلوشنز،\n\nمجھے ایپ / ویب سائٹ بنوانے کے بارے میں معلومات درکار ہیں۔',
    whatsappBody:
      'السلام علیکم سٹی ریچ سلوشنز، مجھے ایپ / ویب سائٹ بنوانے کے بارے میں معلومات درکار ہیں۔'
  }
};

function currentLang(){
  const lang=(document.documentElement.lang||'hi').toLowerCase();
  return lang.startsWith('ur')
    ? 'ur'
    : lang.startsWith('en')
      ? 'en'
      : 'hi';
}

function text(){
  return COPY[currentLang()];
}

function gmailUrl(){
  const t=text();

  return 'mailto:'+DEV_EMAIL+
    '?subject='+encodeURIComponent(t.subject)+
    '&body='+encodeURIComponent(t.emailBody);
}

function whatsappUrl(){
  const t=text();

  return 'https://wa.me/'+DEV_WHATSAPP+
    '?text='+encodeURIComponent(t.whatsappBody);
}

function addStyles(){
  if(document.getElementById('cityreachV27Styles'))return;

  const style=document.createElement('style');
  style.id='cityreachV27Styles';

  style.textContent=`
    .cr-dev-card{
      margin:18px 0 4px;
      padding:20px 16px;
      text-align:center;
      border:1px solid #eadcae;
      border-radius:22px;
      background:
        radial-gradient(circle at top right,#fff2bd 0,transparent 34%),
        linear-gradient(180deg,#fffefb 0%,#fff8e5 100%);
      box-shadow:0 12px 30px rgba(40,30,10,.07);
    }

    .cr-dev-title{
      font-size:11px;
      line-height:1.4;
      font-weight:900;
      letter-spacing:1.5px;
      color:#96720c;
      text-transform:uppercase;
    }

    .cr-dev-brand{
      margin:7px 0 0;
      font-size:20px;
      line-height:1.4;
      font-weight:900;
      color:#202532;
    }

    .cr-dev-contact{
      max-width:330px;
      margin:9px auto 0;
      font-size:13px;
      line-height:1.6;
      color:#686f7c;
    }

    .cr-dev-icons{
      display:flex;
      align-items:center;
      justify-content:center;
      gap:16px;
      margin-top:16px;
    }

    .cr-dev-icon{
      width:50px;
      height:50px;
      display:grid;
      place-items:center;
      border-radius:50%;
      background:#fff;
      border:1px solid #ece6d7;
      box-shadow:0 8px 20px rgba(0,0,0,.09);
      text-decoration:none;
      transition:
        transform .15s ease,
        box-shadow .15s ease;
      -webkit-tap-highlight-color:transparent;
    }

    .cr-dev-icon:active{
      transform:scale(.94);
    }

    .cr-dev-icon:focus-visible{
      outline:3px solid #d3a11a;
      outline-offset:3px;
    }

    .cr-dev-icon svg{
      width:27px;
      height:27px;
      display:block;
    }

    html[lang="ur"] .cr-dev-card{
      direction:rtl;
    }

    #cityreachAdminCredit{
      max-width:430px;
      margin:18px auto 8px;
    }
  `;

  document.head.appendChild(style);
}

function gmailIcon(){
  return `
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="6" width="26" height="20" rx="4" fill="#fff"/>
      <path d="M5 9l11 8 11-8"
        fill="none"
        stroke="#EA4335"
        stroke-width="3.2"
        stroke-linecap="round"
        stroke-linejoin="round"/>
      <path d="M5 10v13" stroke="#34A853" stroke-width="3"/>
      <path d="M27 10v13" stroke="#4285F4" stroke-width="3"/>
      <path d="M5 23h22" stroke="#FBBC05" stroke-width="3"/>
    </svg>
  `;
}

function whatsappIcon(){
  return `
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#25D366"/>
      <path fill="#fff"
        d="M22.7 18.8c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2
        -.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-2-1-3.4-2.4-4.3-4.3
        -.2-.3 0-.5.1-.7.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5
        .1-.2 0-.4 0-.5-.1-.2-.7-1.8-1-2.4-.2-.5-.5-.5-.7-.5
        h-.6c-.2 0-.6.1-.8.4-.3.3-1 1-1 2.3
        0 1.4 1 2.7 1.1 2.9.1.2 2 3.2 5 4.4
        3 1.3 3 .9 3.5.8.5-.1 1.8-.8 2.1-1.5
        .3-.7.3-1.4.2-1.5-.1-.2-.3-.2-.6-.4z"/>
    </svg>
  `;
}

function buildCard(){
  const card=document.createElement('section');
  card.className='cr-dev-card';

  card.innerHTML=`
    <div class="cr-dev-title"></div>

    <div class="cr-dev-brand"></div>

    <p class="cr-dev-contact"></p>

    <div class="cr-dev-icons">

      <a class="cr-dev-icon cr-gmail"
         target="_blank"
         rel="noopener noreferrer">
        ${gmailIcon()}
      </a>

      <a class="cr-dev-icon cr-whatsapp"
         target="_blank"
         rel="noopener noreferrer">
        ${whatsappIcon()}
      </a>

    </div>
  `;

  updateCard(card);

  return card;
}

function updateCard(card){
  if(!card)return;

  const t=text();

  const title=card.querySelector('.cr-dev-title');
  const brand=card.querySelector('.cr-dev-brand');
  const contact=card.querySelector('.cr-dev-contact');
  const gmail=card.querySelector('.cr-gmail');
  const whatsapp=card.querySelector('.cr-whatsapp');

  if(title)title.textContent=t.developer;
  if(brand)brand.textContent=t.brand;
  if(contact)contact.textContent=t.contact;

  if(gmail){
    gmail.href=gmailUrl();
    gmail.setAttribute('aria-label',t.gmailLabel);
    gmail.title=t.gmailLabel;
  }

  if(whatsapp){
    whatsapp.href=whatsappUrl();
    whatsapp.setAttribute('aria-label',t.whatsappLabel);
    whatsapp.title=t.whatsappLabel;
  }
}

function updateAllCards(){
  document.querySelectorAll('.cr-dev-card')
    .forEach(updateCard);
}

function customerCredit(){
  const host=document.querySelector('#more .pad');

  if(!host)return;

  let holder=document.getElementById('cityreachCustomerCredit');

  if(!holder){
    holder=document.createElement('div');
    holder.id='cityreachCustomerCredit';
    holder.appendChild(buildCard());

    const foot=host.querySelector('.footnote');

    if(foot){
      host.insertBefore(holder,foot);
    }else{
      host.appendChild(holder);
    }
  }

  updateAllCards();
}

function adminCredit(){
  const host=document.getElementById('adminPanel');

  if(!host)return;

  let holder=document.getElementById('cityreachAdminCredit');

  if(!holder){
    holder=document.createElement('div');
    holder.id='cityreachAdminCredit';
    holder.appendChild(buildCard());

    host.appendChild(holder);
  }

  updateAllCards();
}

function init(){
  addStyles();
  customerCredit();
  adminCredit();

  new MutationObserver(()=>{
    customerCredit();
    adminCredit();
    updateAllCards();
  }).observe(document.body,{
    childList:true,
    subtree:true
  });

  new MutationObserver(()=>{
    updateAllCards();
  }).observe(document.documentElement,{
    attributes:true,
    attributeFilter:['lang']
  });
}

if(document.readyState==='loading'){
  document.addEventListener(
    'DOMContentLoaded',
    init,
    {once:true}
  );
}else{
  init();
}

})();