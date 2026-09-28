/* CityReach Solutions V26 — professional developer credit */
(()=>{'use strict';

const DEV_EMAIL='cityreachsolutions@gmail.com';
const DEV_WHATSAPP='919651041100';

const GMAIL_URL=
  'mailto:'+DEV_EMAIL+
  '?subject='+encodeURIComponent('App Development Enquiry')+
  '&body='+encodeURIComponent(
    'Hello CityReach Solutions,\n\nMujhe app development / website development ke baare me enquiry karni hai.'
  );

const WHATSAPP_URL=
  'https://wa.me/'+DEV_WHATSAPP+
  '?text='+encodeURIComponent(
    'Hello CityReach Solutions, I would like to enquire about app development.'
  );

function addStyles(){
  if(document.getElementById('cityreachV26Styles'))return;

  const s=document.createElement('style');
  s.id='cityreachV26Styles';
  s.textContent=`
    .cr-dev-card{
      margin:18px 0 4px;
      padding:18px 16px;
      text-align:center;
      border:1px solid #eadcae;
      border-radius:20px;
      background:
        radial-gradient(circle at top right,#fff5cc 0,transparent 34%),
        linear-gradient(180deg,#fffefb,#fff9ea);
      box-shadow:0 10px 28px rgba(40,30,10,.07);
    }

    .cr-dev-eyebrow{
      font-size:10px;
      font-weight:900;
      letter-spacing:1.8px;
      color:#9a7611;
      text-transform:uppercase;
    }

    .cr-dev-name{
      margin:5px 0 3px;
      font-size:17px;
      font-weight:900;
      color:#222733;
    }

    .cr-dev-sub{
      margin:0;
      font-size:11px;
      color:#757b87;
      letter-spacing:.2px;
    }

    .cr-dev-icons{
      display:flex;
      align-items:center;
      justify-content:center;
      gap:14px;
      margin-top:14px;
    }

    .cr-dev-icon{
      width:46px;
      height:46px;
      display:grid;
      place-items:center;
      border-radius:50%;
      background:#fff;
      border:1px solid #ece8dc;
      box-shadow:0 7px 18px rgba(0,0,0,.09);
      transition:transform .15s ease,box-shadow .15s ease;
      -webkit-tap-highlight-color:transparent;
    }

    .cr-dev-icon:active{
      transform:scale(.94);
    }

    .cr-dev-icon:focus-visible{
      outline:3px solid #d6a51a;
      outline-offset:3px;
    }

    .cr-dev-icon svg{
      width:25px;
      height:25px;
      display:block;
    }

    #cityreachAdminCredit{
      max-width:430px;
      margin:18px auto 8px;
    }
  `;
  document.head.appendChild(s);
}

function gmailIcon(){
  return `
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="6" width="26" height="20" rx="4" fill="#fff"/>
      <path d="M5 9l11 8 11-8" fill="none"
        stroke="#EA4335" stroke-width="3.2"
        stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5 10v13" stroke="#34A853" stroke-width="3"/>
      <path d="M27 10v13" stroke="#4285F4" stroke-width="3"/>
      <path d="M5 23h22" stroke="#FBBC05" stroke-width="3"/>
    </svg>`;
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
        h-.6c-.2 0-.6.1-.8.4-.3.3-1 1-1 2.3 0 1.4 1 2.7
        1.1 2.9.1.2 2 3.2 5 4.4 3 1.3 3 .9 3.5.8
        .5-.1 1.8-.8 2.1-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.2-.6-.4z"/>
    </svg>`;
}

function buildCard(){
  const card=document.createElement('section');
  card.className='cr-dev-card';

  card.innerHTML=`
    <div class="cr-dev-eyebrow">App Developer</div>
    <div class="cr-dev-name">CityReach Solutions</div>
    <p class="cr-dev-sub">Apps • Websites • Digital Solutions</p>

    <div class="cr-dev-icons">
      <a class="cr-dev-icon"
         href="${GMAIL_URL}"
         target="_blank"
         rel="noopener noreferrer"
         aria-label="Email CityReach Solutions"
         title="Email CityReach Solutions">
         ${gmailIcon()}
      </a>

      <a class="cr-dev-icon"
         href="${WHATSAPP_URL}"
         target="_blank"
         rel="noopener noreferrer"
         aria-label="WhatsApp CityReach Solutions"
         title="WhatsApp CityReach Solutions">
         ${whatsappIcon()}
      </a>
    </div>
  `;

  return card;
}

function customerCredit(){
  const host=document.querySelector('#more .pad');
  if(!host || document.getElementById('cityreachCustomerCredit'))return;

  const holder=document.createElement('div');
  holder.id='cityreachCustomerCredit';
  holder.appendChild(buildCard());

  const foot=host.querySelector('.footnote');
  if(foot)host.insertBefore(holder,foot);
  else host.appendChild(holder);
}

function adminCredit(){
  const host=document.getElementById('adminPanel');
  if(!host || document.getElementById('cityreachAdminCredit'))return;

  const holder=document.createElement('div');
  holder.id='cityreachAdminCredit';
  holder.appendChild(buildCard());

  host.appendChild(holder);
}

function init(){
  addStyles();
  customerCredit();
  adminCredit();

  new MutationObserver(()=>{
    customerCredit();
    adminCredit();
  }).observe(document.body,{childList:true,subtree:true});
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',init,{once:true});
}else{
  init();
}
})();