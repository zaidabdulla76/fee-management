import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api';
import { useYear } from '../context/YearContext';
import { StatCard } from '../components/StatCard';
import { Card, EmptyState, PageHeader } from '../components/ui';
import { formatINR } from '../utils/format';

export default function Dashboard() {
  const { selectedYearId, selectedYear } = useYear();
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', selectedYearId],
    queryFn: async () => (await dashboardApi.get(selectedYearId || undefined)).data,
  });

  return (
    <div>
      <PageHeader
        title="Home"
        subtitle={
          selectedYear
            ? `School year ${selectedYear.year_name}`
            : 'Add a school year in Setup to start collecting fees'
        }
      />

      {selectedYear ? (
        <Card className="mb-6 overflow-hidden">
          <div className="flex flex-col gap-2 bg-primary px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-200/90">
                Current school year
              </p>
              <p className="mt-1 font-display text-lg font-semibold">{selectedYear.year_name}</p>
            </div>
            <p className="text-sm text-slate-300">
              {selectedYear.status === 'Active' ? 'Open for billing' : 'Closed'}
            </p>
          </div>
        </Card>
      ) : null}

      {error ? (
        <EmptyState title="Could not load" message={(error as Error).message || 'Please try again'} />
      ) : isLoading ? (
        <EmptyState message="Loading…" />
      ) : (
        <div className="space-y-4">
          {/* Top 4 Stat Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Active students" value={data.activeStudents} />
            <StatCard
              label="Tuition collected"
              value={formatINR(data.tuitionCollectedThisYear ?? data.totalCollectedThisYear)}
              hint="This school year"
              tone="accent"
            />
            <StatCard
              label="Tuition still due"
              value={formatINR(data.tuitionPendingAmount)}
              hint="Unpaid tuition"
              tone="warn"
            />
            <StatCard
              label="Students with unpaid tuition"
              value={data.studentsWithPendingTuition}
              tone="danger"
            />
            <StatCard
              label="Late fees collected"
              value={formatINR(data.lateFeesCollectedThisYear ?? 0)}
              hint="Tuition late fees this year"
              tone="warn"
            />
          </div>

          {/* New Requested Tiles: Admission and Collection Fees */}
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label={`Admission fee collected for academic year ${selectedYear?.year_name || ''}`}
              value={formatINR(data.admissionCollectedThisYear ?? 0)}
              hint="Initial admission fees"
              tone="accent"
            />
            <StatCard
              label="Amount collected from collection fee type"
              value={formatINR(data.collectionFeeCollectedThisYear ?? 0)}
              hint="Pay as you go fees (books, exams, uniforms, etc.)"
            />
          </div>
        </div>
      )}
    </div>
  );
}
