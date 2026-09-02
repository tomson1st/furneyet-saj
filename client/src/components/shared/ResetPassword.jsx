import React,{useState} from 'react';
import {LockKeyhole,CheckCircle2} from 'lucide-react';
import {api} from '../../lib/utils';
import {useProgress} from '../../context/ProgressContext';

export default function ResetPassword(){
  const {run}=useProgress();
  const params=new URLSearchParams(location.search); const type=params.get('type')==='customer'?'customer':'user'; const token=params.get('token')||'';
  const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[err,setErr]=useState(''),[done,setDone]=useState(false);
  const submit=async e=>{e.preventDefault();setErr('');if(password!==confirm)return setErr('كلمتا المرور غير متطابقتين.');if(password.length<(type==='customer'?8:10))return setErr(type==='customer'?'كلمة المرور يجب أن تكون 8 أحرف على الأقل.':'كلمة المرور يجب أن تكون 10 أحرف على الأقل.');try{await run('جاري تغيير كلمة المرور…',()=>api(type==='customer'?'/customer/reset-password':'/auth/reset-password',{method:'POST',body:JSON.stringify({token,password})}));setDone(true)}catch(e){setErr(e.message)}};
  return <div className="reset-page"><div className="reset-card">{done?<><CheckCircle2 className="reset-success-icon" size={48}/><span className="eyebrow">تم بنجاح</span><h1>تم تغيير كلمة المرور</h1><p>يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.</p><button className="btn primary full" onClick={()=>{location.href=type==='customer'?'/':'/admin'}}>العودة لتسجيل الدخول</button></>:<><div className="reset-icon"><LockKeyhole size={24}/></div><span className="eyebrow">إعادة تعيين كلمة المرور</span><h1>{type==='customer'?'حساب الزبون':'حساب الإدارة'}</h1><p>أدخل كلمة المرور الجديدة. هذا الرابط صالح لمرة واحدة ولمدة محدودة.</p>{!token&&<div className="error">رابط إعادة التعيين غير مكتمل.</div>}<form onSubmit={submit}><input type="password" minLength={type==='customer'?8:10} required placeholder="كلمة المرور الجديدة" value={password} onChange={e=>setPassword(e.target.value)}/><input type="password" minLength={type==='customer'?8:10} required placeholder="تأكيد كلمة المرور" value={confirm} onChange={e=>setConfirm(e.target.value)}/>{err&&<div className="error">{err}</div>}<button className="btn primary full" disabled={!token}>حفظ كلمة المرور</button></form></>}</div></div>;
}
