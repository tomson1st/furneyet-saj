import React,{useEffect,useState} from 'react';
import {Download,Globe,PhoneCall} from 'lucide-react';
import {api,money} from '../../lib/utils';
import {useProgress} from '../../context/ProgressContext';

const num=n=>Number(n||0).toLocaleString('ar-LB-u-nu-latn');

export default function AnalyticsPanel(){
  const {run}=useProgress();
  const [d,setD]=useState(null);
  useEffect(()=>{run('جاري تحميل الإحصاءات…',()=>api('/admin/analytics')).then(setD).catch(()=>{})},[]);
  if(!d)return <section className="panel"><div className="loader">جاري تحميل الإحصاءات…</div></section>;
  const web=d.summary.web||{orders:0,revenue:0};
  const phone=d.summary.phone||{orders:0,revenue:0};
  return <section className="panel analytics-panel">
    <div className="analytics-cards">
      <div><span>إجمالي الطلبات</span><b>{num(d.summary.orders)}</b></div>
      <div><span>إجمالي الإيرادات</span><b>{money(d.summary.revenue)}</b></div>
      <div><span>الطلبات المسلّمة</span><b>{num(d.summary.delivered)}</b></div>
      <div><span>متوسط الطلب</span><b>{money(d.summary.avg_order)}</b></div>
    </div>
    <div className="analytics-channel-grid">
      <div className="analytics-channel-card"><div className="analytics-channel-icon"><Globe size={20}/></div><div><span>الطلبات عبر الموقع</span><strong>{num(web.orders)}</strong><small>الإيرادات: {money(web.revenue)}</small></div></div>
      <div className="analytics-channel-card"><div className="analytics-channel-icon"><PhoneCall size={20}/></div><div><span>الطلبات عبر الهاتف</span><strong>{num(phone.orders)}</strong><small>الإيرادات: {money(phone.revenue)}</small></div></div>
    </div>
    <h2>الأكثر مبيعاً</h2>
    {d.bestsellers.map(x=><div className="bar-row" key={x.name}><span>{x.name}</span><b>{num(x.quantity)}</b></div>)}
    <a className="btn ghost" href="/api/admin/orders/export.csv"><Download size={16}/> تصدير الطلبات CSV</a>
  </section>
}
