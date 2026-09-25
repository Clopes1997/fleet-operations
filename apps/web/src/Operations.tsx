import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import api, { type Truck } from "./services/api";
type Page<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};
type Customer = { id: number; display_name: string; notes: string };
type Order = {
  id: number;
  customer: number | null;
  vehicle: number | null;
  customer_snapshot: string;
  description: string;
  quoted_value: string;
  deadline: string;
  status: string;
  version: number;
  transitions: {
    id: number;
    previous_status: string;
    next_status: string;
    occurred_at: string;
  }[];
};
const statuses = ["pendente", "em_andamento", "concluido", "cancelado"];
const field = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
export function ServiceOrders() {
  const [orders, setOrders] = useState<Page<Order>>({
    count: 0,
    next: null,
    previous: null,
    results: [],
  });
  const [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Order>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]),
    [vehicles, setVehicles] = useState<Truck[]>([]);
  const requestVersion = useRef(0);
  const currentQuery = useRef({page, status, search});
  currentQuery.current = {page, status, search};
  async function reload() {
    const version = ++requestVersion.current;
    try {
      const r = await api.get("/orders/", { params: currentQuery.current });
      if (version !== requestVersion.current) return;
      setOrders(r.data);
      setError("");
    } catch (e) {
      if (version !== requestVersion.current) return;
      setError(message(e));
    }
  }
  useEffect(() => {
    void reload();
  }, [page, status, search]);
  useEffect(() => {
    Promise.all([api.get("/customers/"), api.get("/trucks/")])
      .then(([c, v]) => {
        setCustomers(c.data.results);
        setVehicles(v.data.results);
      })
      .catch((e) => setError(message(e)));
  }, []);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const data = {
      customer_snapshot: field(d, "customer_snapshot"),
      description: field(d, "description"),
      quoted_value: field(d, "quoted_value"),
      deadline: field(d, "deadline"),
      customer: field(d, "customer") ? Number(field(d, "customer")) : null,
      vehicle: field(d, "vehicle") ? Number(field(d, "vehicle")) : null,
      status: field(d, "status"),
      ...(editing ? { version: editing.version } : {}),
    };
    try {
      if (editing) await api.patch("/orders/" + editing.id + "/", data);
      else await api.post("/orders/", data);
      setEditing(undefined);
      await reload();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Service orders</h1>
      <p>
        Quoted amounts are distinct from FIPE valuations. Customer and vehicle
        links are optional.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <form key={editing?.id ?? "new"} onSubmit={save} className="fleet-form">
        <label>
          Customer snapshot
          <input
            name="customer_snapshot"
            required
            maxLength={255}
            defaultValue={editing?.customer_snapshot}
          />
        </label>
        <label>
          Reviewed customer ID
          <input
            name="customer"
            type="number"
            min="1"
            list="customers"
            defaultValue={editing?.customer ?? ""}
          />
        </label>
        <datalist id="customers">
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.display_name}
            </option>
          ))}
        </datalist>
        <label>
          Vehicle ID
          <input
            name="vehicle"
            type="number"
            min="1"
            list="vehicles"
            defaultValue={editing?.vehicle ?? ""}
          />
        </label>
        <datalist id="vehicles">
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.license_plate}
            </option>
          ))}
        </datalist>
        <label>
          Description
          <textarea
            name="description"
            required
            defaultValue={editing?.description}
          />
        </label>
        <label>
          Quoted amount
          <input
            name="quoted_value"
            inputMode="decimal"
            pattern="[0-9]+(\.[0-9]{1,2})?"
            required
            defaultValue={editing?.quoted_value}
          />
        </label>
        <label>
          Deadline
          <input
            name="deadline"
            type="date"
            required
            defaultValue={editing?.deadline}
          />
        </label>
        <label>
          Status
          <select name="status" defaultValue={editing?.status ?? "pendente"}>
            {(editing ? statuses : ["pendente"]).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button disabled={busy}>
          {editing ? "Save order" : "Create order"}
        </button>
        {editing && (
          <button type="button" onClick={() => setEditing(undefined)}>
            Cancel edit
          </button>
        )}
      </form>
      <div className="fleet-form">
        <label>
          Search orders
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Filter status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <p>
        {orders.count} orders. Page {page}
      </p>
      <button disabled={!orders.previous} onClick={() => setPage((p) => p - 1)}>
        Previous
      </button>
      <button disabled={!orders.next} onClick={() => setPage((p) => p + 1)}>
        Next
      </button>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th>ID / Customer</th>
            <th>Deadline</th>
            <th>Quote</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.results.map((o) => (
            <tr key={o.id}>
              <td>
                {o.id} / {o.customer_snapshot}
              </td>
              <td>{o.deadline}</td>
              <td>{o.quoted_value}</td>
              <td>{o.status}</td>
              <td>
                <button onClick={() => setEditing(o)}>Edit</button>
                <button
                  onClick={async () => {
                    if (
                      !confirm(
                        "Archive this order? Its history will be retained.",
                      )
                    )
                      return;
                    try {
                      await api.delete("/orders/" + o.id + "/");
                      await reload();
                    } catch (e) {
                      setError(message(e));
                    }
                  }}
                >
                  Archive
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <div>
          <h2>Recorded transitions</h2>
          <ul>
            {editing.transitions.map((t) => (
              <li key={t.id}>
                {t.occurred_at}: {t.previous_status} → {t.next_status}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
export function Customers() {
  const [rows, setRows] = useState<Page<Customer>>({
      count: 0,
      next: null,
      previous: null,
      results: [],
    }),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  async function reload() {
    try {
      setRows((await api.get("/customers/", { params: { page } })).data);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    void reload();
  }, [page]);
  return (
    <section>
      <h1 className="text-2xl font-bold">Customers</h1>
      {error && <p role="alert">{error}</p>}
      <form
        className="fleet-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = e.currentTarget,
            d = new FormData(f);
          try {
            await api.post("/customers/", {
              display_name: field(d, "name"),
              notes: field(d, "notes"),
            });
            f.reset();
            await reload();
          } catch (e) {
            setError(message(e));
          }
        }}
      >
        <label>
          Display name
          <input name="name" maxLength={255} required />
        </label>
        <label>
          Notes
          <input name="notes" />
        </label>
        <button>Create customer</button>
      </form>
      <p>{rows.count} customers</p>
      <ul>
        {rows.results.map((c) => (
          <li key={c.id}>
            {c.id}: {c.display_name} — {c.notes}
          </li>
        ))}
      </ul>
      <button disabled={!rows.previous} onClick={() => setPage((p) => p - 1)}>
        Previous
      </button>
      <button disabled={!rows.next} onClick={() => setPage((p) => p + 1)}>
        Next
      </button>
    </section>
  );
}
export function Imports() {
  const [bundle, setBundle] = useState<unknown>(),
    [preview, setPreview] = useState<{
      new: number;
      skipped: number;
      errors: { row: number; error: string }[];
    }>(),
    [error, setError] = useState(""),
    [result, setResult] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section>
      <h1 className="text-2xl font-bold">Legacy imports</h1>
      <p>
        Administrators can preview and apply reviewed JSON exports. No customer
        or vehicle matching is inferred.
      </p>
      {error && <p role="alert">{error}</p>}
      <label>
        Import bundle
        <input
          type="file"
          accept=".json"
          disabled={busy}
          onChange={async (e) => {
            setPreview(undefined);
            setBundle(undefined);
            setError("");
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              if (file.size > 2_000_000) throw Error("Maximum 2 MB per bundle");
              const data = JSON.parse(await file.text());
              setBusy(true);
              const r = await api.post("/imports/preview/", data);
              setBundle(data);
              setPreview(r.data);
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {preview && (
        <div>
          <p>
            {preview.new} new, {preview.skipped} already imported
          </p>
          <ul>
            {preview.errors.map((e, i) => (
              <li key={i}>
                Row {e.row}: {e.error}
              </li>
            ))}
          </ul>
          <button
            disabled={busy || preview.errors.length > 0}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api.post("/imports/apply/", bundle);
                setResult("Imported " + r.data.imported + " records");
                setPreview(undefined);
              } catch (e) {
                setError(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Apply reviewed import
          </button>
        </div>
      )}
      <p role="status">{result}</p>
    </section>
  );
}
export function Valuation() {
  const [vehicle, setVehicle] = useState(""),
    [brand, setBrand] = useState(""),
    [model, setModel] = useState(""),
    [year, setYear] = useState(""),
    [error, setError] = useState(""),
    [result, setResult] = useState("");
  const [options, setOptions] = useState<
    Record<
      string,
      { code?: string; codigo?: string; name?: string; nome?: string }[]
    >
  >({});
  async function load(level: string, params: Record<string, string>) {
    try {
      setOptions((o) => ({ ...o, [level]: [] }));
      const r = await api.get("/trucks/fipe/", { params });
      setOptions((o) => ({ ...o, [level]: r.data }));
      setError("");
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    void load("brands", {});
  }, []);
  return (
    <section>
      <h1 className="text-2xl font-bold">FIPE reference valuation</h1>
      <p>
        Select exact source codes. Verify that the FIPE model year and fuel
        variant match the vehicle. This reference is not a service cost.
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        className="fleet-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await api.post("/trucks/" + vehicle + "/valuation/", {
              brand_code: brand,
              model_code: model,
              year_code: year,
            });
            setResult("Reference value: " + r.data.fipe_price + " BRL");
          } catch (e) {
            setError(message(e));
          }
        }}
      >
        <label>
          Vehicle ID
          <input
            type="number"
            min="1"
            required
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
          />
        </label>
        <label>
          FIPE brand
          <select
            required
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              setModel("");
              setYear("");
              void load("models", { brand: e.target.value });
            }}
          >
            <option value="">Select</option>
            {options.brands?.map((o) => (
              <option key={o.code ?? o.codigo} value={o.code ?? o.codigo}>
                {o.name ?? o.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          FIPE model
          <select
            required
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setYear("");
              void load("years", { brand, model: e.target.value });
            }}
          >
            <option value="">Select</option>
            {options.models?.map((o) => (
              <option key={o.code ?? o.codigo} value={o.code ?? o.codigo}>
                {o.name ?? o.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          FIPE model year / fuel
          <select
            required
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="">Select</option>
            {options.years?.map((o) => (
              <option key={o.code ?? o.codigo} value={o.code ?? o.codigo}>
                {o.name ?? o.nome}
              </option>
            ))}
          </select>
        </label>
        <button>Save selected valuation</button>
      </form>
      <p role="status">{result}</p>
    </section>
  );
}
