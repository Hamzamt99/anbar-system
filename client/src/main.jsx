import React, { createContext, useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import "@fontsource/noto-sans-arabic/400.css";
import "@fontsource/noto-sans-arabic/600.css";
import "@fontsource/noto-sans-arabic/700.css";
import "@fontsource/amiri/400.css";
import "@fontsource/amiri/700.css";
import { api } from "./api";
import { ErrorBox, Field } from "./components/UI";
import Master from "./pages/Master";
import Users from "./pages/Users";
import InvoiceForm from "./pages/InvoiceForm";
import Invoices from "./pages/Invoices";
import Receipt from "./pages/Receipt";
import AuditLogs from "./pages/AuditLogs";
import "./style.css";
import { Logo, FactoryBackground } from "./components/Brand";
const Auth = createContext();
export const useAuth = () => useContext(Auth);
function Login() {
  const { user, setUser } = useAuth(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/invoices/new" replace />;
  return (
    <div className="login-scene">
      <FactoryBackground />
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const f = new FormData(e.currentTarget);
            setUser(
              (
                await api("/auth/login", {
                  method: "POST",
                  body: Object.fromEntries(f),
                })
              ).data,
            );
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Logo />
        <h1>شركة العنبر للخرسانة</h1>
        <ErrorBox error={error} />
        <Field
          label="البريد الإلكتروني"
          name="email"
          placeholder="البريد الإلكتروني"
          type="email"
          dir="ltr"
          autoComplete="username"
          required
        />
        <Field
          label="كلمة المرور"
          name="password"
          placeholder="كلمة المرور"
          type="password"
          autoComplete="current-password"
          required
        />
        <button className="primary" disabled={busy}>
          {busy ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
        </button>
      </form>
    </div>
  );
}
function Layout() {
  const { user, setUser } = useAuth(),
    [error, setError] = useState("");
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="shell">
      <header>
        <NavLink className="brand" to="/invoices/new">
          <Logo small />
          شركة العنبر للخرسانة
        </NavLink>
        <nav>
          {user.role !== "DATA_ENTRY" && (
            <NavLink to="/master">البيانات الأساسية</NavLink>
          )}
          <NavLink to="/invoices/new">إنشاء فاتورة</NavLink>
          <NavLink to="/invoices" end>
            الفواتير
          </NavLink>
          {user.role === "SUPER_ADMIN" && (
            <>
              <NavLink to="/users">المستخدمون</NavLink>
              <NavLink to="/audit-logs">سجل العمليات</NavLink>
            </>
          )}
        </nav>
        <button
          className="logout"
          onClick={async () => {
            try {
              await api("/auth/logout", { method: "POST", body: {} });
              setUser(null);
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          تسجيل الخروج
        </button>
      </header>
      <main>
        <ErrorBox error={error} />
        <Outlet />
      </main>
    </div>
  );
}
function Gate({ role, children }) {
  const { user } = useAuth();
  return role.includes(user.role) ? (
    children
  ) : (
    <Navigate to="/invoices" replace />
  );
}
function App() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    api("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="empty">جارٍ التحميل...</div>;
  return (
    <Auth.Provider value={{ user, setUser }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/invoices/new" replace />} />
            <Route
              path="master"
              element={
                <Gate role={["ADMIN", "SUPER_ADMIN"]}>
                  <Master />
                </Gate>
              }
            />
            <Route
              path="users"
              element={
                <Gate role={["SUPER_ADMIN"]}>
                  <Users />
                </Gate>
              }
            />
            <Route
              path="audit-logs"
              element={
                <Gate role={["SUPER_ADMIN"]}>
                  <AuditLogs />
                </Gate>
              }
            />
            <Route path="invoices" element={<Invoices />} />
            <Route path="invoices/new" element={<InvoiceForm />} />
            <Route
              path="invoices/:id/edit"
              element={
                <Gate role={["ADMIN", "SUPER_ADMIN"]}>
                  <InvoiceForm />
                </Gate>
              }
            />
            <Route path="invoices/:id" element={<Receipt />} />
            <Route path="invoices/:id/preview" element={<Receipt />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </Auth.Provider>
  );
}
createRoot(document.getElementById("root")).render(<App />);
