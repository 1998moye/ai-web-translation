import { createRoot } from 'react-dom/client';
import { OptionsApp } from './options-app';
import './options.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<OptionsApp />);
}
