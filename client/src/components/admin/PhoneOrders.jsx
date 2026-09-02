import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Phone,Search,Plus,Minus,Trash2,UserRound,MapPin,ShoppingBag,RotateCcw,CheckCircle2} from 'lucide-react';
import {api,money,moneyInWords} from '../../lib/utils';
import {useProgress} from '../../context/ProgressContext';

export default function PhoneOrders({data}){
  const {run}=useProgress();
  const [phone,setPhone]=useState(''); const [customer,setCustomer]=useState(null); const [customerLoading,setCustomerLoading]=useState(false);
  const [form,setForm]=useState({name:'',address:'',notes:'',zoneId:''}); const [search,setSearch]=useState(''); const [category,setCategory]=useState('all');
  const [cart,setCart]=useState([]); const [success,setSuccess]=useState(null); const timer=useRef(null);
  const zones=(data.zones||[]).filter(z=>z.active!==false); const currency=data.settings.currency;
  const categories=data.categories||[]; const items=data.items||[]; const offers=data.offers||[];
  const products=useMemo(()=>{
    const seenIds=new Set();
    const seenNames=new Set();
    return [...items.map(x=>({...x,kind:'item'})),...offers.map(x=>({...x,name:x.title,kind:'offer'}))].filter(x=>{
      const idKey=`${x.kind}:${String(x.id)}`;
      const nameKey=`${x.kind}:${String(x.name||'').trim().toLocaleLowerCase('ar')}`;
      if(seenIds.has(idKey)) return false;
      // Protect the phone-order search/list from duplicated API rows as well as duplicate IDs.
      if(seenNames.has(nameKey)) return false;
      seenIds.add(idKey);
      if(nameKey.endsWith(':')) return true;
      seenNames.add(nameKey);
      return true;
    });
  },[items,offers]);
  const filtered=useMemo(()=>{
    const term=search.trim().toLocaleLowerCase('ar');
    const seen=new Set();
    return products.filter(x=>{
      if(category!=='all'&&x.kind!=='offer'&&String(x.category_id)!==String(category)) return false;
      if(term&&!`${x.name} ${x.description||''}`.toLocaleLowerCase('ar').includes(term)) return false;
      const key=`${x.kind}:${Number(x.id)}`;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },[products,category,search]);
  const subtotal=cart.reduce((sum,x)=>sum+Number(x.price)*x.quantity,0); const zone=zones.find(z=>String(z.id)===String(form.zoneId)); const delivery=zone?Number(zone.fee):0; const total=subtotal+delivery;
  useEffect(()=>()=>timer.current&&clearTimeout(timer.current),[]);
  const lookup=async()=>{const v=phone.trim();if(v.replace(/\D/g,'').length<6){setCustomer(null);return}setCustomerLoading(true);try{const r=await api('/admin/phone-orders/customer?phone='+encodeURIComponent(v));setCustomer(r.customer||null);if(r.customer){const def=r.customer.addresses?.find(a=>a.is_default)||r.customer.addresses?.[0];setForm(f=>({...f,name:r.customer.name||f.name,address:def?.address||f.address}))}}catch(e){setCustomer(null)}finally{setCustomerLoading(false)}};
  const add=(item)=>setCart(c=>{const key=item.kind==='offer'?`offer-${item.id}`:Number(item.id);const i=c.findIndex(x=>x.itemId===key);if(i>=0)return c.map((x,n)=>n===i?{...x,quantity:x.quantity+1}:x);return [...c,{itemId:key,offerId:item.kind==='offer'?Number(item.id):undefined,name:item.name,price:Number(item.price),quantity:1,type:item.kind,options:[]} ]});
  const change=(idx,d)=>setCart(c=>c.map((x,i)=>i===idx?{...x,quantity:Math.max(1,x.quantity+d)}:x));
  const remove=(idx)=>setCart(c=>c.filter((_,i)=>i!==idx));
  const reset=()=>{setPhone('');setCustomer(null);setForm({name:'',address:'',notes:'',zoneId:''});setCart([]);setSuccess(null);setSearch('');setCategory('all')};
  const submit=async()=>{if(!form.name.trim()||phone.trim().length<6||!cart.length)return alert('أدخل اسم الزبون ورقم الهاتف وأضف صنفاً واحداً على الأقل.');try{const r=await run('جاري تسجيل طلب الهاتف…',()=>api('/admin/phone-orders',{method:'POST',body:JSON.stringify({customerName:form.name,customerPhone:phone,address:form.address,notes:form.notes,zoneId:form.zoneId||null,items:cart.map(x=>x.type==='offer'?({offerId:x.offerId,quantity:x.quantity}):({itemId:x.itemId,quantity:x.quantity,options:x.options}))})}));setSuccess(r);setCart([]);setForm(f=>({...f,notes:''}));}catch(e){alert(e.message||'تعذر تسجيل الطلب')}};
  return <section className="phone-orders-page">
    {success&&<div className="phone-success"><CheckCircle2 size={24}/><div><b>تم تسجيل الطلب #{success.id} بنجاح</b><span>{money(success.total,currency)} · {success.zoneName}</span></div><button className="btn ghost" onClick={()=>setSuccess(null)}>طلب جديد</button></div>}
    <div className="phone-order-grid">
      <div className="phone-order-main panel">
        <div className="phone-page-head"><div><span className="eyebrow">موظف استقبال الطلبات</span><h2><Phone size={22}/> طلب جديد عبر الهاتف</h2></div><button className="btn ghost" onClick={reset}><RotateCcw size={17}/> تفريغ الطلب</button></div>
        <div className="phone-customer-card"><div className="phone-section-title"><UserRound size={18}/><b>بيانات الزبون</b></div><div className="phone-fields"><label>رقم الهاتف<input autoFocus value={phone} onChange={e=>setPhone(e.target.value)} onBlur={lookup} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();lookup()}}} placeholder="مثال: 03 123 456" inputMode="tel"/><small>{customerLoading?'جاري البحث…':customer?'تم العثور على حساب الزبون':'أدخل الرقم ثم اضغط Enter للبحث'}</small></label><label>اسم الزبون<input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="اسم الزبون"/></label></div>{customer&&<div className="phone-found"><UserRound size={16}/><span>{customer.name}</span><small>{customer.email||'زبون مسجل'} · {customer.addresses?.length||0} عنوان محفوظ</small></div>}</div>
        <div className="phone-customer-card"><div className="phone-section-title"><MapPin size={18}/><b>التوصيل</b></div><div className="phone-fields"><label>منطقة التوصيل<select value={form.zoneId} onChange={e=>setForm(f=>({...f,zoneId:e.target.value}))}><option value="">استلام من الفرنية</option>{zones.map(z=><option key={z.id} value={z.id}>{z.name} — {money(z.fee,currency)}{Number(z.min_order)>0?` · حد أدنى ${money(z.min_order,currency)}`:''}</option>)}</select></label><label>العنوان<input value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} placeholder={zone?'عنوان التوصيل':'العنوان (اختياري)'}/></label></div>{customer?.addresses?.length>0&&<div className="saved-addresses">{customer.addresses.map(a=><button key={a.id} type="button" className="saved-address" onClick={()=>setForm(f=>({...f,address:a.address}))}><MapPin size={14}/>{a.label}: {a.address}</button>)}</div>}</div>
        <div className="phone-menu-card"><div className="phone-section-title"><ShoppingBag size={18}/><b>اختيار الأصناف</b></div><div className="phone-menu-tools"><div className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث عن صنف…"/></div><div className="phone-categories"><button className={category==='all'?'on':''} onClick={()=>setCategory('all')}>الكل</button>{categories.map(c=><button key={c.id} className={String(category)===String(c.id)?'on':''} onClick={()=>setCategory(c.id)}>{c.name}</button>)}</div></div><div className="phone-item-grid">{filtered.map(item=><button className="phone-item" key={`${item.kind}-${item.id}`} onClick={()=>add(item)}><div><b>{item.name}{item.kind==='offer'&&<em className="phone-offer-tag">عرض</em>}</b><small>{item.description||' '}</small></div><strong>{money(item.price,currency)}</strong><Plus size={18}/></button>)}{filtered.length===0&&<div className="empty-orders">لا توجد أصناف مطابقة.</div>}</div></div>
      </div>
      <aside className="phone-cart panel"><div className="phone-cart-head"><div><span className="eyebrow">ملخص الطلب</span><h2>السلة</h2></div><span className="phone-cart-count">{cart.reduce((s,x)=>s+x.quantity,0)}</span></div><div className="phone-cart-list">{cart.length===0?<div className="phone-empty-cart"><ShoppingBag size={30}/><span>ابدأ بإضافة الأصناف من القائمة</span></div>:cart.map((x,i)=><div className="phone-cart-row" key={`${x.itemId}-${i}`}><div><b>{x.name}</b><small>{money(x.price,currency)} × {x.quantity}</small></div><div className="qty"><button onClick={()=>change(i,-1)}><Minus size={14}/></button><b>{x.quantity}</b><button onClick={()=>change(i,1)}><Plus size={14}/></button><button className="danger" onClick={()=>remove(i)}><Trash2 size={15}/></button></div></div>)}</div><div className="phone-total"><div><span>المجموع الفرعي</span><b>{money(subtotal,currency)}</b></div><div><span>التوصيل</span><b>{money(delivery,currency)}</b></div><div className="grand"><span>الإجمالي</span><div><b>{money(total,currency)}</b><small>{moneyInWords(total,currency)}</small></div></div></div><label className="phone-notes">ملاحظات الطلب<textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="ملاحظات الزبون…" rows="3"/></label><button className="phone-submit" disabled={!cart.length} onClick={submit}><Phone size={19}/> تسجيل الطلب <span>{money(total,currency)}</span></button></aside>
    </div>
  </section>
}
