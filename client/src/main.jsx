import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App.jsx';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 30, // 30 segundos
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          richColors
          toastOptions={{
            style: { fontFamily: '"DM Sans", sans-serif' },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
