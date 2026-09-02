import React from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import {ProgressProvider} from './context/ProgressContext';
import App from './App';

createRoot(document.getElementById('root')).render(<ProgressProvider><App/></ProgressProvider>);
