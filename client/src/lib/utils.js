const API='/api';

export const money=(n,c='ل.ل')=>`${Number(n||0).toLocaleString('ar-LB-u-nu-latn')} ${c}`;
const arabicOnes=['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
const arabicTens=['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
function under100(n){
  if(n<20)return arabicOnes[n];
  const ones=n%10,tens=Math.floor(n/10);
  return ones?`${arabicOnes[ones]} و${arabicTens[tens]}`:arabicTens[tens];
}
function under1000(n){
  if(n<100)return under100(n);
  const hundreds=Math.floor(n/100),rest=n%100;
  const names=['','مئة','مئتان','ثلاثمئة','أربعمئة','خمسمئة','ستمئة','سبعمئة','ثمانمئة','تسعمئة'];
  return rest?`${names[hundreds]} و${under100(rest)}`:names[hundreds];
}
export function arabicNumberWords(value){
  let n=Math.round(Number(value)||0);
  if(n===0)return 'صفر';
  if(n<0)return `سالب ${arabicNumberWords(Math.abs(n))}`;
  const parts=[];
  const scales=[[1000000000,'مليار','ملياران','مليارات'],[1000000,'مليون','مليونان','ملايين'],[1000,'ألف','ألفان','آلاف']];
  for(const [scale,singular,dual,plural] of scales){
    if(n>=scale){
      const q=Math.floor(n/scale); n%=scale;
      let label=singular;
      if(q===2)label=dual; else if(q>=3&&q<=10)label=plural;
      parts.push(q===1?singular:q===2?dual:q<=10?`${arabicNumberWords(q)} ${plural}`:`${arabicNumberWords(q)} ${singular}`);
    }
  }
  if(n>0)parts.push(under1000(n));
  return parts.join(' و');
}
export const moneyInWords=(n,c='ل.ل')=>`${arabicNumberWords(n)} ${c}`;
export function getCookie(name){const prefix=`${name}=`;return document.cookie.split('; ').find(x=>x.startsWith(prefix))?.slice(prefix.length)||'';}
export async function api(path,opts={}){const headers={'Content-Type':'application/json',...(opts.headers||{})};const method=String(opts.method||'GET').toUpperCase();const csrf=getCookie(path.startsWith('/customer/')?'customer_csrf':'csrf');if(csrf&&method!=='GET'&&method!=='HEAD')headers['X-CSRF-Token']=decodeURIComponent(csrf);const r=await fetch(API+path,{...opts,headers,credentials:'include'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'حدث خطأ');return d;}
export const themes={classic:{label:'كلاسيكي',primary:'#9a3412',secondary:'#f59e0b',background:'#fffaf3'},ramadan:{label:'رمضان',primary:'#14532d',secondary:'#d4af37',background:'#fbf7ea'},eid:{label:'عيد',primary:'#7c3aed',secondary:'#f59e0b',background:'#fff7ed'},summer:{label:'صيفي',primary:'#0369a1',secondary:'#facc15',background:'#f0f9ff'},national:{label:'احتفالي',primary:'#b91c1c',secondary:'#15803d',background:'#fffaf5'}};
export function applyTheme(s){const t=themes[s.theme]||themes.classic;const primary=s.primary||t.primary,secondary=s.secondary||t.secondary,bg=s.background||t.background;document.documentElement.style.setProperty('--primary',primary);document.documentElement.style.setProperty('--secondary',secondary);document.documentElement.style.setProperty('--bg',bg);document.documentElement.style.setProperty('--primary-soft',`color-mix(in srgb, ${primary} 10%, white)`);document.documentElement.style.setProperty('--primary-softer',`color-mix(in srgb, ${primary} 5%, white)`);document.documentElement.style.setProperty('--secondary-soft',`color-mix(in srgb, ${secondary} 11%, white)`);document.documentElement.style.setProperty('--theme-line',`color-mix(in srgb, ${primary} 18%, #ddd)`);document.documentElement.style.setProperty('--theme-surface',`color-mix(in srgb, ${bg} 78%, white)`);}
export function setSiteMeta(settings, section='home') {
  const siteName = settings?.siteName || 'فرنية صاج';
  const titles = { home: siteName, menu: `قائمة الطعام | ${siteName}`, categories: `الأقسام | ${siteName}`, offers: `العروض | ${siteName}`, tracking: `تتبع الطلب | ${siteName}`, contact: `تواصل معنا | ${siteName}` };
  document.title = titles[section] || siteName;
  let icon = document.querySelector('link[rel="icon"]');
  if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon); }
  if (settings?.logoUrl) { icon.href = settings.logoUrl; icon.removeAttribute('type'); }
  else { icon.type='image/svg+xml'; icon.href=`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${settings?.primary || '#14532d'}"/><text x="32" y="43" text-anchor="middle" font-size="34" font-family="Arial" fill="white">ف</text></svg>`)}`; }
}
export function updateSectionMeta(settings) {
  const hash=window.location.hash.replace('#','');
  const section=hash==='full-menu'?'menu':hash==='categories'?'categories':hash==='offers'?'offers':hash==='track-order'?'tracking':hash==='contact'?'contact':'home';
  setSiteMeta(settings,section);
}
