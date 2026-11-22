import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, masterTypes, amount } from "../api";
import { addDepartureOffset } from "../../../shared/time.js";
import { useAuth } from "../main";
import { Title, Field, SearchSelect, ErrorBox } from "../components/UI";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Amman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const initial = () => ({
  customer_id: "",
  driver_id: "",
  mix_type_id: "",
  vehicle_id: "",
  pump_id: "",
  mixer_id: "",
  date: today(),
  pour_location: "",
  requested: "",
  truck_load: "",
  departure: "",
  arrival: "",
  factory_arrival: "",
  finish: "",
  chemicals: "",
  added_water: "",
  receiver: "",
});
const refs = [
  ["customer_id", "customers", "اسم العميل"],
  ["mix_type_id", "mix-types", "نوع الخلطة"],
  ["driver_id", "drivers", "اسم السائق"],
  ["vehicle_id", "vehicles", "رقم السيارة"],
  ["pump_id", "pumps", "رقم المضخة"],
  ["mixer_id", "mixers", "رقم المكسر"],
];
function Section({ title, note, children, kind }) {
  return (
    <section className={`form-section ${kind || ""}`}>
      <div className="section-title">
        <h2>
          <span className="section-icon" aria-hidden="true">
            ▤
          </span>
          {title}
        </h2>
        {note && <small>{note}</small>}
      </div>
      <div className="section-fields">{children}</div>
    </section>
  );
}
export default function InvoiceForm() {
  const { id } = useParams(),
    { user } = useAuth(),
    navigate = useNavigate(),
    [form, setForm] = useState(initial),
    [masters, setMasters] = useState({}),
    [previous, setPrevious] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [printed, setPrinted] = useState(false),
    [legacyDeparture, setLegacyDeparture] = useState(null),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      Promise.all(
        masterTypes.map(async ([key]) => [key, (await api("/" + key)).data]),
      ),
      id ? api("/invoices/" + id) : Promise.resolve(null),
    ])
      .then(([list, result]) => {
        if (!alive) return;
        const data = Object.fromEntries(list);
        if (result) {
          const row = result.data;
          for (const [key, path] of refs) {
            const prefix = key.replace("_id", "");
            if (row[key]) {
              data[path] = data[path].filter((x) => x.id !== row[key]);
              data[path].push({ id: row[key], name: row[prefix + "_name"] });
            }
          }
          setForm(
            Object.fromEntries(
              Object.keys(initial()).map((k) => [
                k,
                k === "departure"
                  ? (row.departure_input ?? row.departure)
                  : (row[k] ?? ""),
              ]),
            ),
          );
          setPrinted(!!row.printed_at);
          setLegacyDeparture(
            row.departure_input == null ? row.departure : null,
          );
        } else {
          setForm(initial());
          setPrinted(false);
          setLegacyDeparture(null);
        }
        setMasters(data);
        setError("");
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);
  useEffect(() => {
    let alive = true;
    if (!form.customer_id || !form.date) {
      setPrevious(0);
      return;
    }
    api(
      `/invoices/quantity?customer_id=${form.customer_id}&date=${form.date}${id ? "&exclude_id=" + id : ""}`,
    )
      .then((r) => alive && setPrevious(r.data))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [form.customer_id, form.date, id]);
  const change = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setNotice("");
  };
  const input = (key, label, props = {}) => (
    <Field
      key={key}
      label={label}
      value={form[key]}
      onChange={change(key)}
      {...props}
    />
  );
  async function save(e) {
    e.preventDefault();
    const preview = e.nativeEvent.submitter?.value === "preview";
    setBusy(true);
    setError("");
    setNotice("");
    try {
      for (const [k, , label] of refs)
        if (k !== "mixer_id" && !form[k])
          throw new Error(`يرجى اختيار ${label}`);
      const body = {
        ...form,
        pump_id: form.pump_id || null,
        mixer_id: form.mixer_id || null,
      };
      const r = await api("/invoices" + (id ? "/" + id : ""), {
        method: id ? "PUT" : "POST",
        body,
      });
      if (preview) navigate(`/invoices/${r.data.id}/preview`);
      else {
        navigate(`/invoices/${r.data.id}`);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <p className="empty">جارٍ التحميل...</p>;
  if (printed && user.role === "ADMIN")
    return <ErrorBox error="لا يمكن تعديل الفاتورة بعد طباعتها" />;
  return (
    <>
      <Title>{id ? "تعديل الفاتورة" : "إنشاء فاتورة"}</Title>
      <ErrorBox error={error} />
      {notice && <p role="status">{notice}</p>}
      <form onSubmit={save}>
        <Section title="البيانات الأساسية" kind="basic">
          {refs.map(([key, path, label]) => (
            <SearchSelect
              key={key}
              label={label}
              required={key !== "mixer_id"}
              items={masters[path] || []}
              value={form[key]}
              onChange={(value) => setForm((f) => ({ ...f, [key]: value }))}
            />
          ))}
          {input("date", "التاريخ", { type: "date", required: true })}
        </Section>
        <Section
          title="الكميات ومكان الصب"
          note="تُحسب تلقائياً حسب العميل والتاريخ"
          kind="quantities"
        >
          {input("pour_location", "مكان الصب", {
            required: true,
            maxLength: 200,
          })}
          {input("requested", "الكمية المطلوبة", {
            type: "number",
            min: 0,
            max: 999999.999,
            step: ".001",
            required: true,
          })}
          {input("truck_load", "حمولة السيارة", {
            type: "number",
            min: 0,
            max: 999999.999,
            step: ".001",
            required: true,
          })}
          <Field
            label="الواصل سابقاً"
            value={amount(previous)}
            readOnly
            className="locked"
          />
          <Field
            label="المجموع التراكمي"
            value={amount(
              (Math.round(previous * 1000) +
                Math.round(Number(form.truck_load || 0) * 1000)) /
                1000,
            )}
            readOnly
            className="locked"
          />
        </Section>
        <Section title="أوقات الحمولة" kind="times">
          <div className="departure-field">
            {input("departure", "ساعة مغادرة المصنع", {
              type: "time",
              required: true,
            })}
            <small className="departure-hint" role="status">
              وقت المغادرة المسجل:{" "}
              <bdi dir="ltr">
                {form.departure === legacyDeparture
                  ? form.departure
                  : addDepartureOffset(form.departure) || "—"}
              </bdi>
              {form.departure === legacyDeparture
                ? ""
                : " (إضافة 15 دقيقة تلقائياً)"}
            </small>
          </div>
          {input("factory_arrival", "ساعة الوصول إلى المصنع", { type: "time" })}
          {input("arrival", "ساعة الوصول إلى موقع الصب", { type: "time" })}
          {input("finish", "ساعة انتهاء تفريغ الحمولة", { type: "time" })}
        </Section>
        <Section title="بيانات إضافية" kind="extras">
          {input("chemicals", "المواد الكيميائية", { maxLength: 200 })}
          {input("added_water", "زيادة الماء حسب طلب العميل", {
            maxLength: 200,
          })}
          {input("receiver", "اسم المستلم", { maxLength: 200 })}
        </Section>
        <div className="buttons form-buttons">
          <button
            className="primary"
            disabled={busy}
            type="submit"
            value="save"
          >
            {busy ? "جارٍ الحفظ..." : "حفظ الفاتورة"}
          </button>
          <button disabled={busy} type="submit" value="preview">
            معاينة الطباعة
          </button>
        </div>
      </form>
    </>
  );
}
