import React,{useEffect,useState} from 'react';
import {X,Plus,Edit3,Trash2,Image as ImageIcon} from 'lucide-react';
import {api} from '../../lib/utils';
import {useProgress} from '../../context/ProgressContext';

export default function Editor({type,value,categories,onCancel,onSave}){
  const {run}=useProgress();
  const [f,setF]=useState({...value,options:Array.isArray(value.options)?value.options:parseOptions(value.options_json)});
  const [uploading,setUploading]=useState(false);
  const [uploadError,setUploadError]=useState('');
  const [optionsOpen,setOptionsOpen]=useState(false);
  const [optionDraft,setOptionDraft]=useState(null);

  useEffect(()=>setF({...value,options:Array.isArray(value.options)?value.options:parseOptions(value.options_json)}),[value]);
  const set=(k,v)=>setF(x=>({...x,[k]:v}));

  const uploadImage=async e=>{
    const file=e.target.files?.[0]; if(!file)return;
    setUploadError('');
    if(!file.type.startsWith('image/')){setUploadError('يرجى اختيار ملف صورة.');return;}
    if(file.size>4*1024*1024){setUploadError('حجم الصورة يجب ألا يتجاوز 4MB.');return;}
    setUploading(true);
    try{
      const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});
      const result=await run('جاري رفع الصورة…',()=>api('/admin/upload-image',{method:'POST',body:JSON.stringify({dataUrl,fileName:file.name})}));
      set('image',result.url);
    }catch(err){setUploadError(err.message||'تعذر رفع الصورة')}finally{setUploading(false)}
    e.target.value='';
  };

  const saveOption=()=>{
    const name=String(optionDraft?.name||'').trim();
    const price=Number(optionDraft?.price);
    if(!name)return;
    if(!Number.isFinite(price)||price<0)return;
    setF(x=>{
      const next=[...(x.options||[])];
      if(optionDraft.index==null)next.push({name,price});
      else next[optionDraft.index]={name,price};
      return {...x,options:next};
    });
    setOptionDraft(null);
  };
  const deleteOption=index=>setF(x=>({...x,options:(x.options||[]).filter((_,i)=>i!==index)}));

  return <div className="editor">
    <div className="editor-head"><div><b>{value.id?'تعديل':'إضافة'} {type==='item'?'صنف':'عرض'}</b><small>{type==='item'?'بيانات الصنف وخياراته':'بيانات العرض'}</small></div><button type="button" onClick={onCancel}><X/></button></div>

    {type==='item'&&<select value={f.category_id||''} onChange={e=>set('category_id',e.target.value)}><option value="">بدون تصنيف</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}
    <input placeholder={type==='item'?'اسم الصنف':'عنوان العرض'} value={f.name||f.title||''} onChange={e=>set(type==='item'?'name':'title',e.target.value)}/>
    <textarea placeholder="الوصف" value={f.description||''} onChange={e=>set('description',e.target.value)}/>
    {type==='item'&&<input placeholder="مسببات الحساسية" value={f.allergens||''} onChange={e=>set('allergens',e.target.value)}/>}
    <input type="number" placeholder="السعر" value={f.price??''} onChange={e=>set('price',e.target.value)}/>
    <label className="sort-order-field"><span>ترتيب الظهور</span><input type="number" min="0" step="1" placeholder="مثلاً 1" value={f.sort_order??0} onChange={e=>set('sort_order',e.target.value)}/><small>الرقم الأصغر يظهر أولاً.</small></label>

    {type==='item'&&<section className="options-manager">
      <div className="options-manager-head"><div><span className="eyebrow">التخصيص</span><h3>خيارات التخصيص</h3><small>أضف الإضافات التي يمكن للزبون اختيارها عند الطلب.</small></div><button type="button" className="btn ghost" onClick={()=>{setOptionDraft({name:'',price:'',index:null});setOptionsOpen(true)}}><Plus size={17}/> إضافة خيار</button></div>
      {(f.options||[]).length?<div className="options-table-wrap"><table className="options-table"><thead><tr><th>نوع التخصيص</th><th>المبلغ الإضافي</th><th>الإجراءات</th></tr></thead><tbody>{f.options.map((o,i)=><tr key={`${o.name}-${i}`}><td><b>{o.name}</b></td><td>{Number(o.price||0).toLocaleString('ar-LB')}</td><td><button type="button" className="icon-btn" onClick={()=>{setOptionDraft({name:o.name,price:o.price,index:i});setOptionsOpen(true)}}><Edit3 size={16}/></button><button type="button" className="icon-btn danger" onClick={()=>deleteOption(i)}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div>:<div className="options-empty">لا توجد خيارات تخصيص لهذا الصنف.</div>}
    </section>}

    <label className="image-upload-field"><span>صورة {type==='item'?'الصنف':'العرض'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadImage} disabled={uploading}/><small>{uploading?'جاري رفع الصورة…':'اختر صورة من الجهاز (حتى 4MB)'}</small></label>
    <input placeholder="رابط الصورة (اختياري)" value={f.image||''} onChange={e=>set('image',e.target.value)}/>
    {uploadError&&<div className="error">{uploadError}</div>}
    {f.image?<div className="image-preview"><img src={f.image} alt="معاينة" onError={e=>e.currentTarget.style.display='none'}/><span>معاينة الصورة</span></div>:null}
    <div className="checks">{type==='item'?<><label><input type="checkbox" checked={!!f.available} onChange={e=>set('available',e.target.checked)}/> متاح</label><label><input type="checkbox" checked={!!f.featured} onChange={e=>set('featured',e.target.checked)}/> مميز</label></>:<label><input type="checkbox" checked={!!f.active} onChange={e=>set('active',e.target.checked)}/> فعال</label>}</div>
    <div className="editor-actions"><button className="btn primary" disabled={uploading} onClick={()=>onSave(f)}>حفظ</button><button className="btn ghost" onClick={onCancel}>إلغاء</button></div>

    {optionsOpen&&<div className="modal-bg nested-modal-bg"><div className="modal option-dialog"><button className="close" type="button" onClick={()=>setOptionsOpen(false)}><X/></button><span className="eyebrow">خيارات التخصيص</span><h2>{optionDraft?.index==null?'إضافة خيار':'تعديل خيار'}</h2><label><span>نوع التخصيص</span><input autoFocus placeholder="مثلاً: جبنة إضافية" value={optionDraft?.name||''} onChange={e=>setOptionDraft(x=>({...x,name:e.target.value}))}/></label><label><span>المبلغ الإضافي</span><input type="number" min="0" step="1" placeholder="0" value={optionDraft?.price??''} onChange={e=>setOptionDraft(x=>({...x,price:e.target.value}))}/></label><div className="editor-actions"><button type="button" className="btn primary" onClick={saveOption}>حفظ الخيار</button><button type="button" className="btn ghost" onClick={()=>setOptionsOpen(false)}>إلغاء</button></div></div></div>}
  </div>
}
function parseOptions(raw){try{const x=JSON.parse(raw||'[]');return Array.isArray(x)?x.map(o=>({name:String(o.name||''),price:Number(o.price||0)})).filter(o=>o.name):[]}catch{return[]}}
