import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.jsx';
import './style.css';
import './dispatcher.css';
import './theme.css';

createRoot(document.getElementById('root')).render(<App />);
