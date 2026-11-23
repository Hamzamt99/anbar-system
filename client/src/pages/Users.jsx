import React, { useEffect, useState } from "react";
import { useAuth } from "../main";
import { api, roles } from "../api";
import {
  Title,
  ErrorBox,
  Modal,
  Confirm,
  Field,
  Empty,
} from "../components/UI";
const initial = { email: "", password: "", role: "DATA_ENTRY" };
function UserFields({ value, onChange, edit = false, lockRole = false }) {
  return (
    <>
      <Field
        label="البريد الإلكتروني"
        type="email"
        dir="ltr"
        required
        value={value.email}
        onChange={(e) => onChange({ ...value, email: e.target.value })}
      />
      {!edit && (
        <Field
          label="كلمة المرور المؤقتة"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          value={value.password}
          onChange={(e) => onChange({ ...value, password: e.target.value })}
        />
      )}
      <Field label="الدور">
        <select
          value={value.role}
          disabled={lockRole}
          title={
            lockRole
              ? "لا يمكن تخفيض دور مدير النظام العام من خلال النظام"
              : undefined
          }
          onChange={(e) => onChange({ ...value, role: e.target.value })}
        >
          {Object.entries(roles).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}
export default function Users() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]),
    [form, setForm] = useState(initial),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState(null),
    [reset, setReset] = useState(null),
    [remove, setRemove] = useState(null),
    [modalError, setModalError] = useState("");
  const [page, setPage] = useState(1),
    [total, setTotal] = useState(0);
  async function load() {
    try {
      const result = await api("/users?page=" + page);
      setRows(result.data);
      setTotal(result.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [page]);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/users", { method: "POST", body: form });
      setForm(initial);
      setError("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Title subtitle="إضافة المستخدمين وتحديد صلاحياتهم">
        إدارة المستخدمين
      </Title>
      <form className="filter user-form" onSubmit={save}>
        <UserFields value={form} onChange={setForm} />
        <button className="primary" disabled={busy}>
          إضافة مستخدم
        </button>
      </form>
      <ErrorBox error={error} />
      <div className="table-wrap">
        <table role="table" className="responsive-table">
          <thead>
            <tr>
              <th>البريد الإلكتروني</th>
              <th>الدور</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading || !rows.length ? (
              <Empty loading={loading} columns={3} />
            ) : (
              rows.map((x) => (
                <tr key={x.id}>
                  <td data-label="البريد الإلكتروني">
                    <bdi dir="ltr">{x.email}</bdi>
                  </td>
                  <td data-label="الدور">
                    <span className="badge">{roles[x.role]}</span>
                  </td>
                  <td data-label="الإجراءات" className="actions">
                    {x.role !== "SUPER_ADMIN" || x.id === user.id ? (
                      <>
                        <button
                          onClick={() => {
                            setEdit({
                              ...x,
                              protectedRole: x.role === "SUPER_ADMIN",
                            });
                            setModalError("");
                          }}
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => {
                            setReset({ ...x, password: "" });
                            setModalError("");
                          }}
                        >
                          إعادة تعيين كلمة المرور
                        </button>
                      </>
                    ) : (
                      <span className="badge">حساب محمي</span>
                    )}
                    {x.id !== user.id && x.role !== "SUPER_ADMIN" && (
                      <button className="danger" onClick={() => setRemove(x)}>
                        حذف
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {total > 20 && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            السابق
          </button>
          <span>
            {page} / {Math.ceil(total / 20)}
          </span>
          <button
            disabled={page * 20 >= total}
            onClick={() => setPage(page + 1)}
          >
            التالي
          </button>
        </div>
      )}
      {edit && (
        <Modal title="تعديل مستخدم" onClose={() => setEdit(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api(`/users/${edit.id}`, {
                  method: "PUT",
                  body: { email: edit.email, role: edit.role },
                });
                setEdit(null);
                await load();
              } catch (e) {
                setModalError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <UserFields
              edit
              value={edit}
              onChange={setEdit}
              lockRole={edit.protectedRole}
            />
            <ErrorBox error={modalError} />
            <div className="buttons">
              <button className="primary" disabled={busy}>
                حفظ
              </button>
            </div>
          </form>
        </Modal>
      )}
      {reset && (
        <Modal title="إعادة تعيين كلمة المرور" onClose={() => setReset(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api(`/users/${reset.id}/password`, {
                  method: "POST",
                  body: { password: reset.password },
                });
                setReset(null);
              } catch (e) {
                setModalError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="كلمة المرور المؤقتة"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              value={reset.password}
              onChange={(e) => setReset({ ...reset, password: e.target.value })}
            />
            <ErrorBox error={modalError} />
            <div className="buttons">
              <button className="primary" disabled={busy}>
                حفظ
              </button>
            </div>
          </form>
        </Modal>
      )}
      {remove && (
        <Confirm
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            await api(`/users/${remove.id}`, { method: "DELETE", body: {} });
            await load();
          }}
        />
      )}
    </>
  );
}
