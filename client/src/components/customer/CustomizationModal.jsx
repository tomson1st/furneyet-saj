import React,{useMemo,useState} from 'react';
import {Check,Plus,X} from 'lucide-react';
import {money} from '../../lib/utils';

export default function CustomizationModal({item,currency,onClose,onConfirm}){
  const options=Array.isArray(item.options)?item.options:[];
  const [selected,setSelected]=useState([]);
  const toggle=name=>setSelected(x=>x.includes(name)?x.filter(n=>n!==name):[...x,name]);
  const extra=useMemo(()=>selected.reduce((s,name)=>s+Number(options.find(o=>o.name===name)?.price||0),0),[selected,options]);
  return <div className="modal-bg customization-overlay"><div className="modal customization-modal">
    <button className="close" type="button" onClick={onClose}><X/></button>
    <span className="eyebrow">تخصيص الطلب</span><h2>{item.name}</h2>
    {item.description&&<p className="customization-description">{item.description}</p>}
    <div className="customization-list">{options.map((o,i)=><label className={`customization-option ${selected.includes(o.name)?'selected':''}`} key={`${o.name}-${i}`}>
      <input type="checkbox" checked={selected.includes(o.name)} onChange={()=>toggle(o.name)}/>
      <span className="custom-check">{selected.includes(o.name)?<Check size={15}/>:null}</span>
      <span className="customization-name">{o.name}</span>
      <strong>{Number(o.price||0)>0?`+ ${money(o.price,currency)}`:'بدون إضافة'}</strong>
    </label>)}</div>
    <div className="customization-total"><span>السعر النهائي</span><b>{money(Number(item.price)+extra,currency)}</b></div>
    <div className="editor-actions"><button type="button" className="btn primary full" onClick={()=>onConfirm(selected)}><Plus size={17}/> إضافة إلى السلة</button><button type="button" className="btn ghost full" onClick={onClose}>إلغاء</button></div>
  </div></div>
}
