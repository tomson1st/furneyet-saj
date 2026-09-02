import React,{useEffect,useState} from 'react';
import {X,Image as ImageIcon} from 'lucide-react';
import {api} from '../../lib/utils';
import {useProgress} from '../../context/ProgressContext';
export default function Editor({type,value,categories,onCancel,onSave}){
  const {run}=useProgress();
  const [f,setF]=useState(value);
  const [uploading,setUploading]=useState(false);
  const [uploadError,setUploadError]=useState('');
  const set=(k,v)=>setF({...f,[k]:v});
  const uploadImage=async e=>{
    const file=e.target.files?.[0];
    if(!file)return;
    setUploadError('');
    if(!file.type.startsWith('image/')){setUploadError('يرجى اختيار ملف صورة.');return;}
    if(file.size>4*1024*1024){setUploadError('حجم الصورة يجب ألا يتجاوز 4MB.');return;}
    setUploading(true);
    try{
      const dataUrl=await new Promise((resolve,reject)=>{
        const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(file);
      });
      const result=await run('جاري رفع الصورة…',()=>api('/admin/upload-image',{method:'POST',body:JSON.stringify({dataUrl,fileName:file.name})}));
      set('image',result.url);
    }catch(err){setUploadError(err.message||'تعذر رفع الصورة');}
    finally{setUploading(false);}
    e.target.value='';
  };
  return <div className="editor"><div className="editor-head"><b>{value.id?'تعديل':'إضافة'} {type==='item'?'صنف':'عرض'}</b><button onClick={onCancel}><X/></button></div>
    {type==='item'&&<select value={f.category_id||''} onChange={e=>set('category_id',e.target.value)}><option value="">بدون تصنيف</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}
    <input placeholder={type==='item'?'اسم الصنف':'عنوان العرض'} value={f.name||f.title||''} onChange={e=>set(type==='item'?'name':'title',e.target.value)}/>
    <textarea placeholder="الوصف" value={f.description||''} onChange={e=>set('description',e.target.value)}/>{type==='item'&&<><input placeholder="مسببات الحساسية" value={f.allergens||''} onChange={e=>set('allergens',e.target.value)}/><textarea placeholder='خيارات التخصيص JSON: [{"name":"جبنة إضافية","price":50000}]' value={f.options_json||'[]'} onChange={e=>set('options_json',e.target.value)}/></>}
    <input type="number" placeholder="السعر" value={f.price??''} onChange={e=>set('price',e.target.value)}/><label className="sort-order-field"><span>ترتيب الظهور</span><input type="number" min="0" step="1" placeholder="مثلاً 1" value={f.sort_order??0} onChange={e=>set('sort_order',e.target.value)}/><small>الرقم الأصغر يظهر أولاً.</small></label>
    <label className="image-upload-field"><span>صورة {type==='item'?'الصنف':'العرض'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadImage} disabled={uploading}/><small>{uploading?'جاري رفع الصورة…':'اختر صورة من الجهاز (حتى 4MB)'}</small></label>
    <input placeholder="رابط الصورة (اختياري)" value={f.image||''} onChange={e=>set('image',e.target.value)}/>
    {uploadError&&<div className="error">{uploadError}</div>}
    {f.image?<div className="image-preview"><img src={f.image} alt="معاينة" onError={e=>e.currentTarget.style.display='none'}/><span>معاينة الصورة</span></div>:null}
    <div className="checks">{type==='item'?<><label><input type="checkbox" checked={!!f.available} onChange={e=>set('available',e.target.checked)}/> متاح</label><label><input type="checkbox" checked={!!f.featured} onChange={e=>set('featured',e.target.checked)}/> مميز</label></>:<label><input type="checkbox" checked={!!f.active} onChange={e=>set('active',e.target.checked)}/> فعال</label>}</div>
    <div className="editor-actions"><button className="btn primary" disabled={uploading} onClick={()=>onSave(f)}>حفظ</button><button className="btn ghost" onClick={onCancel}>إلغاء</button></div>
  </div>
}
