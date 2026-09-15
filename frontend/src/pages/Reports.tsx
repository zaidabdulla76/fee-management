import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, settingsApi, studentsApi } from '../api';
import { useYear } from '../context/YearContext';
import { Button, Card, EmptyState, PageHeader, Select } from '../components/ui';
import { downloadAuthed, formatDate, formatINR } from '../utils/format';

const reportKinds = [
  { id: 'tuition-status', label: 'Tuition paid / pending students' },
  { id: 'collections-by-type', label: 'Collections by fee type' },
  { id: 'year-summary', label: 'Academic year summary' },
  { id: 'student-ledger', label: 'Individual student ledger' },
];

export default function Reports() {
  const { selectedYearId, selectedYear } = useYear();
  const [kind, setKind] = useState('tuition-status');
  const [studentId, setStudentId] = useState('');
  const [selectedClass, setSelectedClass] = useState('');

  const { data: students = [] } = useQuery({
    queryKey: ['students-all'],
    queryFn: async () => (await studentsApi.list()).data,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => (await settingsApi.classes()).data,
  });

  const queryKey = useMemo(
    () => ['report', kind, selectedYearId, studentId, selectedClass],
    [kind, selectedYearId, studentId, selectedClass]
  );

  const { data, isLoading, error } = useQuery({
    queryKey,
    enabled:
      !!selectedYearId &&
      (kind !== 'student-ledger' || !!studentId),
    queryFn: async () => {
      if (kind === 'tuition-status')
        return (await reportsApi.tuitionStatus(selectedYearId, selectedClass || undefined)).data;
      if (kind === 'collections-by-type')
        return (await reportsApi.collectionsByType(selectedYearId)).data;
      if (kind === 'year-summary')
        return (await reportsApi.yearSummary(selectedYearId)).data;
      return (await reportsApi.studentLedger(studentId)).data;
    },
  });

  function exportFile(format: string) {
    const params: Record<string, string> =
      kind === 'student-ledger'
        ? { studentId, format }
        : { academicYearId: selectedYearId, format };
    if (selectedClass) {
      params.classId = selectedClass;
    }
    const url = reportsApi.exportUrl(kind, params);
    downloadAuthed(url, `${kind}.${format === 'xlsx' ? 'xlsx' : 'pdf'}`);
  }

  const tuitionStatusRows = useMemo(() => {
    if (!data?.rows) return [];
    if (!selectedClass) return data.rows;
    return data.rows.filter(
      (r: { student: { class: string } }) => r.student.class === selectedClass
    );
  }, [data, selectedClass]);

  const filteredStudents = useMemo(() => {
    if (!selectedClass) return students;
    return students.filter((s: { class?: string }) => s.class === selectedClass);
  }, [students, selectedClass]);

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

      <Card className="mb-4 grid gap-3 p-4 md:grid-cols-3">
        <Select label="Report" value={kind} onChange={(e) => setKind(e.target.value)}>
          {reportKinds.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>

        <Select
          label="Class"
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
        >
          <option value="">All classes</option>
          {classes.map((c: { id: string; name: string }) => (
            <option key={c.id} value={c.name}>
              Class {c.name}
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
            {filteredStudents.map((s: { id: string; student_code: string; name: string }) => (
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
        <EmptyState message={(error as Error).message || 'Failed to load report'} />
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
              <SummaryTile label="Outstanding" value={formatINR(data.outstanding_amount)} />
            </div>
          ) : null}

          {kind === 'tuition-status' ? (
            <Table
              headers={['Code', 'Name', 'Class', 'Paid', 'Pending', 'Status', 'Outstanding']}
              rows={tuitionStatusRows.map((r: { student: { student_code: string; name: string; class: string }; paid_months: number; pending_months: number; status: string; outstanding: number }) => [
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
              <Table
                headers={['Fee type', 'Total', 'Count', 'Fee item breakdown']}
                rows={(data.rows || []).map((r: { fee_type: string; total: number; count: number; items?: { label: string; total: number; count: number }[] }) => [
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

          {kind === 'student-ledger' ? (
            <Table
              headers={[
                'Date',
                'Year',
                'Fee type',
                'Month/Item',
                'Status',
                'Amount',
                'Receipt',
              ]}
              rows={(data.rows || []).map((r: { date: string; academic_year: string; fee_type: string; month?: string; fee_item?: string; status: string; amount: number; receipt_no?: string }) => [
                formatDate(r.date),
                r.academic_year,
                r.fee_type,
                r.month || r.fee_item || '—',
                r.status,
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

function SummaryTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-slate-50 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-primary">{value}</p>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | number | React.ReactNode)[][] }) {
  if (!rows.length) {
    return <div className="p-6"><EmptyState message="No rows for this report." /></div>;
  }
  return (
    <table className="data-table">
      <thead>
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
