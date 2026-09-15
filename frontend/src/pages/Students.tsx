import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi, studentsApi } from '../api';
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
} from '../components/ui';
import { errorMessage, formatDate, todayISO } from '../utils/format';

interface StudentData {
  id: string;
  student_code: string;
  name: string;
  father_name?: string;
  phone?: string;
  class: string;
  admission_date?: string;
  status: string;
}

const emptyForm = {
  name: '',
  father_name: '',
  phone: '',
  class: '',
  admission_date: todayISO(),
};

function matchesStudent(s: StudentData, term: string) {
  if (!term) return true;
  const t = term.toLowerCase();
  return [s.name, s.phone, s.student_code, s.class, s.father_name]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(t));
}

export default function Students() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const deferredQ = useDeferredValue(q.trim());
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteTargetClass, setPromoteTargetClass] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<StudentData | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const { data: students = [], isLoading, isFetching } = useQuery({
    queryKey: ['students', status],
    queryFn: async () =>
      (await studentsApi.list({ status: status || undefined })).data,
  });

  const filtered = useMemo(
    () => students.filter((s: StudentData) => matchesStudent(s, deferredQ)),
    [students, deferredQ]
  );

  const { data: classes = [] } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => (await settingsApi.classes()).data,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editing) return studentsApi.update(editing.id, form);
      return studentsApi.create(form);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (!editing && res.data.warning) setWarning(res.data.warning);
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (err: unknown) => setError(errorMessage(err)),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status: next }: { id: string; status: string }) =>
      studentsApi.setStatus(id, next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const promoteMut = useMutation({
    mutationFn: () =>
      studentsApi.promote({
        student_ids: selectedIds,
        target_class: promoteTargetClass || undefined,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setSelectedIds([]);
      setPromoteOpen(false);
      setWarning(`Successfully promoted ${res.data.promoted_count} student(s)!`);
    },
    onError: (err: unknown) => setError(errorMessage(err)),
  });

  const classOptions = useMemo(() => classes.map((c: { name: string }) => c.name), [classes]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, class: classOptions[0] || '' });
    setError('');
    setOpen(true);
  }

  function openEdit(student: StudentData) {
    setEditing(student);
    setForm({
      name: student.name,
      father_name: student.father_name || '',
      phone: student.phone || '',
      class: student.class,
      admission_date: student.admission_date || todayISO(),
    });
    setError('');
    setOpen(true);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((s: StudentData) => s.id));
    }
  }

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Find a student by name, phone, ID, or class"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={selectedIds.length === 0}
              onClick={() => {
                setError('');
                setPromoteOpen(true);
              }}
            >
              Promote to next class {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
            </Button>
            <Button onClick={openCreate}>Add student</Button>
          </div>
        }
      />
      {warning ? (
        <div className="mb-4">
          <Alert type="warning">{warning}</Alert>
        </div>
      ) : null}
      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            id="student-search"
            label="Search"
            placeholder="Type a name, phone, ID, or class…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
          <Select
            id="student-status"
            label="Show"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All students</option>
            <option value="Active">Active only</option>
            <option value="Inactive">Inactive only</option>
          </Select>
        </div>
        {q ? (
          <p className="mt-2 text-xs text-muted">
            Showing {filtered.length} of {students.length}
            {isFetching ? ' · updating…' : ''}
          </p>
        ) : null}
      </Card>

      {isLoading ? (
        <EmptyState message="Loading students…" />
      ) : !filtered.length ? (
        <EmptyState
          title={q ? 'No matches' : 'No students yet'}
          message={
            q
              ? `Nothing matched “${q}”. Try another name or clear the search.`
              : 'Add your first student to get started.'
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10 px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                    checked={filtered.length > 0 && selectedIds.length === filtered.length}
                    onChange={toggleSelectAll}
                    title="Select all"
                  />
                </th>
                <th>ID</th>
                <th>Name</th>
                <th>Father</th>
                <th>Phone</th>
                <th>Class</th>
                <th>Admitted</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: StudentData) => (
                <tr key={s.id} className={selectedIds.includes(s.id) ? 'bg-teal-50/50' : ''}>
                  <td className="w-10 px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                      checked={selectedIds.includes(s.id)}
                      onChange={() => toggleSelect(s.id)}
                    />
                  </td>
                  <td className="font-medium text-accent">
                    <Link to={`/students/${s.id}`} className="hover:underline">
                      {s.student_code}
                    </Link>
                  </td>
                  <td className="font-medium text-primary">{s.name}</td>
                  <td className="text-muted">{s.father_name || '—'}</td>
                  <td>{s.phone || '—'}</td>
                  <td>
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                      Class {s.class}
                    </span>
                  </td>
                  <td>{formatDate(s.admission_date)}</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(s)}>
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          statusMut.mutate({
                            id: s.id,
                            status: s.status === 'Active' ? 'Inactive' : 'Active',
                          })
                        }
                      >
                        {s.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Edit / Add Modal */}
      <Modal
        open={open}
        title={editing ? 'Edit student' : 'Add student'}
        onClose={() => setOpen(false)}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            saveMut.mutate();
          }}
        >
          {error ? <Alert>{error}</Alert> : null}
          <Input
            label="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Father's name"
            value={form.father_name}
            onChange={(e) => setForm({ ...form, father_name: e.target.value })}
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Select
            label="Class"
            value={form.class}
            onChange={(e) => setForm({ ...form, class: e.target.value })}
            required
          >
            {classOptions.map((c: string) => (
              <option key={c} value={c}>
                Class {c}
              </option>
            ))}
          </Select>
          <Input
            label="Admission date"
            type="date"
            value={form.admission_date}
            onChange={(e) => setForm({ ...form, admission_date: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMut.isPending}>
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Promotion Modal */}
      <Modal
        open={promoteOpen}
        title={`Promote to next class (${selectedIds.length} selected)`}
        onClose={() => setPromoteOpen(false)}
      >
        <div className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <p className="text-sm text-muted">
            You are about to promote <strong>{selectedIds.length}</strong> student(s). You can
            auto-advance them to the next sequence class or pick a specific target class.
          </p>

          <Select
            label="Target class (optional)"
            value={promoteTargetClass}
            onChange={(e) => setPromoteTargetClass(e.target.value)}
          >
            <option value="">Auto-advance to next sequential class</option>
            {classes.map((c: { id: string; name: string }) => (
              <option key={c.id} value={c.name}>
                Promote all to Class {c.name}
              </option>
            ))}
          </Select>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPromoteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              onClick={() => promoteMut.mutate()}
              disabled={promoteMut.isPending || selectedIds.length === 0}
            >
              {promoteMut.isPending ? 'Promoting…' : 'Confirm promotion'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
