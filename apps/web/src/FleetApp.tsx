import { clearValidation, localizeValidation } from "./lib/validation";
import { useEffect, useState } from "react";
import { TruckList } from "./components/TruckList";
import { Customers, ServiceOrders, Valuation } from "./Operations";
import api from "./services/api";
import "./operations.css";
export default function FleetApp() {
  const [authenticated, setAuthenticated] = useState<boolean>(),
    [error, setError] = useState(""),
    [tab, setTab] = useState("Frota");
  useEffect(() => {
    api
      .get("/session/")
      .then((r) => setAuthenticated(r.data.authenticated))
      .catch((e) => setError(e instanceof Error ? e.message : "Não foi possível concluir a operação."));
  }, []);
  if (authenticated === undefined)
    return (
      <main className="container p-8">
        <p>{error || "Carregando sessão…"}</p>
      </main>
    );
  return (
    <main className={authenticated ? "fleet-app" : "fleet-login"} onInvalidCapture={localizeValidation} onInputCapture={clearValidation}>
      {error && <p role="alert">{error}</p>}
      {!authenticated ? (
        <form
          className="fleet-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            try {
              await api.post("/login/", {
                username: d.get("username"),
                password: d.get("password"),
              });
              setError("");
              setAuthenticated(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Não foi possível concluir a operação.");
            }
          }}
        >
          <h1>Operações de frota</h1>
          <label>
            Usuário
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button>Entrar</button>
        </form>
      ) : (
        <>
          <aside className="fleet-sidebar">
          <div className="fleet-brand"><span>FO</span>Operações de frota</div>
          <p className="fleet-menu-label">Área de trabalho</p>
          <nav aria-label="Módulos">
            {["Frota", "Clientes", "Ordens de serviço", "FIPE"].map(
              (t) => (
                <button
                  key={t}
                  aria-current={tab === t ? "page" : undefined}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ),
            )}
            <button
              disabled={import.meta.env.MODE === 'demo'}
              onClick={async () => {
                try {
                  await api.post("/logout/");
                  setAuthenticated(false);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Não foi possível concluir a operação.");
                }
              }}
            >
              Sair
            </button>
          </nav>
          </aside>
          <div className="fleet-content">
          <header className="fleet-header">{import.meta.env.MODE === 'demo' && <p role="note">Demonstração somente leitura · Dados fictícios. Alterações e consultas FIPE exigem o backend.</p>}<h1>{tab}</h1><p>Gerencie sua frota, clientes e ordens de serviço.</p></header>
          <div className="fleet-card">
          {tab === "Frota" ? (
            <TruckList />
          ) : tab === "Clientes" ? (
            <Customers />
          ) : tab === "Ordens de serviço" ? (
            <ServiceOrders />
          ) : (
            <Valuation />
          )}
          </div>
          </div>
        </>
      )}
    </main>
  );
}
