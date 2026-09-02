import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Search,Clock,CheckCircle2,X,Phone,MapPin,ChevronLeft,Edit3,CheckCircle2 as CheckIcon,Printer} from 'lucide-react';
import {api,money,moneyInWords} from '../../lib/utils';
import {useProgress} from '../../context/ProgressContext';
import {openInvoicePrint} from './InvoicePrint';

function PrintDialog({order,onClose,onPrint}){
  const [invoice,setInvoice]=useState(true);
  const [kitchen,setKitchen]=useState(true);
  const [size,setSize]=useState('A4');
  const submit=()=>{
    const modes=[];
    if(invoice) modes.push('invoice');
    if(kitchen) modes.push('kitchen');
    if(!modes.length){ alert('اختر الفاتورة أو طلب المطبخ على الأقل'); return; }
    onPrint(order,size,modes);
  };
  return <div className="modal-bg print-size-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal print-size-modal print-options-modal" role="dialog" aria-modal="true" aria-labelledby="print-options-title">
      <button className="close" onClick={onClose}><X/></button>
      <span className="eyebrow">الطباعة</span>
      <h2 id="print-options-title">خيارات الطباعة</h2>
      <p className="muted">الطلب #{order.id}</p>
      <div className="print-check-options">
        <label className="print-check-card"><input type="checkbox" checked={invoice} onChange={e=>setInvoice(e.target.checked)}/><span><strong>طباعة الفاتورة</strong><small>الفاتورة الكاملة للزبون</small></span></label>
        <label className="print-check-card"><input type="checkbox" checked={kitchen} onChange={e=>setKitchen(e.target.checked)}/><span><strong>طباعة طلب المطبخ</strong><small>طلب مختصر للتحضير</small></span></label>
      </div>
      <div className="print-size-select">
        <label htmlFor="print-size">حجم الطباعة</label>
        <select id="print-size" value={size} onChange={e=>setSize(e.target.value)}>
          <option value="A4">A4 — ورق عادي</option>
          <option value="80mm">80mm — طابعة حرارية</option>
          <option value="58mm">58mm — طابعة حرارية صغيرة</option>
        </select>
      </div>
      <div className="print-dialog-actions">
        <button className="btn primary" onClick={submit}>طباعة المحدد</button>
        <button className="btn ghost" onClick={onClose}>إلغاء</button>
      </div>
    </div>
  </div>;
}

export default function Orders({data,refresh}){
  const {run}=useProgress();
  const statuses={new:'جديد',confirmed:'مؤكد',preparing:'قيد التحضير',ready:'جاهز',delivered:'تم التسليم',cancelled:'ملغى'};
  const [statusFilter,setStatusFilter]=useState('all');
  const [dateFilter,setDateFilter]=useState('all');
  const [specificDate,setSpecificDate]=useState('');
  const [history,setHistory]=useState(null);
  const [printOrder,setPrintOrder]=useState(null);
  const historyPanelRef=useRef(null);

  useEffect(()=>{
    if(!history)return;
    const timer=setTimeout(()=>{
      historyPanelRef.current?.scrollIntoView({behavior:'smooth',block:'start'});
    },60);
    return ()=>clearTimeout(timer);
  },[history]);

  const getOrderDate=order=>{
    const raw=String(order.created_at||'');
    const value=raw.endsWith('Z')||/[+-]\d\d:\d\d$/.test(raw)?raw:`${raw}Z`;
    const d=new Date(value);
    return Number.isNaN(d.getTime())?null:d;
  };
  const dateKey=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Beirut',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  const todayKey=dateKey(new Date());
  const getBeirutParts=d=>{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Beirut',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(d);
    return Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
  };
  const matchesDate=order=>{
    if(dateFilter==='all')return true;
    const d=getOrderDate(order); if(!d)return false;
    const key=dateKey(d);
    if(dateFilter==='today')return key===todayKey;
    const today=new Date();
    const tp=getBeirutParts(today);
    const op=getBeirutParts(d);
    if(dateFilter==='yesterday'){
      const y=new Date(today.getTime()-24*60*60*1000);
      return key===dateKey(y);
    }
    if(dateFilter==='month')return op.year===tp.year&&op.month===tp.month;
    if(dateFilter==='week'){
      const todayDate=new Date(Date.UTC(tp.year,tp.month-1,tp.day));
      const mondayOffset=(todayDate.getUTCDay()+6)%7;
      const start=new Date(todayDate); start.setUTCDate(todayDate.getUTCDate()-mondayOffset);
      const end=new Date(start); end.setUTCDate(start.getUTCDate()+7);
      const orderDate=new Date(Date.UTC(op.year,op.month-1,op.day));
      return orderDate>=start&&orderDate<end;
    }
    if(dateFilter==='specific')return !!specificDate&&key===specificDate;
    return true;
  };
  const filteredOrders=useMemo(()=>data.orders.filter(o=>(statusFilter==='all'||o.status===statusFilter)&&matchesDate(o)),[data.orders,statusFilter,dateFilter,specificDate]);
  const resetFilters=()=>{setStatusFilter('all');setDateFilter('all');setSpecificDate('');};
  const statusChanged=async(id,status)=>{
    try{
      await run('جاري تحديث حالة الطلب…',()=>api('/admin/orders/'+id,{method:'PUT',body:JSON.stringify({status})}));
      await refresh();
    }catch(err){alert(err.message||'تعذر تحديث الحالة');}
  };
  const printOrderNow=async (order,size,modes)=>{
    try{
      const selected = Array.isArray(modes) ? modes : [modes];
      if(!selected.length) return;
      const windows=selected.map(()=>window.open('', '_blank', 'width=900,height=1000'));
      if(windows.some(w=>!w)){ windows.filter(Boolean).forEach(w=>w.close()); throw new Error('تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة للموقع.'); }
      for(let i=0;i<selected.length;i++) await openInvoicePrint(order.id,size,selected[i],windows[i]);
      setPrintOrder(null);
    }catch(err){ alert(err.message||'تعذر فتح الطباعة'); }
  };
  const openHistory=async order=>{
    try{
      const result=await run('جاري تحميل سجل الطلب…',()=>api('/admin/orders/'+order.id+'/history'));
      setHistory({order,history:result.history||[]});
    }catch(err){alert(err.message||'تعذر تحميل سجل الطلب');}
  };
  return <section className="panel">
    <div className="orders-filters">
      <div className="filter-field"><label>الحالة</label><select value={statusFilter} onChange={e=>run('جاري تطبيق فلتر الحالة…',async()=>{setStatusFilter(e.target.value)})}><option value="all">كل الحالات</option>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
      <div className="filter-field"><label>التاريخ</label><select value={dateFilter} onChange={e=>run('جاري تطبيق فلتر التاريخ…',async()=>{setDateFilter(e.target.value);if(e.target.value!=='specific')setSpecificDate('')})}><option value="all">كل التواريخ</option><option value="today">اليوم</option><option value="yesterday">البارحة</option><option value="week">الأسبوع الحالي</option><option value="month">الشهر الحالي</option><option value="specific">تاريخ محدد</option></select></div>
      {dateFilter==='specific'&&<div className="filter-field"><label>اختر التاريخ</label><input type="date" value={specificDate} onChange={e=>run('جاري تطبيق التاريخ…',async()=>{setSpecificDate(e.target.value)})}/></div>}
      <div className="orders-filter-summary"><b>{filteredOrders.length}</b><span>طلب</span></div>
      {(statusFilter!=='all'||dateFilter!=='all')&&<button className="btn ghost filter-reset" onClick={()=>run('جاري إعادة ضبط الفلاتر…',async()=>resetFilters())}>إعادة ضبط</button>}
    </div>
    <div className="status-legend">{Object.entries(statuses).map(([k,v])=><span key={k} className={`legend-item status-${k}`}><i></i>{v}</span>)}</div>
    <div className="table-wrap"><table><thead><tr><th>الطلب</th><th>الزبون</th><th>الأصناف</th><th>المجموع</th><th>الحالة</th><th>السجل</th><th>WhatsApp</th><th>طباعة</th></tr></thead><tbody>
      {filteredOrders.length===0?<tr><td colSpan="8" className="empty-orders">لا توجد طلبات مطابقة للفلاتر المحددة.</td></tr>:filteredOrders.map(o=><tr key={o.id} className={`order-row status-row-${o.status||'new'}`}>
        <td><b>#{o.id}</b><small>{getOrderDate(o)?getOrderDate(o).toLocaleString('ar-LB-u-nu-latn',{timeZone:'Asia/Beirut'}):'—'}</small></td>
        <td><b>{o.customer_name}</b><small>{o.customer_phone}</small><small>{o.address}</small></td>
        <td>{o.items.map(i=><div key={i.itemId}>{i.name} × {i.quantity}</div>)}{o.notes&&<small>ملاحظة: {o.notes}</small>}</td>
        <td><div className="order-total-values"><b>{money(o.total,data.settings.currency)}</b><small>{moneyInWords(o.total,data.settings.currency)}</small></div></td>
        <td><select className={`status-select status-${o.status||'new'}`} value={o.status||'new'} onChange={e=>statusChanged(o.id,e.target.value)}>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></td>
        <td><button className="icon-btn history-btn" title="سجل تغييرات الطلب" onClick={()=>openHistory(o)}><Clock size={16}/></button></td>
        <td>{o.whatsapp_sent?'✓ أُرسلت':'—'}</td><td><button className="icon-btn invoice-btn" title="خيارات الطباعة" aria-label="خيارات الطباعة" onClick={()=>setPrintOrder(o)}><Printer size={16}/></button></td>
      </tr>)}
    </tbody></table></div>
    {printOrder&&<PrintDialog order={printOrder} onClose={()=>setPrintOrder(null)} onPrint={printOrderNow}/>}

    {history&&<div ref={historyPanelRef} id="order-history-panel" className="order-history-panel">
      <div className="order-history-head"><div><span className="eyebrow">سجل الطلب</span><h3>الطلب #{history.order.id}</h3></div><button className="icon-btn" onClick={()=>setHistory(null)} title="إغلاق"><X size={17}/></button></div>
      {history.history.length===0?<p className="muted">لا يوجد سجل تغييرات لهذا الطلب حتى الآن.</p>:<div className="order-history-list">{history.history.map(h=><div className="order-history-entry" key={h.id}><div className={`history-status-dot status-${h.new_status}`}></div><div><b>{statuses[h.old_status]||h.old_status} → {statuses[h.new_status]||h.new_status}</b><small>{h.changed_by_name||'الإدارة'} · {new Date(h.changed_at).toLocaleString('ar-LB-u-nu-latn',{timeZone:'Asia/Beirut'})}</small></div></div>)}</div>}
    </div>}
  </section>;
}
