import React,{useState} from 'react';
import {Gift,Plus,Edit3,X,Trash2,MapPinned} from 'lucide-react';
import {api,money} from '../../lib/utils';
import {useProgress} from '../../context/ProgressContext';
export default function MarketingPanel({data,refresh}){
  const {run}=useProgress();
  const emptyCoupon={code:'',type:'fixed',value:'',min_order:'',max_uses:'',active:true,starts_at:'',ends_at:''};
  const emptyZone={name:'',fee:'',min_order:'',active:true,sort_order:0};
  const [coupon,setCoupon]=useState(emptyCoupon);
  const [zone,setZone]=useState(emptyZone);
  const [editingCoupon,setEditingCoupon]=useState(null);
  const [editingZone,setEditingZone]=useState(null);
  const [error,setError]=useState('');
  const [loyalty,setLoyalty]=useState({loyaltyEnabled:data.settings?.loyaltyEnabled??'true',loyaltyEarnAmount:data.settings?.loyaltyEarnAmount??10000,loyaltyPointValue:data.settings?.loyaltyPointValue??1000,loyaltyMinRedeem:data.settings?.loyaltyMinRedeem??10,loyaltyMaxRedeemPercent:data.settings?.loyaltyMaxRedeemPercent??50});
  const formatDate=v=>v?new Date(v).toLocaleDateString('ar-LB',{year:'numeric',month:'short',day:'numeric'}):'—';
  // datetime-local values are browser-local times without a timezone. Convert them
  // to UTC before sending them to PostgreSQL TIMESTAMPTZ on the server.
  const toUtcIso=v=>{if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString()};
  // Convert a stored UTC timestamp back to the browser's local datetime-local value.
  const toLocalDateTime=v=>{if(!v)return '';const d=new Date(v);if(Number.isNaN(d.getTime()))return '';const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`};
  const resetCoupon=()=>{setCoupon(emptyCoupon);setEditingCoupon(null)};
  const resetZone=()=>{setZone(emptyZone);setEditingZone(null)};
  const saveCoupon=async()=>{
    setError('');
    try{
      const editing=Boolean(editingCoupon);
      await run(editing?'جاري حفظ تعديل الكوبون…':'جاري إضافة الكوبون…',()=>api(editing?`/admin/coupons/${editingCoupon.id}`:'/admin/coupons',{method:editing?'PUT':'POST',body:JSON.stringify({...coupon,max_uses:coupon.max_uses===''?null:coupon.max_uses,starts_at:toUtcIso(coupon.starts_at),ends_at:toUtcIso(coupon.ends_at)})}));
      resetCoupon();
      await refresh();
    }catch(e){setError(e.message)}
  };
  const saveZone=async()=>{
    setError('');
    try{
      const editing=Boolean(editingZone);
      await run(editing?'جاري حفظ تعديل المنطقة…':'جاري إضافة منطقة التوصيل…',()=>api(editing?`/admin/zones/${editingZone.id}`:'/admin/zones',{method:editing?'PUT':'POST',body:JSON.stringify(zone)}));
      resetZone();
      await refresh();
    }catch(e){setError(e.message)}
  };
  const startZoneEdit=z=>{setEditingZone(z);setZone({name:z.name||'',fee:String(z.fee??''),min_order:String(z.min_order??''),active:z.active!==false,sort_order:Number(z.sort_order||0)})};

  const saveLoyalty=async()=>{
    setError('');
    try{
      const settings={...data.settings,...loyalty};
      await run('جاري حفظ إعدادات برنامج الولاء…',()=>api('/admin/settings',{method:'PUT',body:JSON.stringify(settings)}));
      await refresh();
    }catch(e){setError(e.message)}
  };
  const deleteCoupon=async c=>{if(!confirm(`حذف كود الخصم «${c.code}»؟`))return;setError('');try{await run('جاري حذف كود الخصم…',()=>api(`/admin/coupons/${c.id}`,{method:'DELETE'}));if(editingCoupon?.id===c.id)resetCoupon();await refresh()}catch(e){setError(e.message)}};
  const deleteZone=async z=>{if(!confirm(`حذف منطقة التوصيل «${z.name}»؟`))return;setError('');try{await run('جاري حذف منطقة التوصيل…',()=>api(`/admin/zones/${z.id}`,{method:'DELETE'}));if(editingZone?.id===z.id)resetZone();await refresh()}catch(e){setError(e.message)}};
  return <section className="panel marketing-panel">
    {error&&<div className="user-form-error">{error}</div>}
    <div className="marketing-section loyalty-marketing-section">
      <div className="marketing-section-head"><div><span className="eyebrow">التسويق</span><h2><Gift size={18}/> برنامج الولاء</h2></div><span className={`status-pill ${String(loyalty.loyaltyEnabled)!=='false'?'active':'inactive'}`}>{String(loyalty.loyaltyEnabled)!=='false'?'فعال':'متوقف'}</span></div>
      <p className="marketing-section-description">حدد طريقة كسب النقاط وقيمتها وقواعد استخدامها عند إتمام الطلبات.</p>
      <div className="loyalty-admin-grid marketing-loyalty-grid">
        <label><span>حالة البرنامج</span><select value={String(loyalty.loyaltyEnabled)} onChange={e=>setLoyalty({...loyalty,loyaltyEnabled:e.target.value})}><option value="true">فعال</option><option value="false">متوقف</option></select></label>
        <label><span>كل مبلغ (ل.ل) يمنح نقطة</span><input type="number" min="1" step="1" value={loyalty.loyaltyEarnAmount} onChange={e=>setLoyalty({...loyalty,loyaltyEarnAmount:e.target.value})}/></label>
        <label><span>قيمة النقطة ({data.settings?.currency||'ل.ل'})</span><input type="number" min="1" step="1" value={loyalty.loyaltyPointValue} onChange={e=>setLoyalty({...loyalty,loyaltyPointValue:e.target.value})}/></label>
        <label><span>الحد الأدنى للاستبدال</span><input type="number" min="0" step="1" value={loyalty.loyaltyMinRedeem} onChange={e=>setLoyalty({...loyalty,loyaltyMinRedeem:e.target.value})}/></label>
        <label><span>أقصى نسبة من قيمة المنتجات</span><input type="number" min="0" max="100" step="1" value={loyalty.loyaltyMaxRedeemPercent} onChange={e=>setLoyalty({...loyalty,loyaltyMaxRedeemPercent:e.target.value})}/></label>
      </div>
      <div className="loyalty-rules-summary"><div><b>الكسب</b><span>نقطة لكل {Number(loyalty.loyaltyEarnAmount||0).toLocaleString('ar-LB')} ل.ل</span></div><div><b>القيمة</b><span>كل نقطة = {Number(loyalty.loyaltyPointValue||0).toLocaleString('ar-LB')} {data.settings?.currency||'ل.ل'}</span></div><div><b>الاستخدام</b><span>حتى {Number(loyalty.loyaltyMaxRedeemPercent||0)}% من قيمة المنتجات</span></div></div>
      <p className="settings-help">تُمنح النقاط بعد تسليم الطلب، ويمكن للزبون استخدامها وفق الحدود المحددة أعلاه.</p>
      <button type="button" className="btn primary" onClick={saveLoyalty}>حفظ إعدادات برنامج الولاء</button>
    </div>
    <div className="phase2-grid">
      <div className="marketing-section">
        <div className="marketing-section-head"><div><span className="eyebrow">التسويق</span><h2><Gift size={18}/> كوبونات الخصم</h2></div>{editingCoupon&&<button type="button" className="btn ghost compact-action" onClick={resetCoupon}><X size={15}/> إلغاء التعديل</button>}</div>
        <div className="marketing-form-grid coupon-form-grid">
          <input placeholder="كود الخصم" value={coupon.code} onChange={e=>setCoupon({...coupon,code:e.target.value.toUpperCase()})}/>
          <select value={coupon.type} onChange={e=>setCoupon({...coupon,type:e.target.value})}><option value="fixed">مبلغ ثابت</option><option value="percent">نسبة %</option></select>
          <input type="number" min="0" placeholder="القيمة" value={coupon.value} onChange={e=>setCoupon({...coupon,value:e.target.value})}/>
          <input type="number" min="0" placeholder="الحد الأدنى للطلب" value={coupon.min_order} onChange={e=>setCoupon({...coupon,min_order:e.target.value})}/>
          <input type="number" min="0" placeholder="أقصى عدد استخدامات" value={coupon.max_uses} onChange={e=>setCoupon({...coupon,max_uses:e.target.value})}/>
          <label className="marketing-check"><input type="checkbox" checked={coupon.active} onChange={e=>setCoupon({...coupon,active:e.target.checked})}/><span>الكود فعال</span></label>
          <label><span>يبدأ في</span><input type="datetime-local" value={coupon.starts_at||''} onChange={e=>setCoupon({...coupon,starts_at:e.target.value})}/></label>
          <label><span>ينتهي في</span><input type="datetime-local" value={coupon.ends_at||''} onChange={e=>setCoupon({...coupon,ends_at:e.target.value})}/></label>
        </div>
        <div className="marketing-form-actions"><button type="button" className="btn primary" onClick={saveCoupon} disabled={!coupon.code.trim()}>{editingCoupon?<Edit3 size={16}/>:<Plus size={16}/>} {editingCoupon?'حفظ التعديل':'إضافة الكود'}</button>{editingCoupon&&<button type="button" className="btn ghost" onClick={resetCoupon}>كود جديد</button>}</div>
        <div className="modern-table-wrap"><table className="modern-admin-table"><thead><tr><th>الكود</th><th>الخصم</th><th>الحد الأدنى</th><th>الاستخدام</th><th>الصلاحية</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{(data.coupons||[]).length===0?<tr><td colSpan="7" className="table-empty">لا توجد أكواد خصم حتى الآن.</td></tr>:(data.coupons||[]).map(c=><tr key={c.id}>
          <td><strong className="code-badge">{c.code}</strong></td>
          <td><b>{c.type==='percent'?`${Number(c.value||0).toLocaleString('ar-LB')}%`:money(c.value,data.settings.currency)}</b></td>
          <td>{money(c.min_order,data.settings.currency)}</td>
          <td>{Number(c.used_count||0).toLocaleString('ar-LB')} / {c.max_uses==null?'∞':Number(c.max_uses).toLocaleString('ar-LB')}</td>
          <td><small>{c.starts_at?formatDate(c.starts_at):'من الآن'}<br/>{c.ends_at?`حتى ${formatDate(c.ends_at)}`:'بدون انتهاء'}</small></td>
          <td><span className={`status-pill ${c.active?'active':'inactive'}`}>{c.active?'فعال':'متوقف'}</span></td>
          <td><div className="table-actions"><button type="button" className="icon-btn" title="تعديل" aria-label={`تعديل ${c.code}`} onClick={()=>{setEditingCoupon(c);setCoupon({code:c.code||'',type:c.type||'fixed',value:String(c.value??''),min_order:String(c.min_order??''),max_uses:c.max_uses==null?'':String(c.max_uses),active:c.active!==false,starts_at:toLocalDateTime(c.starts_at),ends_at:toLocalDateTime(c.ends_at)})}}><Edit3 size={16}/></button><button type="button" className="icon-btn danger" title="حذف" aria-label={`حذف ${c.code}`} onClick={()=>deleteCoupon(c)}><Trash2 size={16}/></button></div></td>
        </tr>)}</tbody></table></div>
      </div>
      <div className="marketing-section">
        <div className="marketing-section-head"><div><span className="eyebrow">التوصيل</span><h2><MapPinned size={18}/> مناطق التوصيل</h2></div>{editingZone&&<button type="button" className="btn ghost compact-action" onClick={resetZone}><X size={15}/> إلغاء التعديل</button>}</div>
        <div className="marketing-form-grid zone-form-grid">
          <input placeholder="اسم المنطقة" value={zone.name} onChange={e=>setZone({...zone,name:e.target.value})}/>
          <input type="number" min="0" placeholder="رسم التوصيل" value={zone.fee} onChange={e=>setZone({...zone,fee:e.target.value})}/>
          <input type="number" min="0" placeholder="الحد الأدنى للطلب" value={zone.min_order} onChange={e=>setZone({...zone,min_order:e.target.value})}/>
          <input type="number" placeholder="ترتيب الظهور" value={zone.sort_order} onChange={e=>setZone({...zone,sort_order:e.target.value})}/>
          <label className="marketing-check"><input type="checkbox" checked={zone.active} onChange={e=>setZone({...zone,active:e.target.checked})}/><span>المنطقة فعالة</span></label>
        </div>
        <div className="marketing-form-actions"><button type="button" className="btn primary" onClick={saveZone} disabled={!zone.name.trim()}>{editingZone?<Edit3 size={16}/>:<Plus size={16}/>} {editingZone?'حفظ التعديل':'إضافة المنطقة'}</button>{editingZone&&<button type="button" className="btn ghost" onClick={resetZone}>منطقة جديدة</button>}</div>
        <div className="modern-table-wrap"><table className="modern-admin-table"><thead><tr><th>المنطقة</th><th>رسم التوصيل</th><th>الحد الأدنى</th><th>الترتيب</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{(data.zones||[]).length===0?<tr><td colSpan="6" className="table-empty">لا توجد مناطق توصيل حتى الآن.</td></tr>:(data.zones||[]).map(z=><tr key={z.id}>
          <td><strong>{z.name}</strong></td><td>{money(z.fee,data.settings.currency)}</td><td>{money(z.min_order,data.settings.currency)}</td><td>{Number(z.sort_order||0).toLocaleString('ar-LB')}</td><td><span className={`status-pill ${z.active?'active':'inactive'}`}>{z.active?'فعالة':'متوقفة'}</span></td><td><div className="table-actions"><button type="button" className="icon-btn" title="تعديل" aria-label={`تعديل ${z.name}`} onClick={()=>startZoneEdit(z)}><Edit3 size={16}/></button><button type="button" className="icon-btn danger" title="حذف" aria-label={`حذف ${z.name}`} onClick={()=>deleteZone(z)}><Trash2 size={16}/></button></div></td>
        </tr>)}</tbody></table></div>
      </div>
    </div>
  </section>
}
