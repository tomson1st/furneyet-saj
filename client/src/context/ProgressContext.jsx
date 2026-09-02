import React,{createContext,useContext,useState} from 'react';
import LiquidGlassDefs from '../components/shared/LiquidGlassDefs';
import './ProgressContext.css';

export const ProgressContext=createContext(null);
export function ProgressProvider({children}){const [progress,setProgress]=useState(null);const run=async(label,action)=>{const started=Date.now();setProgress({label});try{return await action()}finally{const wait=Math.max(0,320-(Date.now()-started));setTimeout(()=>setProgress(null),wait)}};return <ProgressContext.Provider value={{run}}><LiquidGlassDefs/>{progress&&<div className="action-progress" role="status" aria-live="polite"><div className="action-progress-bar"></div><div className="action-progress-label"><span className="progress-spinner"></span>{progress.label}</div></div>}{children}</ProgressContext.Provider>}
export function useProgress(){return useContext(ProgressContext);}
