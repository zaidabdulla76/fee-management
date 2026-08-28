import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { yearsApi } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { Alert, Button, Card, EmptyState, Input, PageHeader } from '../components/ui';
import { errorMessage, formatDate, todayISO } from '../utils/format';

export default function AcademicYears({ embedded = false }) {
  const qc = useQueryClient();
  const { data: years = [], isLoading } = useQuery({
    queryKey: ['academic-years'],
    queryFn: async () => (await yearsApi.list()).data,
  });
  const { data: nextStart } = useQuery({
    queryKey: ['academic-years-next-start'],
    queryFn: async () => (await yearsApi.nextStart()).data,
  });

  const [open, setOpen] = useState(false);
  const [yearName, setYearName] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  useEffect(() => {
    if (!open) return;
    if (nextStart?.suggested_start_date) {
      setStartDate(nextStart.suggested_start_date);
    } else if (!startDate) {
      setStartDate(todayISO());
    }
  }, [open, nextStart]);

  const createMut = useMutation({
    mutationFn: () => yearsApi.create({ year_name: yearName, start_date: startDate }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['academic-years'] });
      qc.invalidateQueries({ queryKey: ['academic-years-next-start'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setWarning(res.data.warning || '');
      setOpen(false);
      setYearName('');
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const lockedStart = Boolean(nextStart?.suggested_start_date);

  return (
    <div>
      {embedded ? null : (
        <PageHeader
          title="School years"
          subtitle="Each year runs from Shawwal to Ramadan (12 months)"
          actions={
            <Button
              onClick={() => {
                setError('');
                setOpen(true);
              }}
            >
              Add school year
            </Button>
          }
        />
      )}
      {embedded ? (
        <div className="mb-4 flex justify-end">
          <Button
            onClick={() => {
              setError('');
              setOpen(true);
            }}
          >
            Add school year
          </Button>
        </div>
      ) : null}
      {warning ? (
        <div className="mb-4">
          <Alert type="warning">{warning}</Alert>
        </div>
      ) : null}
      {isLoading ? (
        <EmptyState message="Loading…" />
      ) : !years.length ? (
        <EmptyState message="No school years yet. Add one to start creating tuition bills." />
      ) : (
        <Card className="overflow-hidden">
          <table className="data-table">
            <thead className="">
              <tr>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Start date</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-primary">{y.year_name}</td>
                  <td className="px-4 py-3">{formatDate(y.start_date)}</td>
                  <td className="px-4 py-3 text-muted">
                    {y.start_month} → {y.end_month}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={y.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={open} title="Add school year" onClose={() => setOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            createMut.mutate();
          }}
        >
          {error ? <Alert>{error}</Alert> : null}
          <Input
            label="Year name"
            placeholder="2025–2026"
            value={yearName}
            onChange={(e) => setYearName(e.target.value)}
            required
          />
          <Input
            id="shawwal-start"
            label="Start date (first day of Shawwal)"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            readOnly={lockedStart}
            min={nextStart?.suggested_start_date || undefined}
            max={nextStart?.suggested_start_date || undefined}
          />
          <p className="text-xs text-muted">
            {nextStart?.message ||
              'This closes the current year and creates tuition bills for active students (set tuition prices first).'}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? 'Creating…' : 'Create year'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
