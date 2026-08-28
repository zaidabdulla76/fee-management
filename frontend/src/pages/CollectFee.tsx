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
import { downloadAuthed, errorMessage, formatINR, todayISO } from '../utils/format';

export default function CollectFee() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const { selectedYearId, selectedYear } = useYear();
  const [studentId, setStudentId] = useState(params.get('studentId') || '');
  const [feeTypeId, setFeeTypeId] = useState('');
  const [feeItemId, setFeeItemId] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentMode, setPaymentMode] = useState('cash');
  const [receiptNo, setReceiptNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const { data: students = [] } = useQuery({
    queryKey: ['students', 'Active'],
    queryFn: async () => (await studentsApi.list({ status: 'Active' })).data,
  });

  const { data: feeTypes = [] } = useQuery({
    queryKey: ['fee-types'],
    queryFn: async () => (await settingsApi.feeTypes()).data,
  });

  const collectionTypes = useMemo(
    () => feeTypes.filter((t) => t.mode === 'collection' && t.active !== false),
    [feeTypes]
  );

  const selectedType = collectionTypes.find((t) => t.id === feeTypeId);

  const { data: feeItems = [] } = useQuery({
    queryKey: ['fee-items', feeTypeId],
    enabled: !!feeTypeId,
    queryFn: async () => (await billingApi.feeItems(feeTypeId)).data,
  });

  useEffect(() => {
    if (!feeTypeId && collectionTypes[0]) setFeeTypeId(collectionTypes[0].id);
  }, [collectionTypes, feeTypeId]);

  useEffect(() => {
    setFeeItemId('');
    if (feeItems.length === 1) setFeeItemId(feeItems[0].id);
  }, [feeTypeId, feeItems]);

  const selectedItem = feeItems.find((i) => i.id === feeItemId);
  const needsItemPicker =
    selectedType &&
    !['Exam', 'Bag'].includes(selectedType.name) &&
    feeItems.length > 1;

  const collectMut = useMutation({
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
      setSuccess(res.data);
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setRemarks('');
      setReceiptNo('');
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div>
      <PageHeader
        title="Collect fees"
        subtitle="Record books, exam, uniform, or bag fees — payment is saved right away"
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
                Collected {formatINR(success.payment.amount)} — {success.payment.receipt_no}.{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    downloadAuthed(
                      billingApi.receiptUrl(success.payment.id),
                      `${success.payment.receipt_no}.pdf`
                    )
                  }
                >
                  Download receipt
                </button>
              </Alert>
            </div>
          ) : null}

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!studentId) {
                setError('Select a student first.');
                return;
              }
              setError('');
              setSuccess(null);
              collectMut.mutate();
            }}
          >
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
              {collectionTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>

            {needsItemPicker ? (
              <Select
                label={selectedType?.name === 'Uniform' ? 'Size' : 'Course / Book'}
                value={feeItemId}
                onChange={(e) => setFeeItemId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {feeItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label} — {formatINR(i.price)}
                  </option>
                ))}
              </Select>
            ) : selectedItem ? (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                Item: <strong>{selectedItem.label}</strong>
              </div>
            ) : null}

            <div className="rounded-lg border border-border bg-accent-soft px-4 py-3">
              <p className="text-sm text-muted">Amount (from Settings)</p>
              <p className="text-2xl font-semibold text-primary">
                {selectedItem ? formatINR(selectedItem.price) : '—'}
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
              label="Mode"
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
            >
              <option value="cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="bank">Bank</option>
            </Select>
            <Input
              label="Receipt no (optional)"
              value={receiptNo}
              onChange={(e) => setReceiptNo(e.target.value)}
            />
            <Textarea
              label="Remarks"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />

            <Button
              type="submit"
              className="w-full"
              disabled={
                collectMut.isPending ||
                !studentId ||
                !feeItemId ||
                selectedYear?.status === 'Frozen'
              }
            >
              {collectMut.isPending ? 'Recording…' : 'Confirm collection'}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
