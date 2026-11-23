
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

registerSW({
  immediate: true,
  onRegisterError(error) {
    console.error('RJ Thrift Hub offline support could not be enabled.', error);
  }
});
