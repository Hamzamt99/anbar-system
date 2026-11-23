import React, { useEffect, useState, useRef } from "react";
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
  const [page, setPage] = useState(1),
    [hasMore, setHasMore] = useState(false);
  const cursors = useRef({ 1: null });
  const queryString = () =>
    new URLSearchParams({
      search,
      limit: 50,
      ...(cursors.current[page] ? { cursor: cursors.current[page] } : {}),
    });
  const accept = (r) => {
    setRows(r.data);
    setHasMore(r.has_more);
    cursors.current[page + 1] = r.next_cursor;
  };
  const type = masterTypes.find((x) => x[0] === tab);
  async function load() {
    setLoading(true);
    try {
      accept(await api(`/${tab}?` + queryString()));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setLoading(true);
    const timer = setTimeout(
      () => {
        api(`/${tab}?` + queryString(), { signal: controller.signal })
          .then((r) => {
            if (alive) {
              accept(r);
              setError("");
            }
          })
          .catch((e) => alive && setError(e.message))
          .finally(() => alive && setLoading(false));
      },
      search ? 180 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [tab, search, page]);
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
              cursors.current = { 1: null };
              setPage(1);
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
          onChange={(e) => {
            cursors.current = { 1: null };
            setPage(1);
            setSearch(e.target.value);
          }}
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
        <table role="table" className="responsive-table">
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
                  <td data-label={type[2]}>{x.name}</td>
                  <td data-label="الإجراءات" className="actions">
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
      {(page > 1 || hasMore) && (
        <div className="pagination">
          <button
            disabled={page === 1 || loading}
            onClick={() => setPage(page - 1)}
          >
            السابق
          </button>
          <span>{page}</span>
          <button
            disabled={!hasMore || loading}
            onClick={() => setPage(page + 1)}
          >
            التالي
          </button>
        </div>
      )}
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
