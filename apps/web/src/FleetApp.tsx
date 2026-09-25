import { useEffect, useState } from "react";
import { TruckList } from "./components/TruckList";
import { Customers, Imports, ServiceOrders, Valuation } from "./Operations";
import api from "./services/api";
import "./operations.css";
export default function FleetApp() {
  const [authenticated, setAuthenticated] = useState<boolean>(),
    [error, setError] = useState(""),
    [tab, setTab] = useState("Fleet");
  useEffect(() => {
    api
      .get("/session/")
      .then((r) => setAuthenticated(r.data.authenticated))
      .catch((e) => setError(String(e)));
  }, []);
  if (authenticated === undefined)
    return (
      <main className="container p-8">
        <p>{error || "Loading session…"}</p>
      </main>
    );
  return (
    <main className="container mx-auto p-6">
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
              setError(String(e));
            }
          }}
        >
          <h1>Fleet operations</h1>
          <label>
            Username
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button>Sign in</button>
        </form>
      ) : (
        <>
          <nav aria-label="Modules" className="mb-6">
            {["Fleet", "Customers", "Service orders", "FIPE", "Imports"].map(
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
              onClick={async () => {
                try {
                  await api.post("/logout/");
                  setAuthenticated(false);
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              Sign out
            </button>
          </nav>
          {tab === "Fleet" ? (
            <TruckList />
          ) : tab === "Customers" ? (
            <Customers />
          ) : tab === "Service orders" ? (
            <ServiceOrders />
          ) : tab === "FIPE" ? (
            <Valuation />
          ) : (
            <Imports />
          )}
        </>
      )}
    </main>
  );
}
