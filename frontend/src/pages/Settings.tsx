import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../api';
import { useYear } from '../context/YearContext';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
} from '../components/ui';
import { errorMessage, formatINR } from '../utils/format';

const tabs = [
  { id: 'items', label: 'Fee items' },
  { id: 'types', label: 'Fee types' },
  { id: 'classes', label: 'Classes' },
  { id: 'late-fee', label: 'Late fee' },
];

function getModeLabel(mode?: string) {
  if (mode === 'admission') return 'Admission - initial payment';
  if (mode === 'tuition' || mode === 'enrollment') return 'Tuition fee - monthly basis';
  return 'Collection - pay as you go';
}

export default function Settings({ embedded = false }: { embedded?: boolean }) {
  const [tab, setTab] = useState('items');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const qc = useQueryClient();
  const { selectedYearId, selectedYear } = useYear();

  const { data: feeTypes = [] } = useQuery({
    queryKey: ['fee-types'],
    queryFn: async () => (await settingsApi.feeTypes()).data,
  });
  const { data: classes = [] } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => (await settingsApi.classes()).data,
  });
  const { data: classFees = [] } = useQuery({
    queryKey: ['class-fees', selectedYearId],
    enabled: !!selectedYearId,
    queryFn: async () => (await settingsApi.classFees(selectedYearId)).data,
  });
  const { data: feeItems = [] } = useQuery({
    queryKey: ['settings-fee-items'],
    queryFn: async () => (await settingsApi.feeItems()).data,
  });

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [newClass, setNewClass] = useState('');
  const [itemForm, setItemForm] = useState({
    id: '',
    fee_type_id: '',
    label: '',
    price: '',
  });
  const [typeForm, setTypeForm] = useState({
    name: '',
    mode: 'collection',
    description: '',
  });
  const [lateFeeForm, setLateFeeForm] = useState({
    grace_period_days: '7',
    late_fee_type: 'Flat',
    late_fee_value: '100',
  });
  const { data: lateFeeSetting } = useQuery({
    queryKey: ['late-fee'],
    queryFn: async () => (await settingsApi.lateFee()).data,
  });
  // sync form when setting loads
  React.useEffect(() => {
    if (lateFeeSetting) {
      setLateFeeForm({
        grace_period_days: String(lateFeeSetting.grace_period_days ?? 7),
        late_fee_type: lateFeeSetting.late_fee_type ?? 'Flat',
        late_fee_value: String(lateFeeSetting.late_fee_value ?? 100),
      });
    }
  }, [lateFeeSetting]);
  const saveLateFee = useMutation({
    mutationFn: () =>
      settingsApi.saveLateFee({
        grace_period_days: Number(lateFeeForm.grace_period_days),
        late_fee_type: lateFeeForm.late_fee_type,
        late_fee_value: Number(lateFeeForm.late_fee_value),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['late-fee'] });
      setMsg('Late fee rule saved. Applies to newly overdue tuition bills only.');
      setError('');
    },
    onError: (err: unknown) => setError(errorMessage(err)),
  });

  const saveClassFee = useMutation({
    mutationFn: ({ class_name, monthly_amount }: { class_name: string; monthly_amount: number }) =>
      settingsApi.saveClassFee({
        academic_year_id: selectedYearId,
        class_name,
        monthly_amount,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['class-fees'] });
      setMsg('Tuition price saved (applies to new bills only).');
      setError('');
    },
    onError: (err: unknown) => setError(errorMessage(err)),
  });

  const saveItem = useMutation({
    mutationFn: (data: Record<string, unknown>) => settingsApi.saveFeeItem(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-fee-items'] });
      qc.invalidateQueries({ queryKey: ['fee-items'] });
      setItemForm({ id: '', fee_type_id: '', label: '', price: '' });
      setMsg('Fee item saved.');
    },
    onError: (err: unknown) => setError(errorMessage(err)),
  });

  const retireItem = useMutation({
    mutationFn: (id: string) => settingsApi.retireFeeItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-fee-items'] }),
  });

  const saveType = useMutation({
    mutationFn: (data: Record<string, unknown>) => settingsApi.saveFeeType(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fee-types'] });
      setTypeForm({ name: '', mode: 'collection', description: '' });
      setMsg('Fee type saved.');
    },
    onError: (err: unknown) => setError(errorMessage(err)),
  });

  const retireType = useMutation({
    mutationFn: (id: string) => settingsApi.retireFeeType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-types'] }),
  });

  const deleteType = useMutation({
    mutationFn: (id: string) => settingsApi.deleteFeeType(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fee-types'] });
      qc.invalidateQueries({ queryKey: ['settings-fee-items'] });
      setMsg('Fee type deleted.');
    },
    onError: (err: unknown) => setError(errorMessage(err)),
  });

  const addClassMut = useMutation({
    mutationFn: () => settingsApi.addClass(newClass),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classes'] });
      setNewClass('');
      setMsg('Class added.');
    },
    onError: (err: unknown) => setError(errorMessage(err)),
  });

  const retireClassMut = useMutation({
    mutationFn: (id: string) => settingsApi.retireClass(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['classes'] }),
  });

  const feeByClass = Object.fromEntries(classFees.map((f: { class_name: string; monthly_amount: number }) => [f.class_name, f.monthly_amount]));
  const itemEligibleTypes = feeTypes.filter((t: { mode: string; active?: boolean }) => t.mode !== 'tuition' && t.active !== false);

  return (
    <div>
      {embedded ? null : (
        <PageHeader
          title="Fee settings"
          subtitle="Fee items, tuition prices, and fee types"
        />
      )}
      {msg ? (
        <div className="mb-4">
          <Alert type="success">{msg}</Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setMsg('');
              setError('');
            }}
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

      {tab === 'items' ? (
        <div className="space-y-6">
          {/* Merged Module: Tuition prices by Class */}
          <Card className="p-5">
            <h3 className="mb-2 font-semibold text-primary">Tuition prices (by Class)</h3>
            {!selectedYearId ? (
              <EmptyState message="Select an academic year to set Tuition prices." />
            ) : (
              <>
                <p className="mb-4 text-sm text-muted">
                  Monthly Tuition for <strong>{selectedYear?.year_name}</strong>. Changes do not
                  rewrite existing bills.
                </p>
                <div className="space-y-3">
                  {classes.map((c: { id: string; name: string }) => {
                    const value =
                      amounts[c.name] ??
                      (feeByClass[c.name] !== undefined ? String(feeByClass[c.name]) : '');
                    return (
                      <div key={c.id} className="flex flex-wrap items-end gap-3">
                        <div className="w-24 text-sm font-medium">Class {c.name}</div>
                        <Input
                          label="Monthly amount (₹)"
                          type="number"
                          min="0"
                          className="!w-40"
                          value={value}
                          onChange={(e) =>
                            setAmounts({ ...amounts, [c.name]: e.target.value })
                          }
                        />
                        <Button
                          onClick={() =>
                            saveClassFee.mutate({
                              class_name: c.name,
                              monthly_amount: Number(value),
                            })
                          }
                        >
                          Save
                        </Button>
                        {feeByClass[c.name] !== undefined ? (
                          <span className="text-xs text-muted">
                            Current: {formatINR(feeByClass[c.name])}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>

          {/* General Fee Items (Admission & Collection) */}
          <Card className="p-5">
            <h3 className="mb-3 font-semibold text-primary">Add / update fee item</h3>
            <div className="grid gap-3 md:grid-cols-4">
              <Select
                label="Fee type"
                value={itemForm.fee_type_id}
                onChange={(e) => setItemForm({ ...itemForm, fee_type_id: e.target.value })}
              >
                <option value="">Select</option>
                {itemEligibleTypes.map((t: { id: string; name: string; mode: string }) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({getModeLabel(t.mode)})
                  </option>
                ))}
              </Select>
              <Input
                label="Label"
                value={itemForm.label}
                onChange={(e) => setItemForm({ ...itemForm, label: e.target.value })}
                placeholder="e.g. Size M / Course name"
              />
              <Input
                label="Price (₹)"
                type="number"
                value={itemForm.price}
                onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
              />
              <div className="flex items-end">
                <Button
                  onClick={() =>
                    saveItem.mutate({
                      ...(itemForm.id ? { id: itemForm.id } : {}),
                      fee_type_id: itemForm.fee_type_id,
                      label: itemForm.label,
                      price: Number(itemForm.price),
                    })
                  }
                >
                  Save item
                </Button>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Label</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {feeItems
                  .filter((i: { active?: boolean }) => i.active !== false)
                  .map((i: { id: string; fee_type_id: string; label: string; price: number }) => {
                    const type = feeTypes.find((t: { id: string }) => t.id === i.fee_type_id);
                    return (
                      <tr key={i.id} className="border-t border-border">
                        <td className="px-4 py-3">{type?.name || '—'}</td>
                        <td className="px-4 py-3">{i.label}</td>
                        <td className="px-4 py-3">{formatINR(i.price)}</td>
                        <td className="px-4 py-3">
                          <Button
                            variant="secondary"
                            className="!px-2 !py-1"
                            onClick={() =>
                              setItemForm({
                                id: i.id,
                                fee_type_id: i.fee_type_id,
                                label: i.label,
                                price: String(i.price),
                              })
                            }
                          >
                            Edit
                          </Button>{' '}
                          <Button
                            variant="secondary"
                            className="!px-2 !py-1"
                            onClick={() => retireItem.mutate(i.id)}
                          >
                            Retire
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}

      {tab === 'types' ? (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="grid gap-3 md:grid-cols-4">
              <Input
                label="Name"
                value={typeForm.name}
                onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
              />
              <Select
                label="Mode"
                value={typeForm.mode}
                onChange={(e) => setTypeForm({ ...typeForm, mode: e.target.value })}
              >
                <option value="admission">Admission - initial payment</option>
                <option value="collection">Collection - pay as you go</option>
                <option value="tuition">Tuition fee - monthly basis</option>
              </Select>
              <Input
                label="Description"
                value={typeForm.description}
                onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
              />
              <div className="flex items-end">
                <Button onClick={() => saveType.mutate(typeForm)}>Add fee type</Button>
              </div>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {feeTypes.map((t: { id: string; name: string; mode: string; active?: boolean }) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium text-primary">{t.name}</td>
                    <td className="px-4 py-3 text-muted">{getModeLabel(t.mode)}</td>
                    <td className="px-4 py-3">{t.active === false ? 'No' : 'Yes'}</td>
                    <td className="px-4 py-3">
                      {t.active !== false ? (
                        <Button
                          variant="secondary"
                          className="!px-2 !py-1"
                          onClick={() => retireType.mutate(t.id)}
                        >
                          Retire
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          className="!px-2 !py-1 !text-rose-600 hover:!bg-rose-50 border-rose-200"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to permanently delete the fee type "${t.name}"?`)) {
                              deleteType.mutate(t.id);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}

      {tab === 'classes' ? (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap gap-3">
            <Input
              label="New class / grade"
              value={newClass}
              onChange={(e) => setNewClass(e.target.value)}
              placeholder="e.g. 11"
            />
            <div className="flex items-end">
              <Button onClick={() => addClassMut.mutate()}>Add</Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {classes.map((c: { id: string; name: string }) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-sm"
              >
                Class {c.name}
                <button
                  type="button"
                  className="text-muted hover:text-rose-600"
                  onClick={() => retireClassMut.mutate(c.id)}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === 'late-fee' ? (
        <Card className="p-5">
          <h3 className="mb-1 font-semibold text-primary">Tuition late fee rule</h3>
          <p className="mb-4 text-sm text-muted">
            Single system-wide rule. Applies only to Tuition bills that stay Pending past due date + grace days. Books/Exam/Uniform/Bag never get a late fee (FR-10.1). Existing bills keep their original amounts.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <Input
              label="Grace period (days)"
              type="number"
              min={0}
              value={lateFeeForm.grace_period_days}
              onChange={(e) => setLateFeeForm({ ...lateFeeForm, grace_period_days: e.target.value })}
            />
            <Select
              label="Late fee type"
              value={lateFeeForm.late_fee_type}
              onChange={(e) => setLateFeeForm({ ...lateFeeForm, late_fee_type: e.target.value })}
            >
              <option value="Flat">Flat amount (INR)</option>
              <option value="Percent">Percent of bill (%)</option>
            </Select>
            <Input
              label={lateFeeForm.late_fee_type === 'Percent' ? 'Percent (%)' : 'Flat amount (INR)'}
              type="number"
              min={0}
              step={lateFeeForm.late_fee_type === 'Percent' ? '0.1' : '1'}
              value={lateFeeForm.late_fee_value}
              onChange={(e) => setLateFeeForm({ ...lateFeeForm, late_fee_value: e.target.value })}
            />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={() => saveLateFee.mutate()} disabled={saveLateFee.isPending}>
              {saveLateFee.isPending ? 'Saving…' : 'Save late fee rule'}
            </Button>
            {lateFeeSetting ? (
              <span className="text-sm text-muted">
                Current: {lateFeeSetting.grace_period_days} days · {lateFeeSetting.late_fee_type} {lateFeeSetting.late_fee_value}
                {lateFeeSetting.late_fee_type === 'Percent' ? '%' : ' INR'}
              </span>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-muted">Overdue is computed nightly at 00:15 UTC and whenever the dashboard or tuition grid is opened.</p>
        </Card>
      ) : null}
    </div>
  );
}
