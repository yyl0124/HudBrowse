import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

document.addEventListener('contextmenu', event => {
  if (document.documentElement.classList.contains('native-desktop')) event.preventDefault();
}, true);

const startTime = performance.now();
console.log(`🎬 [${startTime.toFixed(2)}ms] 前端入口文件开始执行`);
console.log('🌐 当前环境:', import.meta.env.MODE);

const rootElement = document.getElementById('root');
console.log(`📍 [${(performance.now() - startTime).toFixed(2)}ms] 找到 Root 元素`);

if (rootElement) {
  console.log(`⚛️ [${(performance.now() - startTime).toFixed(2)}ms] 开始渲染 React 应用`);
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log(`✅ [${(performance.now() - startTime).toFixed(2)}ms] React 应用已挂载到 DOM`);
} else {
  console.error('❌ 找不到 root 元素！');
}
