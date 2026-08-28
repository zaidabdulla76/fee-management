import { useState } from 'react';
import { PageHeader } from '../components/ui';
import AcademicYears from './AcademicYears';
import Settings from './Settings';

const tabs = [
  { id: 'years', label: 'School years' },
  { id: 'fees', label: 'Fee settings' },
];

export default function Setup() {
  const [tab, setTab] = useState('years');

  return (
    <div>
      <PageHeader
        title="Setup"
        subtitle="Manage school years and fee rules in one place"
      />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              tab === t.id
                ? 'border-accent text-primary'
                : 'border-transparent text-muted hover:text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'years' ? <AcademicYears embedded /> : <Settings embedded />}
    </div>
  );
}
