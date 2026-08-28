import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, studentsApi } from '../api';
import { useYear } from '../context/YearContext';
import { Button, Card, EmptyState, PageHeader, Select } from '../components/ui';
import { downloadAuthed, formatDate, formatINR } from '../utils/format';

const reportKinds = [
  { id: 'tuition-status', label: 'Tuition paid / pending students' },
  { id: 'collections-by-type', label: 'Collections by fee type' },
  { id: 'outstanding-tuition', label: 'Outstanding tuition' },
  { id: 'year-summary', label: 'Academic year summary' },
  { id: 'student-ledger', label: 'Individual student ledger' },
];

export default function Reports() {
  const { selectedYearId, selectedYear } = useYear();
  const [kind, setKind] = useState('tuition-status');
  const [studentId, setStudentId] = useState('');

  const { data: students = [] } = useQuery({
    queryKey: ['students-all'],
    queryFn: async () => (await studentsApi.list()).data,
  });

  const queryKey = useMemo(
    () => ['report', kind, selectedYearId, studentId],
    [kind, selectedYearId, studentId]
  );

  const { data, isLoading, error } = useQuery({
    queryKey,
    enabled:
      !!selectedYearId &&
      (kind !== 'student-ledger' || !!studentId),
    queryFn: async () => {
      if (kind === 'tuition-status')
        return (await reportsApi.tuitionStatus(selectedYearId)).data;
      if (kind === 'collections-by-type')
        return (await reportsApi.collectionsByType(selectedYearId)).data;
      if (kind === 'outstanding-tuition')
        return (await reportsApi.outstanding(selectedYearId)).data;
      if (kind === 'year-summary')
        return (await reportsApi.yearSummary(selectedYearId)).data;
      return (await reportsApi.studentLedger(studentId)).data;
    },
  });

  function exportFile(format) {
    const params =
      kind === 'student-ledger'
        ? { studentId, format }
        : { academicYearId: selectedYearId, format };
    const url = reportsApi.exportUrl(kind, params);
    downloadAuthed(url, `${kind}.${format === 'xlsx' ? 'xlsx' : 'pdf'}`);
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={selectedYear ? `For ${selectedYear.year_name}` : 'Choose a school year at the top'}
        actions={
          <>
            <Button variant="secondary" onClick={() => exportFile('pdf')} disabled={!data}>
              Export PDF
            </Button>
            <Button variant="secondary" onClick={() => exportFile('xlsx')} disabled={!data}>
              Export Excel
            </Button>
          </>
        }
      />

      <Card className="mb-4 grid gap-3 p-4 md:grid-cols-2">
        <Select label="Report" value={kind} onChange={(e) => setKind(e.target.value)}>
          {reportKinds.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
        {kind === 'student-ledger' ? (
          <Select
            label="Student"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.student_code} — {s.name}
              </option>
            ))}
          </Select>
        ) : null}
      </Card>

      {!selectedYearId ? (
        <EmptyState message="Select an academic year to run reports." />
      ) : isLoading ? (
        <EmptyState message="Loading report…" />
      ) : error ? (
        <EmptyState message={error.message || 'Failed to load report'} />
      ) : !data ? (
        <EmptyState message="Choose options to view the report." />
      ) : (
        <Card className="overflow-hidden p-0">
          {kind === 'year-summary' ? (
            <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <SummaryTile label="Students with tuition" value={data.active_students_with_tuition} />
              <SummaryTile label="Fully paid" value={data.fully_paid_students} />
              <SummaryTile label="With dues" value={data.students_with_dues} />
              <SummaryTile label="Total collected" value={formatINR(data.total_collected)} />
              <SummaryTile label="Late fees collected" value={formatINR(data.late_fees_collected)} />
              <SummaryTile label="Outstanding" value={formatINR(data.outstanding_amount)} />
            </div>
          ) : null}

          {kind === 'tuition-status' ? (
            <Table
              headers={['Code', 'Name', 'Class', 'Paid', 'Pending', 'Status', 'Outstanding']}
              rows={(data.rows || []).map((r) => [
                r.student.student_code,
                r.student.name,
                r.student.class,
                r.paid_months,
                r.pending_months,
                r.status,
                formatINR(r.outstanding),
              ])}
            />
          ) : null}

          {kind === 'collections-by-type' ? (
            <div>
              <div className="border-b border-border px-4 py-3 text-sm text-muted">
                Late fees collected: <strong>{formatINR(data.lateFeesCollected)}</strong>
              </div>
              <Table
                headers={['Fee type', 'Total', 'Count', 'Fee item breakdown']}
                rows={(data.rows || []).map((r) => [
                  r.fee_type,
                  formatINR(r.total),
                  r.count,
                  (r.items || [])
                    .map((i) => `${i.label}: ${formatINR(i.total)} (${i.count})`)
                    .join('; ') || '—',
                ])}
              />
            </div>
          ) : null}

          {kind === 'outstanding-tuition' ? (
            <Table
              headers={['Code', 'Name', 'Month', 'Status', 'Base', 'Late fee', 'Total due']}
              rows={(data.rows || []).map((r) => [
                r.student.student_code,
                r.student.name,
                r.month?.month_name,
                r.bill.status,
                formatINR(r.bill.amount),
                formatINR(r.bill.late_fee_amount || 0),
                formatINR(r.total_due),
              ])}
            />
          ) : null}

          {kind === 'student-ledger' ? (
            <Table
              headers={[
                'Date',
                'Year',
                'Fee type',
                'Month/Item',
                'Status',
                'Base',
                'Late',
                'Amount',
                'Receipt',
              ]}
              rows={(data.rows || []).map((r) => [
                formatDate(r.date),
                r.academic_year,
                r.fee_type,
                r.month || r.fee_item || '—',
                r.status,
                formatINR(r.base_amount),
                formatINR(r.late_fee_amount || 0),
                formatINR(r.amount),
                r.receipt_no || '—',
              ])}
            />
          ) : null}
        </Card>
      )}
    </div>
  );
}

function SummaryTile({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-slate-50 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-primary">{value}</p>
    </div>
  );
}

function Table({ headers, rows }) {
  if (!rows.length) {
    return <div className="p-6"><EmptyState message="No rows for this report." /></div>;
  }
  return (
    <table className="data-table">
      <thead className="">
        <tr>
          {headers.map((h) => (
            <th key={h} className="px-4 py-3">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={idx} className="border-t border-border">
            {row.map((cell, i) => (
              <td key={i} className="px-4 py-3">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
