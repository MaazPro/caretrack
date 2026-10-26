import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth';
import App from './App';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } } });
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ConfigProvider theme={{ token: { colorPrimary: '#1677ff', colorBgLayout: '#f5f7fa', colorText: '#1f2937', borderRadius: 8, fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' } }}><AntApp><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></QueryClientProvider></AntApp></ConfigProvider></React.StrictMode>);
