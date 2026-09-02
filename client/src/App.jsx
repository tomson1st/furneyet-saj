import React,{useEffect,useState} from 'react';
import {api} from './lib/utils';
import Home from './components/customer/Home';
import Admin from './components/admin/Admin';
import Login from './components/customer/Login';
export default function App(){const isAdmin=location.pathname.startsWith('/admin');const [logged,setLogged]=useState(null);useEffect(()=>{if(!isAdmin){setLogged(true);return}api('/auth/me').then(()=>setLogged(true)).catch(()=>setLogged(false));},[isAdmin]);useEffect(()=>{if(isAdmin)document.title='لوحة الإدارة | فرنية صاج';},[isAdmin]);if(isAdmin){if(logged===null)return <div className="loader">جاري التحقق من الجلسة…</div>;return logged?<Admin/>:<Login onLogin={()=>setLogged(true)}/>}return <Home/>}
