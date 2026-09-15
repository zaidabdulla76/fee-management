import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billingApi, settingsApi, studentsApi } from '../api';
import { useYear } from '../context/YearContext';
import { StudentSearch } from '../components/StudentSearch';
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

interface TuitionMonthItem {
  month: { id: string; month_name: string; sequence: number };
  bill: { id: string; amount: number; late_fee_amount?: number; total_due?: number; status: string; due_date?: string } | null;
}

export default function CollectFee() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const { selectedYearId, selectedYear } = useYear();
  const [studentId, setStudentId] = useState(params.get('studentId') || '');
  const [feeTypeId, setFeeTypeId] = useState('');
  const [feeItemId, setFeeItemId] = useState('');
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentMode, setPaymentMode] = useState('cash');
  const [receiptNo, setReceiptNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{
    amount: number;
    receipt_no: string;
    receiptUrl: string;
  } | null>(null);

  const { data: students = [] } = useQuery({
    queryKey: ['students', 'Active'],
    queryFn: async () => (await studentsApi.list({ status: 'Active' })).data,
  });

  const { data: feeTypes = [] } = useQuery({
    queryKey: ['fee-types'],
    queryFn: async () => (await settingsApi.feeTypes()).data,
  });

  const activeFeeTypes = useMemo(
    () => feeTypes.filter((t: { active?: boolean }) => t.active !== false),
    [feeTypes]
  );

  const selectedType = activeFeeTypes.find((t: { id: string }) => t.id === feeTypeId);
  const isTuition =
    selectedType?.mode === 'tuition' ||
    selectedType?.mode === 'enrollment' ||
    selectedType?.name?.toLowerCase() === 'tuition';

  // Fee items for non-tuition fee types
  const { data: feeItems = [] } = useQuery({
    queryKey: ['fee-items', feeTypeId],
    enabled: !!feeTypeId && !isTuition,
    queryFn: async () => (await billingApi.feeItems(feeTypeId)).data,
  });

  // Tuition bills for selected student when tuition fee type is chosen
  const { data: tuitionMonths = [], isLoading: tuitionLoading } = useQuery<TuitionMonthItem[]>({
    queryKey: ['student-tuition', studentId, selectedYearId],
    enabled: !!studentId && !!selectedYearId && isTuition,
    queryFn: async () => (await studentsApi.tuition(studentId, selectedYearId)).data,
  });

  const unpaidTuition = useMemo(() => {
    return tuitionMonths.filter(
      (m) => m.bill && m.bill.status !== 'Paid'
    );
  }, [tuitionMonths]);

  useEffect(() => {
    if (!feeTypeId && activeFeeTypes[0]) {
      setFeeTypeId(activeFeeTypes[0].id);
    }
  }, [activeFeeTypes, feeTypeId]);

  useEffect(() => {
    setFeeItemId('');
    if (feeItems.length === 1) setFeeItemId(feeItems[0].id);
  }, [feeTypeId, feeItems]);

  useEffect(() => {
    // Reset selected tuition months when student or fee type changes
    setSelectedBillIds([]);
  }, [studentId, feeTypeId]);

  const selectedItem = feeItems.find((i: { id: string }) => i.id === feeItemId);
  const needsItemPicker =
    selectedType &&
    !isTuition &&
    !['Exam', 'Bag', 'Admission'].includes(selectedType.name) &&
    feeItems.length > 1;

  // Compute tuition total for selected bills
  const selectedTuitionTotal = useMemo(() => {
    return unpaidTuition
      .filter((m) => m.bill && selectedBillIds.includes(m.bill.id))
      .reduce((sum, m) => sum + (m.bill ? Number(m.bill.amount) + Number((m.bill as any).late_fee_amount || 0) : 0), 0);
  }, [unpaidTuition, selectedBillIds]);

  const collectNonTuitionMut = useMutation({
    mutationFn: () =>
      billingApi.collect({
        student_id: studentId,
        academic_year_id: selectedYearId,
        fee_type_id: feeTypeId,
        fee_item_id: feeItemId,
        payment_date: paymentDate,
        payment_mode: paymentMode,
        receipt_no: receiptNo || undefined,
        remarks,
      }),
    onSuccess: (res) => {
      const p = res.data.payment;
      setSuccess({
        amount: p.amount,
        receipt_no: p.receipt_no,
        receiptUrl: billingApi.receiptUrl(p.id),
      });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setRemarks('');
      setReceiptNo('');
    },
    onError: (err: unknown) => setError(errorMessage(err)),
  });

  const collectTuitionBulkMut = useMutation({
    mutationFn: () =>
      billingApi.payTuitionBulk({
        student_id: studentId,
        academic_year_id: selectedYearId,
        bill_ids: selectedBillIds,
        payment_date: paymentDate,
        payment_mode: paymentMode,
        receipt_no: receiptNo || undefined,
        remarks,
      }),
    onSuccess: (res) => {
      const rno = res.data.receipt_no;
      setSuccess({
        amount: res.data.total_amount,
        receipt_no: rno,
        receiptUrl: billingApi.receiptByNoUrl(rno),
      });
      qc.invalidateQueries({ queryKey: ['student-tuition'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setSelectedBillIds([]);
      setRemarks('');
      setReceiptNo('');
    },
    onError: (err: unknown) => setError(errorMessage(err)),
  });

  function toggleBill(billId: string) {
    setSelectedBillIds((prev) =>
      prev.includes(billId) ? prev.filter((id) => id !== billId) : [...prev, id]
    );
  }

  function selectAllPending() {
    if (selectedBillIds.length === unpaidTuition.length) {
      setSelectedBillIds([]);
    } else {
      setSelectedBillIds(
        unpaidTuition.map((m) => m.bill!.id)
      );
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) {
      setError('Select a student first.');
      return;
    }
    setError('');
    setSuccess(null);

    if (isTuition) {
      if (selectedBillIds.length === 0) {
        setError('Please select at least one month of tuition to pay.');
        return;
      }
      collectTuitionBulkMut.mutate();
    } else {
      if (!feeItemId) {
        setError('Please select a fee item.');
        return;
      }
      collectNonTuitionMut.mutate();
    }
  }

  const isPending = collectNonTuitionMut.isPending || collectTuitionBulkMut.isPending;

  return (
    <div>
      <PageHeader
        title="Collect fees"
        subtitle="Collect tuition fee (single or multiple months) or collection fees (books, exam, admission, etc.)"
      />

      {!selectedYearId ? (
        <EmptyState message="Select an academic year in the header first." />
      ) : (
        <Card className="mx-auto max-w-2xl p-6">
          {selectedYear?.status === 'Frozen' ? (
            <div className="mb-4">
              <Alert type="warning">Selected year is frozen; collections are blocked.</Alert>
            </div>
          ) : null}
          {error ? (
            <div className="mb-4">
              <Alert>{error}</Alert>
            </div>
          ) : null}
          {success ? (
            <div className="mb-4">
              <Alert type="success">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Successfully collected {formatINR(success.amount)} — Receipt No:{' '}
                    <strong>{success.receipt_no}</strong>.
                  </span>
                  <Button
                    size="sm"
                    variant="accent"
                    onClick={() =>
                      downloadAuthed(success.receiptUrl, `${success.receipt_no}.pdf`)
                    }
                  >
                    Download receipt (PDF)
                  </Button>
                </div>
              </Alert>
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <StudentSearch
              students={students}
              value={studentId}
              onChange={setStudentId}
              disabled={selectedYear?.status === 'Frozen'}
            />

            <Select
              label="Fee type"
              value={feeTypeId}
              onChange={(e) => setFeeTypeId(e.target.value)}
              required
            >
              {activeFeeTypes.map((t: { id: string; name: string; mode: string }) => (
                <option key={t.id} value={t.id}>
                  {t.name} (
                  {t.mode === 'admission'
                    ? 'Admission - initial payment'
                    : t.mode === 'tuition' || t.mode === 'enrollment'
                    ? 'Tuition fee - monthly basis'
                    : 'Collection - pay as you go'}
                  )
                </option>
              ))}
            </Select>

            {/* Tuition Multi-Month Selector */}
            {isTuition ? (
              <div className="rounded-lg border border-border bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold text-primary">
                    Select Months to Pay (Multiple Allowed):
                  </span>
                  {unpaidTuition.length > 0 ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-accent hover:underline"
                      onClick={selectAllPending}
                    >
                      {selectedBillIds.length === unpaidTuition.length
                        ? 'Deselect all'
                        : 'Select all pending months'}
                    </button>
                  ) : null}
                </div>

                {!studentId ? (
                  <p className="text-sm text-muted">Select a student to view pending tuition months.</p>
                ) : tuitionLoading ? (
                  <p className="text-sm text-muted">Loading student tuition bills…</p>
                ) : unpaidTuition.length === 0 ? (
                  <p className="text-sm text-emerald-600 font-medium">
                    ✓ All tuition months for this academic year are paid!
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {unpaidTuition.map(({ month, bill }) => {
                      const isChecked = bill ? selectedBillIds.includes(bill.id) : false;
                      return (
                        <label
                          key={month.id}
                          className={`flex items-center justify-between rounded-lg border p-2.5 text-sm cursor-pointer transition ${
                            isChecked
                              ? 'border-accent bg-teal-50/60 font-medium text-primary'
                              : 'border-border bg-white text-slate-700 hover:bg-slate-100/60'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                              checked={isChecked}
                              onChange={() => bill && toggleBill(bill.id)}
                            />
                            <span>{month.month_name}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <span className="text-muted">Due: {formatDate(bill?.due_date)}</span>
                            <span className="font-semibold text-primary">
                              {bill ? (
                                <span>
                                  {formatINR(bill.amount)}
                                  {(bill as any).late_fee_amount > 0 ? (
                                    <span className="ml-1 text-xs font-normal text-rose-600">+ {formatINR((bill as any).late_fee_amount)} late</span>
                                  ) : null}
                                </span>
                              ) : '—'}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {/* Non-tuition Item Picker */}
            {!isTuition && needsItemPicker ? (
              <Select
                label={selectedType?.name === 'Uniform' ? 'Size' : 'Item / Course / Book'}
                value={feeItemId}
                onChange={(e) => setFeeItemId(e.target.value)}
                required
              >
                <option value="">Select item…</option>
                {feeItems.map((i: { id: string; label: string; price: number }) => (
                  <option key={i.id} value={i.id}>
                    {i.label} — {formatINR(i.price)}
                  </option>
                ))}
              </Select>
            ) : !isTuition && selectedItem ? (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                Item: <strong>{selectedItem.label}</strong>
              </div>
            ) : null}

            {/* Total Amount Display */}
            <div className="rounded-lg border border-border bg-accent-soft px-4 py-3">
              <p className="text-sm text-muted">
                {isTuition ? 'Total Tuition for Selected Months' : 'Amount to Collect'}
              </p>
              <p className="text-2xl font-semibold text-primary">
                {isTuition
                  ? formatINR(selectedTuitionTotal)
                  : selectedItem
                  ? formatINR(selectedItem.price)
                  : '—'}
              </p>
            </div>

            <Input
              label="Payment date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
            />
            <Select
              label="Payment mode"
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
            >
              <option value="cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="bank">Bank</option>
            </Select>
            <Input
              label="Receipt no (optional - auto-generated if empty)"
              value={receiptNo}
              onChange={(e) => setReceiptNo(e.target.value)}
              placeholder="e.g. RCPT-2026-00001"
            />
            <Textarea
              label="Remarks"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional notes or reference number…"
            />

            <Button
              type="submit"
              className="w-full"
              disabled={
                isPending ||
                !studentId ||
                (isTuition ? selectedBillIds.length === 0 : !feeItemId) ||
                selectedYear?.status === 'Frozen'
              }
            >
              {isPending
                ? 'Recording…'
                : isTuition
                ? `Confirm tuition payment (${selectedBillIds.length} month${
                    selectedBillIds.length > 1 ? 's' : ''
                  } · ${formatINR(selectedTuitionTotal)})`
                : 'Confirm collection'}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
