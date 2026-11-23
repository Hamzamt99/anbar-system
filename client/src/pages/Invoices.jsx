import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, amount } from "../api";
import { useAuth } from "../main";
import { Title, ErrorBox, SearchSelect, Field, Empty } from "../components/UI";
export default function Invoices() {
  const { user } = useAuth(),
    navigate = useNavigate(),
    [rows, setRows] = useState([]),
    [masters] = useState({ customers: [], drivers: [] }),
    [filter, setFilter] = useState({
      customer_id: "",
      driver_id: "",
      from: "",
      to: "",
    }),
    [applied, setApplied] = useState({}),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [printing, setPrinting] = useState(null);
  const canManage = user.role !== "DATA_ENTRY";
  const cursors = useRef({ 1: null });
  const [hasMore, setHasMore] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setLoading(true);
    const q = new URLSearchParams({
      ...applied,
      page,
      count: page === 1 ? "1" : "0",
      ...(cursors.current[page] ? { cursor: cursors.current[page] } : {}),
    });
    api("/invoices?" + q, { signal: controller.signal })
      .then((r) => {
        if (alive) {
          setRows(r.data);
          if (r.total !== undefined) setTotal(r.total);
          cursors.current[page + 1] = r.next_cursor;
          setHasMore(r.has_more);
          setError("");
        }
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      controller.abort();
    };
  }, [applied, page]);
  return (
    <>
      <Title>الفواتير</Title>
      {canManage && (
        <form
          className="filter invoice-filter"
          onSubmit={(e) => {
            e.preventDefault();
            if (filter.from && filter.to && filter.from > filter.to) {
              setError("نطاق التاريخ غير صحيح");
              return;
            }
            cursors.current = { 1: null };
            setApplied(
              Object.fromEntries(Object.entries(filter).filter(([, v]) => v)),
            );
            setPage(1);
          }}
        >
          <SearchSelect
            label="اسم الشركة"
            source="/customers?include_deleted=1"
            items={masters.customers}
            value={filter.customer_id}
            onChange={(v) => setFilter({ ...filter, customer_id: v })}
          />
          <SearchSelect
            label="السائق"
            source="/drivers?include_deleted=1"
            items={masters.drivers}
            value={filter.driver_id}
            onChange={(v) => setFilter({ ...filter, driver_id: v })}
          />
          <Field
            label="من تاريخ"
            type="date"
            value={filter.from}
            onChange={(e) => setFilter({ ...filter, from: e.target.value })}
          />
          <Field
            label="إلى تاريخ"
            type="date"
            value={filter.to}
            onChange={(e) => setFilter({ ...filter, to: e.target.value })}
          />
          <button className="primary">بحث ⌕</button>
        </form>
      )}
      <ErrorBox error={error} />
      <div className="table-wrap">
        <table role="table" className="invoice-table responsive-table">
          <thead>
            <tr>
              {[
                "رقم الفاتورة",
                "التاريخ",
                "اسم الشركة",
                "السائق",
                "نوع الخلطة",
                "حمولة السيارة",
                "الإجراءات",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading || !rows.length ? (
              <Empty loading={loading} columns={7} />
            ) : (
              rows.map((x) => (
                <tr key={x.id}>
                  <td data-label="رقم الفاتورة">
                    <strong dir="ltr">{x.number}</strong>
                  </td>
                  <td data-label="التاريخ">
                    <bdi dir="ltr">{x.date}</bdi>
                  </td>
                  <td data-label="اسم الشركة">{x.customer_name}</td>
                  <td data-label="السائق">{x.driver_name}</td>
                  <td data-label="نوع الخلطة">{x.mix_type_name}</td>
                  <td data-label="حمولة السيارة">
                    <span>
                      <strong>{amount(x.truck_load)}</strong> م³
                    </span>
                  </td>
                  <td data-label="الإجراءات" className="actions">
                    <Link className="button" to={`/invoices/${x.id}`}>
                      عرض
                    </Link>
                    {canManage && (
                      <>
                        <button
                          disabled={printing === x.id}
                          onClick={async () => {
                            setPrinting(x.id);
                            try {
                              await api(`/invoices/${x.id}/print`, {
                                method: "POST",
                                body: {},
                              });
                              navigate(`/invoices/${x.id}/preview?print=1`);
                            } catch (e) {
                              setError(e.message);
                            } finally {
                              setPrinting(null);
                            }
                          }}
                        >
                          طباعة
                        </button>
                        <button
                          className="edit"
                          disabled={!!x.printed_at && user.role === "ADMIN"}
                          onClick={() => navigate(`/invoices/${x.id}/edit`)}
                          title={
                            x.printed_at && user.role === "ADMIN"
                              ? "لا يمكن تعديل الفاتورة بعد طباعتها"
                              : undefined
                          }
                        >
                          تعديل{" "}
                          {x.printed_at && user.role === "ADMIN" ? "🔒" : ""}
                        </button>
                      </>
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
          <button
            disabled={page === 1 || loading}
            onClick={() => setPage(page - 1)}
          >
            السابق
          </button>
          <span>
            {page} / {Math.ceil(total / 20)}
          </span>
          <button
            disabled={!hasMore || loading}
            onClick={() => setPage(page + 1)}
          >
            التالي
          </button>
        </div>
      )}
    </>
  );
}
