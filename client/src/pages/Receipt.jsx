import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, amount } from "../api";
import { useAuth } from "../main";
import { ErrorBox } from "../components/UI";
import { quantityWords } from "../components/quantityWords";
export default function Receipt() {
  const { id } = useParams(),
    { user } = useAuth(),
    location = useLocation(),
    [row, setRow] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    printed = useRef(false);
  useEffect(() => {
    let alive = true;
    api("/invoices/" + id)
      .then((r) => alive && setRow(r.data))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);
  useEffect(() => {
    if (row && location.search.includes("print=1") && !printed.current) {
      printed.current = true;
      document.fonts.ready.then(() => window.print());
    }
  }, [row, location.search]);
  async function print() {
    setBusy(true);
    try {
      setRow(
        (await api(`/invoices/${id}/print`, { method: "POST", body: {} })).data,
      );
      await document.fonts.ready;
      window.print();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const line = (label, value) => (
    <div className="receipt-line" key={label}>
      <span>{label} :</span>
      <strong>{value || " "}</strong>
    </div>
  );
  return (
    <>
      <div className="receipt-controls">
        {user.role === "SUPER_ADMIN" && (
          <Link className="button" to={`/audit-logs?invoice_id=${id}`}>
            سجل العمليات
          </Link>
        )}
        <Link className="button" to="/invoices">
          الفواتير
        </Link>
        <Link className="button" to={`/invoices/${id}/preview`}>
          معاينة الطباعة
        </Link>
        {user.role !== "DATA_ENTRY" && (
          <button className="primary" disabled={busy || !row} onClick={print}>
            طباعة
          </button>
        )}
        {row && user.role !== "DATA_ENTRY" && (
          <Link
            aria-disabled={row.printed_at && user.role === "ADMIN"}
            className={`button ${row.printed_at && user.role === "ADMIN" ? "disabled" : ""}`}
            to={`/invoices/${id}/edit`}
          >
            تعديل
          </Link>
        )}
      </div>
      <ErrorBox error={error} />
      {!row && !error && <p>جارٍ التحميل...</p>}
      {row && (
        <article className="receipt">
          <div className="receipt-heading">
            <h1>شهادة استلام</h1>
            <b>شركة العنبر للخرسانة</b>
          </div>
          <div className="receipt-main">
            <div className="receipt-data">
              {[
                ["رقم الفاتورة", <bdi dir="ltr">{row.number}</bdi>],
                ["التاريخ", row.date.split("-").reverse().join("/")],
                ["اسم المستهلك", row.customer_name],
                ["مكان الصب", row.pour_location],
                ["الكمية المطلوبة", amount(row.requested)],
                ["نوع الخلطة", row.mix_type_name],
                ["اسم السائق", row.driver_name],
                ["رقم السيارة", row.vehicle_name],
                ["رقم المضخة", row.pump_name],
              ].map(([l, v]) => line(l, v))}
            </div>
            <div className="receipt-quantities">
              <table>
                <tbody>
                  {[
                    ["الواصل سابقاً", row.previous],
                    ["حمولة السيارة", row.truck_load],
                    ["المجموع التراكمي", row.cumulative],
                  ].map(([l, v]) => (
                    <tr key={l}>
                      <td>{l}</td>
                      <td>
                        {amount(v)}
                        {l === "المجموع التراكمي" ? " م³" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>المجموع النهائي كتابة :</p>
              <div className="words">{quantityWords(row.cumulative)}</div>
            </div>
          </div>
          <div className="receipt-times">
            {line("ساعة مغادرة المصنع", row.departure)}
            {line("ساعة الوصول إلى موقع الصب", row.arrival)}
            {line("ساعة انتهاء تفريغ الحمولة", row.finish)}
          </div>
          <div className="receipt-additional">
            {line("زيادة الماء حسب طلب العميل", row.added_water)}
            {line("المواد الكيميائية", row.chemicals)}
          </div>
          <p className="declaration">
            أنا الموقع أدناه استلمت الكمية المذكورة أعلاه
          </p>
          <div className="signatures">
            <div>
              اسم المستلم<strong>{row.receiver}</strong>
            </div>
            <div>
              توقيع المستلم<strong> </strong>
            </div>
          </div>
        </article>
      )}
    </>
  );
}
