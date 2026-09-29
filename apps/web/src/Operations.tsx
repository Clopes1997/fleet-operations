import { DateInput } from "./components/DateInput";
import { formatDate } from "./lib/calendar";
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
const statusLabels: Record<string, string> = { pendente: "Pendente", em_andamento: "Em andamento", concluido: "Concluído", cancelado: "Cancelado" };
const statuses = ["pendente", "em_andamento", "concluido", "cancelado"];
const field = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
function message(e: unknown) {
  return e instanceof Error ? e.message : "Não foi possível concluir a operação.";
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
      <h1 className="text-2xl font-bold">Ordens de serviço</h1>
      <p>
        Os valores orçados são independentes da avaliação FIPE. Os vínculos com cliente e veículo são opcionais.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <form key={editing?.id ?? "new"} onSubmit={save} className="fleet-form">
        <label>
          Nome do cliente na ordem
          <input
            name="customer_snapshot"
            required
            maxLength={255}
            defaultValue={editing?.customer_snapshot}
          />
        </label>
        <label>
          ID do cliente
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
          ID do veículo
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
          Descrição
          <textarea
            name="description"
            required
            defaultValue={editing?.description}
          />
        </label>
        <label>
          Valor do orçamento
          <input
            name="quoted_value"
            inputMode="decimal"
            pattern="[0-9]+(\.[0-9]{1,2})?"
            required
            defaultValue={editing?.quoted_value}
          />
        </label>
        <label>
          Prazo
          <DateInput
            name="deadline"
            required
            defaultValue={editing?.deadline}
          />
        </label>
        <label>
          Situação
          <select name="status" defaultValue={editing?.status ?? "pendente"}>
            {(editing ? statuses : ["pendente"]).map((s) => (
              <option key={s} value={s}>{statusLabels[s]}</option>
            ))}
          </select>
        </label>
        <button disabled={busy}>
          {editing ? "Salvar ordem" : "Criar ordem"}
        </button>
        {editing && (
          <button type="button" onClick={() => setEditing(undefined)}>
            Cancelar edição
          </button>
        )}
      </form>
      <div className="fleet-form">
        <label>
          Buscar ordens
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Filtrar por situação
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{statusLabels[s]}</option>
            ))}
          </select>
        </label>
      </div>
      <p>
        {orders.count} {orders.count === 1 ? "ordem" : "ordens"}. Página {page}
      </p>
      <button disabled={!orders.previous} onClick={() => setPage((p) => p - 1)}>
        Anterior
      </button>
      <button disabled={!orders.next} onClick={() => setPage((p) => p + 1)}>
        Próxima
      </button>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th>ID / Cliente</th>
            <th>Prazo</th>
            <th>Orçamento</th>
            <th>Situação</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {orders.results.map((o) => (
            <tr key={o.id}>
              <td>
                {o.id} / {o.customer_snapshot}
              </td>
              <td>{formatDate(o.deadline)}</td>
              <td>{o.quoted_value}</td>
              <td>{statusLabels[o.status] ?? "Situação desconhecida"}</td>
              <td>
                <button onClick={() => setEditing(o)}>Editar</button>
                <button
                  onClick={async () => {
                    if (
                      !confirm(
                        "Arquivar esta ordem? O histórico será preservado.",
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
                  Arquivar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <div>
          <h2>Histórico de alterações</h2>
          <ul>
            {editing.transitions.map((t) => (
              <li key={t.id}>
                {t.occurred_at}: {statusLabels[t.previous_status]} → {statusLabels[t.next_status]}
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
      <h1 className="text-2xl font-bold">Clientes</h1>
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
          Nome
          <input name="name" maxLength={255} required />
        </label>
        <label>
          Observações
          <input name="notes" />
        </label>
        <button>Cadastrar cliente</button>
      </form>
      <p>{rows.count} {rows.count === 1 ? "cliente" : "clientes"}</p>
      <ul>
        {rows.results.map((c) => (
          <li key={c.id}>
            {c.id}: {c.display_name} — {c.notes}
          </li>
        ))}
      </ul>
      <button disabled={!rows.previous} onClick={() => setPage((p) => p - 1)}>
        Anterior
      </button>
      <button disabled={!rows.next} onClick={() => setPage((p) => p + 1)}>
        Próxima
      </button>
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
      <h1 className="text-2xl font-bold">Avaliação de referência FIPE</h1>
      <p>
        Selecione os códigos correspondentes ao veículo e confira o ano do modelo e o combustível. A referência FIPE não representa o custo do serviço.
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
            setResult("Valor de referência: " + r.data.fipe_price + " BRL");
          } catch (e) {
            setError(message(e));
          }
        }}
      >
        <label>
          ID do veículo
          <input
            type="number"
            min="1"
            required
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
          />
        </label>
        <label>
          Marca FIPE
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
            <option value="">Selecione</option>
            {options.brands?.map((o) => (
              <option key={o.code ?? o.codigo} value={o.code ?? o.codigo}>
                {o.name ?? o.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Modelo FIPE
          <select
            required
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setYear("");
              void load("years", { brand, model: e.target.value });
            }}
          >
            <option value="">Selecione</option>
            {options.models?.map((o) => (
              <option key={o.code ?? o.codigo} value={o.code ?? o.codigo}>
                {o.name ?? o.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ano do modelo / combustível FIPE
          <select
            required
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="">Selecione</option>
            {options.years?.map((o) => (
              <option key={o.code ?? o.codigo} value={o.code ?? o.codigo}>
                {o.name ?? o.nome}
              </option>
            ))}
          </select>
        </label>
        <button>Salvar avaliação selecionada</button>
      </form>
      <p role="status">{result}</p>
    </section>
  );
}
