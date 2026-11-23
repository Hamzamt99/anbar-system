import { useCachedPage } from "../components/PageCache";
import React, { useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { amount } from "../api";
import { Title, Field, ErrorBox, Empty, Modal } from "../components/UI";
const actions = {
  CREATE: "إنشاء فاتورة",
  UPDATE: "تعديل فاتورة",
  PRINT: "طباعة فاتورة",
};
const fields = {
  customer_name: "اسم العميل",
  driver_name: "اسم السائق",
  mix_type_name: "نوع الخلطة",
  vehicle_name: "رقم السيارة",
  pump_name: "رقم المضخة",
  mixer_name: "رقم المكسر",
  date: "التاريخ",
  pour_location: "مكان الصب",
  requested: "الكمية المطلوبة",
  truck_load: "حمولة السيارة",
  departure: "ساعة مغادرة المصنع",
  arrival: "ساعة الوصول إلى موقع الصب",
  factory_arrival: "ساعة الوصول إلى المصنع",
  finish: "ساعة انتهاء تفريغ الحمولة",
  chemicals: "المواد الكيميائية",
  added_water: "زيادة الماء حسب طلب العميل",
  receiver: "اسم المستلم",
  printed_at: "تاريخ الطباعة",
};
const timestamp = (v) =>
  new Intl.DateTimeFormat("ar-JO", {
    timeZone: "Asia/Amman",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(v));
const display = (key, value) =>
  value === null || value === undefined || value === ""
    ? "—"
    : key === "printed_at"
      ? timestamp(value)
      : ["requested", "truck_load"].includes(key)
        ? amount(value / 1000)
        : value;
export default function AuditLogs() {
  const [params] = useSearchParams();
  const initial = {
    invoice_id: params.get("invoice_id") || "",
    email: "",
    action: "",
    from: "",
    to: "",
  };
  const [filter, setFilter] = useState(initial),
    [applied, setApplied] = useState(initial),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(null);
  const cursors = useRef({ 1: null });
  const query = new URLSearchParams(
    Object.entries({
      ...applied,
      page,
      count: page === 1 ? "1" : "0",
      ...(cursors.current[page] ? { cursor: cursors.current[page] } : {}),
    }).filter(([, value]) => value !== ""),
  );
  const {
    result,
    total: cachedTotal,
    loading,
    error: loadError,
    retry,
  } = useCachedPage("/audit-logs?" + query, () => {
    cursors.current = { 1: null };
    setPage(1);
  });
  const rows = result?.data || [],
    hasMore = result?.has_more || false;
  const total = cachedTotal || 0;
  if (result) cursors.current[page + 1] = result.next_cursor;
  const change = (key) => (e) =>
    setFilter({ ...filter, [key]: e.target.value });
  const changes = selected
    ? Object.entries(fields).filter(
        ([key]) =>
          selected.action === "CREATE" ||
          selected.before?.[key] !== selected.after[key],
      )
    : [];
  return (
    <>
      <Title subtitle="متابعة إنشاء الفواتير وتعديلها وطباعتها حسب المستخدم">
        سجل العمليات
      </Title>
      <form
        className="filter audit-filter"
        onSubmit={(e) => {
          e.preventDefault();
          if (filter.from && filter.to && filter.from > filter.to) {
            setError("نطاق التاريخ غير صحيح");
            return;
          }
          setError("");
          cursors.current = { 1: null };
          setApplied({ ...filter });
          setPage(1);
        }}
      >
        <Field
          label="رقم الفاتورة"
          type="number"
          min="1"
          step="1"
          value={filter.invoice_id}
          onChange={change("invoice_id")}
        />
        <Field
          label="البريد الإلكتروني"
          dir="ltr"
          maxLength={254}
          value={filter.email}
          onChange={change("email")}
        />
        <Field label="الإجراء">
          <select value={filter.action} onChange={change("action")}>
            <option value="">جميع الإجراءات</option>
            {Object.entries(actions).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="من تاريخ"
          type="date"
          value={filter.from}
          onChange={change("from")}
        />
        <Field
          label="إلى تاريخ"
          type="date"
          value={filter.to}
          onChange={change("to")}
        />
        <button className="primary">بحث</button>
      </form>
      <ErrorBox error={error || loadError} />
      {loadError && <button onClick={retry}>إعادة المحاولة</button>}
      <div className="table-wrap">
        <table role="table" className="responsive-table">
          <thead>
            <tr>
              {[
                "التاريخ والوقت",
                "البريد الإلكتروني",
                "رقم الفاتورة",
                "الإجراء",
                "التفاصيل",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading || !rows.length ? (
              <Empty loading={loading} columns={5} />
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td data-label="التاريخ والوقت">
                    {timestamp(row.created_at)}
                  </td>
                  <td data-label="البريد الإلكتروني">
                    <bdi dir="ltr">{row.actor_email}</bdi>
                  </td>
                  <td data-label="رقم الفاتورة">
                    <Link
                      dir="ltr"
                      to={`/invoices/${row.invoice_id}`}
                    >{`INV-${String(row.invoice_id).padStart(6, "0")}`}</Link>
                  </td>
                  <td data-label="الإجراء">
                    <span className="badge">{actions[row.action]}</span>
                  </td>
                  <td data-label="التفاصيل" className="actions">
                    <button onClick={() => setSelected(row)}>
                      عرض التفاصيل
                    </button>
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
      {selected && (
        <Modal
          title={actions[selected.action]}
          onClose={() => setSelected(null)}
        >
          <p dir="ltr">{selected.actor_email}</p>
          <p>{timestamp(selected.created_at)}</p>
          {changes.length ? (
            <div className="table-wrap audit-changes">
              <table>
                <thead>
                  <tr>
                    <th>الحقل</th>
                    <th>قبل</th>
                    <th>بعد</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map(([key, label]) => (
                    <tr key={key}>
                      <td>{label}</td>
                      <td>{display(key, selected.before?.[key])}</td>
                      <td>{display(key, selected.after[key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>تمت العملية دون تغيير القيم المعروضة</p>
          )}
        </Modal>
      )}
    </>
  );
}
