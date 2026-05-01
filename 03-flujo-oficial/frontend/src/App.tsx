import { useState } from 'react';
import ActaForm from './components/ActaForm';
import CsvUpload from './components/CsvUpload';
import ActasList from './components/ActasList';

type Tab = 'acta' | 'csv' | 'listado';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'csv',     label: 'Cargar CSV',  icon: '↥' },
  { id: 'acta',    label: 'Cargar Acta', icon: '✎' },
  { id: 'listado', label: 'Actas',       icon: '☰' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('csv');

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">OEP</div>
          <div>
            <h1>Conteo Oficial</h1>
            <p>Sistema Nacional de Cómputo Electoral · Bolivia</p>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'tab-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="tab-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {tab === 'csv' && <CsvUpload />}
        {tab === 'acta' && <ActaForm />}
        {tab === 'listado' && <ActasList />}
      </main>

      <footer className="footer">
        Backend: <code>http://localhost:4000/api</code> · Pipeline: Conteo Oficial
      </footer>
    </div>
  );
}
