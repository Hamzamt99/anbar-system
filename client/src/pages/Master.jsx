import { useMasterCache } from "../components/MasterCache";
import React, {
  useEffect,
  useState,
  useRef,
  useSyncExternalStore,
} from "react";
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
    [edit, setEdit] = useState(null),
    [remove, setRemove] = useState(null),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState("");
  const [page, setPage] = useState(1);
  const cursors = useRef({ 1: null });
  const cache = useMasterCache();
  const revision = useSyncExternalStore(cache.subscribe, cache.snapshot);
  const cursor = cursors.current[page] || null;
  const result = cache.read(tab, search, cursor);
  const rows = result?.data || [];
  const loading = !result || result.status === "loading";
  const error = result?.error || "";
  const hasMore = result?.has_more || false;
  if (result?.status === "ready")
    cursors.current[page + 1] = result.next_cursor;
  const type = masterTypes.find((x) => x[0] === tab);
  async function load() {
    cursors.current = { 1: null };
    setPage(1);
    await cache.fetch(tab, search);
  }
  useEffect(() => {
    // Warm the six bounded first pages once per authenticated page lifetime.
    for (const [path] of masterTypes) void cache.fetch(path);
  }, [cache]);
  useEffect(() => {
    if (result) return;
    if (!search) {
      void cache.fetch(tab, search, cursor);
      return;
    }
    const timer = setTimeout(() => void cache.fetch(tab, search, cursor), 180);
    return () => clearTimeout(timer);
  }, [cache, tab, search, cursor, revision]);
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
      {error && (
        <button
          onClick={() => {
            cache.invalidate(tab);
            void cache.fetch(tab, search, cursor);
          }}
        >
          إعادة المحاولة
        </button>
      )}
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
