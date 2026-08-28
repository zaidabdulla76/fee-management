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

const emptyForm = {
  name: '',
  father_name: '',
  phone: '',
  class: '',
  admission_date: todayISO(),
};

function matchesStudent(s, term) {
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
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  // Load by status from API; filter search on the client so typing feels instant
  const { data: students = [], isLoading, isFetching } = useQuery({
    queryKey: ['students', status],
    queryFn: async () =>
      (await studentsApi.list({ status: status || undefined })).data,
  });

  const filtered = useMemo(
    () => students.filter((s) => matchesStudent(s, deferredQ)),
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
    onError: (err) => setError(errorMessage(err)),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status: next }) => studentsApi.setStatus(id, next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const classOptions = useMemo(() => classes.map((c) => c.name), [classes]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, class: classOptions[0] || '' });
    setError('');
    setOpen(true);
  }

  function openEdit(student) {
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

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Find a student by name, phone, ID, or class"
        actions={<Button onClick={openCreate}>Add student</Button>}
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
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium text-accent">
                    <Link to={`/students/${s.id}`} className="hover:underline">
                      {s.student_code}
                    </Link>
                  </td>
                  <td>{s.name}</td>
                  <td className="text-muted">{s.father_name || '—'}</td>
                  <td>{s.phone || '—'}</td>
                  <td>{s.class}</td>
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
            <option value="">Select class</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>
                {c}
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
    </div>
  );
}
