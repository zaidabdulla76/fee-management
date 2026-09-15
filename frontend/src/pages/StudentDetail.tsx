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

interface TuitionItem {
  month: { id: string; month_name: string; sequence: number };
  bill: { id: string; amount: number; late_fee_amount?: number; total_due?: number; status: string; due_date?: string } | null;
}

interface PaymentRow {
  id: string;
  payment_date: string;
  amount: number;
  base_amount?: number;
  payment_mode: string;
  receipt_no: string;
  academic_year?: { year_name: string };
  fee_type?: { name: string };
  month?: { month_name: string };
  fee_item?: { label: string };
}

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { years, selectedYearId } = useYear();
  const [yearId, setYearId] = useState('');
  const [payBill, setPayBill] = useState<{ id: string; amount: number } | null>(null);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({
    payment_date: todayISO(),
    payment_mode: 'cash',
    receipt_no: '',
    remarks: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ id?: string; receipt_no: string; amount?: number } | null>(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['student', id],
    queryFn: async () => (await studentsApi.get(id!)).data,
  });

  const effectiveYearId = yearId || selectedYearId || detail?.years?.[0]?.id || '';

  const { data: tuition = [], isLoading: tuitionLoading } = useQuery<TuitionItem[]>({
    queryKey: ['tuition', id, effectiveYearId],
    enabled: !!effectiveYearId && !!id,
    queryFn: async () => (await studentsApi.tuition(id!, effectiveYearId)).data,
  });

  const { data: payments = [] } = useQuery<PaymentRow[]>({
    queryKey: ['payments', id],
    enabled: !!id,
    queryFn: async () => (await studentsApi.payments(id!)).data,
  });

  const yearOptions = useMemo(() => {
    const map = new Map();
    years.forEach((y) => map.set(y.id, y));
    (detail?.years || []).forEach((y: { id: string }) => map.set(y.id, y));
    return [...map.values()];
  }, [years, detail]);

  const unpaidTuition = useMemo(() => {
    return tuition.filter((t) => t.bill && t.bill.status !== 'Paid');
  }, [tuition]);

  const selectedTuitionTotal = useMemo(() => {
    return unpaidTuition
      .filter((t) => t.bill && selectedBillIds.includes(t.bill.id))
      .reduce((sum, t) => sum + (t.bill ? Number(t.bill.amount) + Number((t.bill as any).late_fee_amount || 0) : 0), 0);
  }, [unpaidTuition, selectedBillIds]);

  const payMut = useMutation({
    mutationFn: () => billingApi.payBill(payBill!.id, payForm),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tuition', id] });
      qc.invalidateQueries({ queryKey: ['payments', id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setSuccess(res.data.payment);
      setPayBill(null);
    },
    onError: (err: unknown) => setError(errorMessage(err)),
  });

  const bulkPayMut = useMutation({
    mutationFn: () =>
      billingApi.payTuitionBulk({
        student_id: id!,
        academic_year_id: effectiveYearId,
        bill_ids: selectedBillIds,
        payment_date: payForm.payment_date,
        payment_mode: payForm.payment_mode,
        receipt_no: payForm.receipt_no || undefined,
        remarks: payForm.remarks || undefined,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tuition', id] });
      qc.invalidateQueries({ queryKey: ['payments', id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setSuccess({
        id: res.data.payment?.id,
        receipt_no: res.data.receipt_no,
        amount: res.data.total_amount,
      });
      setSelectedBillIds([]);
      setBulkPayOpen(false);
    },
    onError: (err: unknown) => setError(errorMessage(err)),
  });

  function toggleBillSelect(billId: string) {
    setSelectedBillIds((prev) =>
      prev.includes(billId) ? prev.filter((x) => x !== billId) : [...prev, billId]
    );
  }

  function toggleSelectAllUnpaid() {
    if (selectedBillIds.length === unpaidTuition.length) {
      setSelectedBillIds([]);
    } else {
      setSelectedBillIds(unpaidTuition.map((t) => t.bill!.id));
    }
  }

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
              <Button variant="accent">Collect fees</Button>
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="p-4 text-sm">
          <p className="text-muted">Father</p>
          <p className="font-medium text-primary">{student.father_name || '—'}</p>
        </Card>
        <Card className="p-4 text-sm">
          <p className="text-muted">Phone</p>
          <p className="font-medium text-primary">{student.phone || '—'}</p>
        </Card>
        <Card className="p-4 text-sm">
          <p className="text-muted">Admission date</p>
          <p className="font-medium text-primary">{formatDate(student.admission_date)}</p>
        </Card>
      </div>

      {success ? (
        <div className="mb-4">
          <Alert type="success">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Payment recorded successfully — Receipt No: <strong>{success.receipt_no}</strong>
                {success.amount ? ` (${formatINR(success.amount)})` : ''}.
              </span>
              <Button
                size="sm"
                variant="accent"
                onClick={() =>
                  downloadAuthed(
                    billingApi.receiptByNoUrl(success.receipt_no),
                    `${success.receipt_no}.pdf`
                  )
                }
              >
                Download receipt (PDF)
              </Button>
            </div>
          </Alert>
        </div>
      ) : null}

      {/* Tuition Card */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-primary">Tuition (12 Hijri months)</h2>
            {selectedBillIds.length > 0 ? (
              <Button
                size="sm"
                variant="accent"
                onClick={() => {
                  setError('');
                  setPayForm({
                    payment_date: todayISO(),
                    payment_mode: 'cash',
                    receipt_no: '',
                    remarks: '',
                  });
                  setBulkPayOpen(true);
                }}
              >
                Pay {selectedBillIds.length} selected month(s) ({formatINR(selectedTuitionTotal)})
              </Button>
            ) : null}
          </div>
          <Select
            label=""
            value={effectiveYearId}
            onChange={(e) => setYearId(e.target.value)}
            className="!w-56"
          >
            {yearOptions.map((y: { id: string; year_name: string; status: string }) => (
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
            <thead>
              <tr>
                <th className="w-10 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                    checked={unpaidTuition.length > 0 && selectedBillIds.length === unpaidTuition.length}
                    onChange={toggleSelectAllUnpaid}
                    disabled={unpaidTuition.length === 0}
                    title="Select all unpaid months"
                  />
                </th>
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3">Due date</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {tuition.map(({ month, bill }) => {
                const isPaid = bill?.status === 'Paid';
                const isChecked = bill ? selectedBillIds.includes(bill.id) : false;
                return (
                  <tr
                    key={month.id}
                    className={`border-t border-border ${isChecked ? 'bg-teal-50/50' : ''}`}
                  >
                    <td className="w-10 px-4 py-3 text-center">
                      {bill && !isPaid ? (
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                          checked={isChecked}
                          onChange={() => toggleBillSelect(bill.id)}
                        />
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-primary">{month.month_name}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(bill?.due_date)}</td>
                    <td className="px-4 py-3 font-medium">
                      {bill ? (
                        <span>
                          {formatINR(bill.amount)}
                          {(bill as any).late_fee_amount > 0 ? (
                            <span className="ml-1 text-xs font-normal text-rose-600">+ {formatINR((bill as any).late_fee_amount)} late</span>
                          ) : null}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {bill ? <StatusBadge status={bill.status} /> : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {bill && !isPaid ? (
                        <Button
                          variant="accent"
                          className="!px-2.5 !py-1 text-xs"
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
                        <span className="text-xs text-emerald-600 font-medium">Paid</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Payment History */}
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
            <thead>
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Fee type</th>
                <th className="px-4 py-3">Month / Item</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-3">{formatDate(p.payment_date)}</td>
                  <td className="px-4 py-3 text-muted">{p.academic_year?.year_name || '—'}</td>
                  <td className="px-4 py-3">{p.fee_type?.name || '—'}</td>
                  <td className="px-4 py-3">
                    {p.month?.month_name || p.fee_item?.label || '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold text-primary">{formatINR(p.amount)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-medium text-accent hover:underline text-xs"
                      onClick={() =>
                        downloadAuthed(
                          billingApi.receiptByNoUrl(p.receipt_no),
                          `${p.receipt_no}.pdf`
                        )
                      }
                      title="Download PDF Receipt"
                    >
                      {p.receipt_no} 📄
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Single Month Payment Modal */}
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
                Amount due: <strong>{formatINR(payBill.amount)}</strong>
              </p>
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

      {/* Bulk Month Payment Modal */}
      <Modal
        open={bulkPayOpen}
        title={`Pay ${selectedBillIds.length} month(s) of tuition`}
        onClose={() => setBulkPayOpen(false)}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            bulkPayMut.mutate();
          }}
        >
          {error ? <Alert>{error}</Alert> : null}
          <div className="rounded-lg border border-border bg-accent-soft p-3 text-sm">
            <p className="text-muted">Total amount to pay:</p>
            <p className="text-2xl font-bold text-primary">
              {formatINR(selectedTuitionTotal)}
            </p>
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
            <Button variant="secondary" onClick={() => setBulkPayOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={bulkPayMut.isPending}>
              {bulkPayMut.isPending ? 'Saving…' : 'Confirm payment'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
