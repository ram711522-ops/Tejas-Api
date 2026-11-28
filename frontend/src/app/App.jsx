import { BrowserRouter } from 'react-router-dom';
import { ToastContainer } from '../components/feedback/ToastContainer';
import { SettingsProvider } from '../context/SettingsContext';
import { ToastProvider } from '../context/ToastContext';
import { AppRoutes } from './routes';

export function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
          <ToastContainer />
        </BrowserRouter>
      </ToastProvider>
    </SettingsProvider>
  );
}

export default App;
