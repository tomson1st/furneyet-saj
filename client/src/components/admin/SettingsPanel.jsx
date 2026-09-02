
function LocationPicker({latitude,longitude,onChange}){
  const mapRef=useRef(null);
  const mapInstance=useRef(null);
  const markerRef=useRef(null);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    const load=()=>{
      if(window.L){setReady(true);return}
      const css=document.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(css);
      const script=document.createElement('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.onload=()=>setReady(true);document.body.appendChild(script);
    };load();
    return ()=>{};
  },[]);
  useEffect(()=>{
    if(!ready||!mapRef.current||mapInstance.current)return;
    const lat=Number(latitude)||33.8938, lng=Number(longitude)||35.5018;
    const map=window.L.map(mapRef.current).setView([lat,lng],14);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map);
    const marker=window.L.marker([lat,lng],{draggable:true}).addTo(map);
    const select=(e)=>{const {lat,lng}=e.latlng;marker.setLatLng([lat,lng]);onChange(lat,lng)};
    map.on('click',select);
    marker.on('dragend',()=>{const p=marker.getLatLng();onChange(p.lat,p.lng)});
    mapInstance.current=map;markerRef.current=marker;
    setTimeout(()=>map.invalidateSize(),100);
    return()=>{map.remove();mapInstance.current=null};
  },[ready]);
  useEffect(()=>{
    if(!mapInstance.current||!markerRef.current)return;
    const lat=Number(latitude),lng=Number(longitude);
    if(Number.isFinite(lat)&&Number.isFinite(lng)){markerRef.current.setLatLng([lat,lng]);mapInstance.current.setView([lat,lng],mapInstance.current.getZoom())}
  },[latitude,longitude]);
  return <div className="location-picker"><div className="location-map" ref={mapRef}>{!ready&&<div className="location-map-loading">جاري تحميل الخريطة…</div>}</div><div className="location-coordinates"><label>خط العرض<input dir="ltr" inputMode="decimal" value={latitude||''} onChange={e=>onChange(e.target.value,longitude)}/></label><label>خط الطول<input dir="ltr" inputMode="decimal" value={longitude||''} onChange={e=>onChange(latitude,e.target.value)}/></label></div><small className="muted">اضغط على الخريطة لتحديد الموقع أو اسحب العلامة إلى المكان المطلوب.</small></div>
}
import React,{useEffect,useRef,useState} from 'react';
import {api,applyTheme,themes} from '../../lib/utils';
import {useProgress} from '../../context/ProgressContext';
export default function SettingsPanel({data,refresh}){const {run}=useProgress();const [f,setF]=useState({...data.settings});const [logoBusy,setLogoBusy]=useState(false);const [logoError,setLogoError]=useState('');const [waTest,setWaTest]=useState('');const save=async()=>{await run('جاري حفظ إعدادات الموقع…',()=>api('/admin/settings',{method:'PUT',body:JSON.stringify(f)}));applyTheme(f);await refresh()};const uploadLogo=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setLogoError('');if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type)){setLogoError('استخدم JPG أو PNG أو WEBP أو GIF.');return}if(file.size>4*1024*1024){setLogoError('حجم الشعار يجب ألا يتجاوز 4MB.');return}setLogoBusy(true);try{const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('تعذر قراءة الملف.'));r.readAsDataURL(file)});const result=await run('جاري رفع الشعار…',()=>api('/admin/upload-logo',{method:'POST',body:JSON.stringify({dataUrl,fileName:file.name})}));setF(x=>({...x,logoUrl:result.url}))}catch(err){setLogoError(err.message||'تعذر رفع الشعار.')}finally{setLogoBusy(false)}};return <section className="panel settings-panel"><h2>هوية الموقع</h2><div className="form-grid"><label>اسم الموقع<input value={f.siteName||''} onChange={e=>setF({...f,siteName:e.target.value})}/></label><div className="logo-upload-block"><label>الشعار / رابط الصورة<input value={f.logoUrl||''} onChange={e=>setF({...f,logoUrl:e.target.value})}/></label><label className="image-upload-field logo-upload-field"><span>أو اختر الشعار من جهازك</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={logoBusy} onChange={uploadLogo}/><small>{logoBusy?'جاري رفع الشعار…':'يمكنك اختيار صورة مباشرة من الهاتف أو الكمبيوتر.'}</small></label>{logoError&&<div className="error">{logoError}</div>}{f.logoUrl&&<div className="logo-preview"><img src={f.logoUrl} alt="معاينة الشعار"/><button type="button" className="btn ghost" disabled={logoBusy} onClick={()=>setF(x=>({...x,logoUrl:''}))}>إزالة الشعار</button></div>}</div><label>الوصف المختصر<input value={f.tagline||''} onChange={e=>setF({...f,tagline:e.target.value})}/></label><label>رقم الهاتف / WhatsApp<input value={f.phone||''} onChange={e=>setF({...f,phone:e.target.value})}/></label><label className="full-field">العنوان<input value={f.address||''} onChange={e=>setF({...f,address:e.target.value})} placeholder="عنوان المطعم"/></label><div className="full-field location-picker-field"><span className="field-label">الموقع الجغرافي</span><LocationPicker latitude={f.latitude||'33.8938'} longitude={f.longitude||'35.5018'} onChange={(lat,lng)=>setF(x=>({...x,latitude:String(lat),longitude:String(lng)}))}/></div><label>العملة<input value={f.currency||''} onChange={e=>setF({...f,currency:e.target.value})}/></label></div><h2>الثيم والمناسبة</h2><div className="theme-grid">{Object.entries(themes).map(([k,t])=><button key={k} className={f.theme===k?'theme selected':'theme'} onClick={()=>setF({...f,theme:k,primary:t.primary,secondary:t.secondary,background:t.background})}><span style={{background:t.primary}}></span><b>{t.label}</b></button>)}</div><div className="custom-colors"><label>اللون الأساسي<input type="color" value={f.primary||'#9a3412'} onChange={e=>setF({...f,primary:e.target.value,theme:'custom'})}/></label><label>اللون الثانوي<input type="color" value={f.secondary||'#f59e0b'} onChange={e=>setF({...f,secondary:e.target.value,theme:'custom'})}/></label><label>لون الخلفية<input type="color" value={f.background||'#fffaf3'} onChange={e=>setF({...f,background:e.target.value,theme:'custom'})}/></label></div><button className="btn primary" onClick={save}>حفظ التغييرات</button></section>}
