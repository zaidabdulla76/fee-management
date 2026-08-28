import { useState } from 'react';
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
  { id: 'tuition', label: 'Tuition prices' },
  { id: 'items', label: 'Fee items' },
  { id: 'late', label: 'Late fee' },
  { id: 'types', label: 'Fee types' },
  { id: 'classes', label: 'Classes' },
];

export default function Settings({ embedded = false }) {
  const [tab, setTab] = useState('tuition');
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
  const { data: lateFee } = useQuery({
    queryKey: ['late-fee'],
    queryFn: async () => (await settingsApi.lateFee()).data,
  });

  const [amounts, setAmounts] = useState({});
  const [newClass, setNewClass] = useState('');
  const [lateForm, setLateForm] = useState(null);
  const [itemForm, setItemForm] = useState({
    fee_type_id: '',
    label: '',
    price: '',
  });
  const [typeForm, setTypeForm] = useState({
    name: '',
    mode: 'collection',
    description: '',
  });

  const saveClassFee = useMutation({
    mutationFn: ({ class_name, monthly_amount }) =>
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
    onError: (err) => setError(errorMessage(err)),
  });

  const saveLate = useMutation({
    mutationFn: (data) => settingsApi.saveLateFee(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['late-fee'] });
      setMsg('Late fee rule updated.');
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const saveItem = useMutation({
    mutationFn: (data) => settingsApi.saveFeeItem(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-fee-items'] });
      qc.invalidateQueries({ queryKey: ['fee-items'] });
      setItemForm({ fee_type_id: '', label: '', price: '' });
      setMsg('Fee item saved.');
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const retireItem = useMutation({
    mutationFn: (id) => settingsApi.retireFeeItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-fee-items'] }),
  });

  const saveType = useMutation({
    mutationFn: (data) => settingsApi.saveFeeType(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fee-types'] });
      setTypeForm({ name: '', mode: 'collection', description: '' });
      setMsg('Fee type saved.');
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const retireType = useMutation({
    mutationFn: (id) => settingsApi.retireFeeType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-types'] }),
  });

  const addClassMut = useMutation({
    mutationFn: () => settingsApi.addClass(newClass),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classes'] });
      setNewClass('');
      setMsg('Class added.');
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const retireClassMut = useMutation({
    mutationFn: (id) => settingsApi.retireClass(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['classes'] }),
  });

  const feeByClass = Object.fromEntries(classFees.map((f) => [f.class_name, f.monthly_amount]));
  const collectionTypes = feeTypes.filter((t) => t.mode === 'collection');
  const late = lateForm || lateFee || {
    grace_period_days: 7,
    late_fee_type: 'Flat',
    late_fee_value: 100,
  };

  return (
    <div>
      {embedded ? null : (
        <PageHeader
          title="Fee settings"
          subtitle="Tuition prices, other fees, and late-fee rules"
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

      {tab === 'tuition' ? (
        <Card className="p-5">
          {!selectedYearId ? (
            <EmptyState message="Select an academic year to set Tuition prices." />
          ) : (
            <>
              <p className="mb-4 text-sm text-muted">
                Monthly Tuition for <strong>{selectedYear?.year_name}</strong>. Changes do not
                rewrite existing bills.
              </p>
              <div className="space-y-3">
                {classes.map((c) => {
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
      ) : null}

      {tab === 'items' ? (
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="mb-3 font-semibold text-primary">Add / update fee item</h3>
            <div className="grid gap-3 md:grid-cols-4">
              <Select
                label="Fee type"
                value={itemForm.fee_type_id}
                onChange={(e) => setItemForm({ ...itemForm, fee_type_id: e.target.value })}
              >
                <option value="">Select</option>
                {collectionTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
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
                      ...itemForm,
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
              <thead className="">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Label</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {feeItems
                  .filter((i) => i.active !== false)
                  .map((i) => {
                    const type = feeTypes.find((t) => t.id === i.fee_type_id);
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

      {tab === 'late' ? (
        <Card className="max-w-lg p-5">
          <div className="space-y-4">
            <Input
              label="Grace period (days after due date)"
              type="number"
              min="0"
              value={late.grace_period_days}
              onChange={(e) =>
                setLateForm({ ...late, grace_period_days: Number(e.target.value) })
              }
            />
            <Select
              label="Late fee type"
              value={late.late_fee_type}
              onChange={(e) => setLateForm({ ...late, late_fee_type: e.target.value })}
            >
              <option value="Flat">Flat (₹)</option>
              <option value="Percent">Percent (%)</option>
            </Select>
            <Input
              label={late.late_fee_type === 'Percent' ? 'Percent value' : 'Flat amount (₹)'}
              type="number"
              min="0"
              value={late.late_fee_value}
              onChange={(e) =>
                setLateForm({ ...late, late_fee_value: Number(e.target.value) })
              }
            />
            <Button onClick={() => saveLate.mutate(late)}>Save late fee rule</Button>
          </div>
        </Card>
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
                <option value="enrollment">Enrollment (Tuition-style)</option>
                <option value="collection">Collection (pay-as-you-go)</option>
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
              <thead className="">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {feeTypes.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-3">{t.name}</td>
                    <td className="px-4 py-3 capitalize">{t.mode}</td>
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
                        '—'
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
            {classes.map((c) => (
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
    </div>
  );
}
