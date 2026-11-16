import React, { useEffect, useState } from "react";
import { api, masterTypes } from "../api";
import {
  Title,
  ErrorBox,
  Modal,
  Confirm,
  Field,
  Empty,
} from "../components/UI";
export default function Master() {
  const [tab, setTab] = useState("customers"),
    [search, setSearch] = useState(""),
    [rows, setRows] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [edit, setEdit] = useState(null),
    [remove, setRemove] = useState(null),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState("");
  const type = masterTypes.find((x) => x[0] === tab);
  async function load() {
    setLoading(true);
    try {
      setRows((await api(`/${tab}?search=${encodeURIComponent(search)}`)).data);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api(`/${tab}?search=${encodeURIComponent(search)}`)
        .then((r) => {
          if (alive) {
            setRows(r.data);
            setError("");
          }
        })
        .catch((e) => alive && setError(e.message))
        .finally(() => alive && setLoading(false));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [tab, search]);
  return (
    <>
      <Title subtitle="إدارة البيانات المستخدمة في الفواتير">
        البيانات الأساسية
      </Title>
      <div className="tabs">
        {masterTypes.map((x) => (
          <button
            className={tab === x[0] ? "active" : ""}
            key={x[0]}
            onClick={() => {
              setTab(x[0]);
              setSearch("");
            }}
          >
            {x[1]}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input
          aria-label="بحث"
          className="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`بحث عن ${type[3]}...`}
        />
        <button
          className="primary"
          onClick={() => {
            setEdit({ name: "" });
            setFormError("");
          }}
        >
          ⊕ إضافة {type[3]}
        </button>
      </div>
      <ErrorBox error={error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{type[2]}</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading || !rows.length ? (
              <Empty loading={loading} columns={2} />
            ) : (
              rows.map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td className="actions">
                    <button
                      onClick={() => {
                        setEdit(x);
                        setFormError("");
                      }}
                    >
                      تعديل
                    </button>
                    <button className="danger" onClick={() => setRemove(x)}>
                      حذف
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal
          title={`${edit.id ? "تعديل" : "إضافة"} ${type[3]}`}
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api(`/${tab}${edit.id ? "/" + edit.id : ""}`, {
                  method: edit.id ? "PUT" : "POST",
                  body: { name: edit.name },
                });
                setEdit(null);
                await load();
              } catch (e) {
                setFormError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label={type[2]}
              required
              value={edit.name}
              maxLength={200}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
            <ErrorBox error={formError} />
            <div className="buttons">
              <button className="primary" disabled={busy}>
                حفظ
              </button>
              <button type="button" onClick={() => setEdit(null)}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}
      {remove && (
        <Confirm
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            await api(`/${tab}/${remove.id}`, { method: "DELETE", body: {} });
            await load();
          }}
        />
      )}
    </>
  );
}
