import { api } from "../api";
import React, {
  useId,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
export function Field({ label, required, children, ...props }) {
  const id = useId();
  return (
    <label
      className={[
        "field",
        ["date", "time"].includes(props.type) && "native-datetime-field",
      ]
        .filter(Boolean)
        .join(" ")}
      htmlFor={id}
    >
      <span>
        {label}
        {required && (
          <b className="required" aria-hidden="true">
            {" "}
            *
          </b>
        )}
      </span>
      {children ? (
        React.cloneElement(children, {
          id,
          "aria-label": label,
          ...children.props,
        })
      ) : (
        <input id={id} aria-label={label} required={required} {...props} />
      )}
    </label>
  );
}
export function ErrorBox({ error }) {
  return error ? (
    <div role="alert" className="error">
      {error.message || error}
    </div>
  ) : null;
}
export function Title({ children, subtitle }) {
  return (
    <div className="title">
      <h1>{children}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}
export function Modal({ title, onClose, children }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const old = document.activeElement;
    const input = ref.current.querySelector(
      'input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled])',
    );
    input?.setAttribute("autofocus", "");
    ref.current.showModal();
    input?.focus({ preventScroll: true });
    return () => old?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="إغلاق">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Confirm({ message, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="تأكيد الحذف" onClose={onClose}>
      <p>{message || "هل تريد حذف هذا السجل؟"}</p>
      <ErrorBox error={error} />
      <div className="buttons">
        <button
          className="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              setError(e.message);
              setBusy(false);
            }
          }}
        >
          حذف
        </button>
        <button onClick={onClose}>إلغاء</button>
      </div>
    </Modal>
  );
}
export function SearchSelect({
  label,
  items = [],
  source,
  value,
  onChange,
  required,
  id: outerId,
}) {
  const generated = useId(),
    id = outerId || generated,
    listId = useId();
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const [remote, setRemote] = useState([]),
    [next, setNext] = useState(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const remembered = useRef(null),
    generation = useRef(0);
  useEffect(() => {
    if (!source || !open) return;
    const controller = new AbortController();
    const current = ++generation.current;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      api(
        source +
          (source.includes("?") ? "&" : "?") +
          new URLSearchParams({ search: query, limit: 50 }),
        { signal: controller.signal },
      )
        .then((r) => {
          if (controller.signal.aborted || current !== generation.current)
            return;
          setRemote(r.data);
          setNext(r.has_more ? r.next_cursor : null);
        })
        .catch((e) => {
          if (
            !controller.signal.aborted &&
            current === generation.current &&
            e.name !== "AbortError"
          )
            setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
      generation.current++;
    };
  }, [source, open, query]);
  const choices = source
    ? [
        ...remote,
        ...items.filter(
          (x) => !remote.some((y) => String(y.id) === String(x.id)),
        ),
      ]
    : items;
  const selected =
    choices.find((x) => String(x.id) === String(value)) ||
    (String(remembered.current?.id) === String(value)
      ? remembered.current
      : null);
  const options = source ? remote : items.filter((x) => x.name.includes(query));
  const choose = (x) => {
    remembered.current = x;
    onChange(String(x.id));
    setQuery("");
    setOpen(false);
  };
  return (
    <label className="field" htmlFor={id}>
      <span>
        {label}
        {required && (
          <b className="required" aria-hidden="true">
            {" "}
            *
          </b>
        )}
      </span>
      <div className="search-select">
        <input
          id={id}
          aria-label={label}
          role="combobox"
          aria-required={required}
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && options[active] ? `${listId}-${active}` : undefined
          }
          placeholder={`ابحث عن ${label}...`}
          value={open ? query : selected?.name || ""}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setActive(0);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setRemote([]);
            setNext(null);
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, options.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            }
            if (e.key === "Enter" && open) {
              e.preventDefault();
              if (options[active]) choose(options[active]);
            }
          }}
        />
        <span className="search-symbol" aria-hidden="true">
          ⌕
        </span>
        <button
          type="button"
          className="select-toggle"
          aria-label={`فتح ${label}`}
          onClick={() => {
            setOpen(!open);
            setQuery("");
          }}
        >
          ⌄
        </button>
        {open && (
          <ul id={listId} role="listbox">
            {!required && (
              <li
                role="option"
                aria-selected={!value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                —
              </li>
            )}
            {options.map((x, i) => (
              <li
                id={`${listId}-${i}`}
                role="option"
                aria-selected={String(x.id) === String(value)}
                className={i === active ? "highlight" : ""}
                key={x.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(x)}
              >
                {x.name}
              </li>
            ))}
            {loading && <li>جارٍ التحميل...</li>}
            {error && <li role="alert">{error}</li>}
            {!loading && !error && !options.length && <li>لا توجد نتائج</li>}
            {next && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  disabled={loading}
                  onClick={async () => {
                    const current = generation.current;
                    try {
                      setLoading(true);
                      const r = await api(
                        source +
                          (source.includes("?") ? "&" : "?") +
                          new URLSearchParams({
                            search: query,
                            limit: 50,
                            cursor: next,
                          }),
                      );
                      if (current !== generation.current) return;
                      setRemote((old) => [...old, ...r.data]);
                      setNext(r.has_more ? r.next_cursor : null);
                    } catch (e) {
                      if (current === generation.current) setError(e.message);
                    } finally {
                      if (current === generation.current) setLoading(false);
                    }
                  }}
                >
                  المزيد
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </label>
  );
}
export function Empty({ loading, columns }) {
  return (
    <tr>
      <td colSpan={columns} className="empty">
        {loading ? "جارٍ التحميل..." : "لا توجد بيانات"}
      </td>
    </tr>
  );
}
