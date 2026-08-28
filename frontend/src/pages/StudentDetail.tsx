import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billingApi, studentsApi } from '../api';
import { useYear } from '../context/YearContext';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '../components/ui';
import { downloadAuthed, errorMessage, formatDate, formatINR, todayISO } from '../utils/format';

export default function StudentDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { years, selectedYearId } = useYear();
  const [yearId, setYearId] = useState('');
  const [payBill, setPayBill] = useState(null);
  const [payForm, setPayForm] = useState({
    payment_date: todayISO(),
    payment_mode: 'cash',
    receipt_no: '',
    remarks: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['student', id],
    queryFn: async () => (await studentsApi.get(id)).data,
  });

  const effectiveYearId = yearId || selectedYearId || detail?.years?.[0]?.id || '';

  const { data: tuition = [], isLoading: tuitionLoading } = useQuery({
    queryKey: ['tuition', id, effectiveYearId],
    enabled: !!effectiveYearId,
    queryFn: async () => (await studentsApi.tuition(id, effectiveYearId)).data,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['payments', id],
    queryFn: async () => (await studentsApi.payments(id)).data,
  });

  const yearOptions = useMemo(() => {
    const map = new Map();
    years.forEach((y) => map.set(y.id, y));
    (detail?.years || []).forEach((y) => map.set(y.id, y));
    return [...map.values()];
  }, [years, detail]);

  const payMut = useMutation({
    mutationFn: () => billingApi.payBill(payBill.id, payForm),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tuition', id] });
      qc.invalidateQueries({ queryKey: ['payments', id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setSuccess(res.data.payment);
      setPayBill(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (isLoading) return <EmptyState message="Loading student…" />;
  if (!detail) return <EmptyState message="Student not found" />;

  const { student } = detail;

  return (
    <div>
      <PageHeader
        title={student.name}
        subtitle={`${student.student_code} · Class ${student.class} · ${student.status}`}
        actions={
          <>
            <Link to="/students">
              <Button variant="secondary">Back</Button>
            </Link>
            <Link to={`/collect?studentId=${student.id}`}>
              <Button variant="accent">Collect non-tuition fee</Button>
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="p-4 text-sm">
          <p className="text-muted">Father</p>
          <p className="font-medium">{student.father_name || '—'}</p>
        </Card>
        <Card className="p-4 text-sm">
          <p className="text-muted">Phone</p>
          <p className="font-medium">{student.phone || '—'}</p>
        </Card>
        <Card className="p-4 text-sm">
          <p className="text-muted">Admission</p>
          <p className="font-medium">{formatDate(student.admission_date)}</p>
        </Card>
      </div>

      {success ? (
        <div className="mb-4">
          <Alert type="success">
            Payment recorded — {success.receipt_no}.{' '}
            <button
              type="button"
              className="underline"
              onClick={() =>
                downloadAuthed(
                  billingApi.receiptUrl(success.id),
                  `${success.receipt_no}.pdf`
                )
              }
            >
              Download receipt
            </button>
          </Alert>
        </div>
      ) : null}

      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="font-semibold text-primary">Tuition (12 Hijri months)</h2>
          <Select
            label=""
            value={effectiveYearId}
            onChange={(e) => setYearId(e.target.value)}
            className="!w-56"
          >
            {yearOptions.map((y) => (
              <option key={y.id} value={y.id}>
                {y.year_name} ({y.status})
              </option>
            ))}
          </Select>
        </div>
        {!effectiveYearId ? (
          <div className="p-6">
            <EmptyState message="Select or create an academic year." />
          </div>
        ) : tuitionLoading ? (
          <div className="p-6">
            <EmptyState message="Loading tuition…" />
          </div>
        ) : (
          <table className="data-table">
            <thead className="">
              <tr>
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3">Due date</th>
                <th className="px-4 py-3">Base</th>
                <th className="px-4 py-3">Late fee</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {tuition.map(({ month, bill }) => (
                <tr key={month.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{month.month_name}</td>
                  <td className="px-4 py-3">{formatDate(bill?.due_date)}</td>
                  <td className="px-4 py-3">{bill ? formatINR(bill.amount) : '—'}</td>
                  <td className="px-4 py-3">
                    {bill ? formatINR(bill.late_fee_amount || 0) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {bill ? formatINR(bill.total_due ?? bill.amount) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {bill ? <StatusBadge status={bill.status} /> : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {bill && bill.status !== 'Paid' ? (
                      <Button
                        variant="accent"
                        className="!px-2 !py-1"
                        onClick={() => {
                          setError('');
                          setPayBill(bill);
                          setPayForm({
                            payment_date: todayISO(),
                            payment_mode: 'cash',
                            receipt_no: '',
                            remarks: '',
                          });
                        }}
                      >
                        Mark paid
                      </Button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold text-primary">Payment history (all years)</h2>
        </div>
        {!payments.length ? (
          <div className="p-6">
            <EmptyState message="No payments yet." />
          </div>
        ) : (
          <table className="data-table">
            <thead className="">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Fee type</th>
                <th className="px-4 py-3">Month / Item</th>
                <th className="px-4 py-3">Base</th>
                <th className="px-4 py-3">Late fee</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-3">{formatDate(p.payment_date)}</td>
                  <td className="px-4 py-3">{p.academic_year?.year_name || '—'}</td>
                  <td className="px-4 py-3">{p.fee_type?.name || '—'}</td>
                  <td className="px-4 py-3">
                    {p.month?.month_name || p.fee_item?.label || '—'}
                  </td>
                  <td className="px-4 py-3">{formatINR(p.base_amount ?? p.amount)}</td>
                  <td className="px-4 py-3">{formatINR(p.late_fee_amount || 0)}</td>
                  <td className="px-4 py-3 font-medium">{formatINR(p.amount)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="text-accent hover:underline"
                      onClick={() =>
                        downloadAuthed(
                          billingApi.receiptUrl(p.id),
                          `${p.receipt_no}.pdf`
                        )
                      }
                    >
                      {p.receipt_no}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={!!payBill} title="Record tuition payment" onClose={() => setPayBill(null)}>
        {payBill ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError('');
              payMut.mutate();
            }}
          >
            {error ? <Alert>{error}</Alert> : null}
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p>
                Amount due:{' '}
                <strong>
                  {formatINR(payBill.amount + (payBill.late_fee_amount || 0))}
                </strong>
              </p>
              {(payBill.late_fee_amount || 0) > 0 ? (
                <p className="mt-1 text-muted">
                  Base {formatINR(payBill.amount)} + late fee{' '}
                  {formatINR(payBill.late_fee_amount)}
                </p>
              ) : null}
            </div>
            <Input
              label="Payment date"
              type="date"
              value={payForm.payment_date}
              onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })}
              required
            />
            <Select
              label="Mode"
              value={payForm.payment_mode}
              onChange={(e) => setPayForm({ ...payForm, payment_mode: e.target.value })}
            >
              <option value="cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="bank">Bank</option>
            </Select>
            <Input
              label="Receipt no (optional)"
              value={payForm.receipt_no}
              onChange={(e) => setPayForm({ ...payForm, receipt_no: e.target.value })}
              placeholder="Auto-generated if blank"
            />
            <Textarea
              label="Remarks"
              rows={2}
              value={payForm.remarks}
              onChange={(e) => setPayForm({ ...payForm, remarks: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPayBill(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={payMut.isPending}>
                {payMut.isPending ? 'Saving…' : 'Confirm payment'}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
