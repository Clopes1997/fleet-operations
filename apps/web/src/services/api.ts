import axios from "axios";

const api = axios.create({
  ...(import.meta.env.MODE === 'demo' ? { adapter: async (config) => (await import('./demo')).demoAdapter(config) } : {}),
  baseURL: "/api",
  xsrfCookieName: "csrftoken",
  xsrfHeaderName: "X-CSRFToken",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (import.meta.env.MODE === 'demo') return Promise.reject(error);
    const status = error.response?.status;
    const fields: Record<string, string> = { license_plate: "Placa", brand: "Marca", model: "Modelo", manufacturing_year: "Ano de fabricação", deadline: "Prazo", quoted_value: "Valor do orçamento", customer: "Cliente", vehicle: "Veículo", customer_snapshot: "Nome do cliente", description: "Descrição", status: "Situação", display_name: "Nome" };
    const invalid = Object.keys(error.response?.data ?? {}).filter(key => key in fields).map(key => fields[key]);
    const detail = !error.response ? "Não foi possível conectar ao servidor. Verifique a conexão e tente novamente."
      : status === 401 ? "Sessão expirada. Entre novamente."
      : status === 403 ? "Acesso negado. Verifique suas credenciais, permissões ou atualize a página."
      : status === 404 ? "Registro não encontrado. Atualize a página."
      : status === 409 ? "Este registro foi alterado ou está em uso. Atualize a página antes de tentar novamente."
      : status === 400 ? (invalid.length ? `Confira os campos: ${invalid.join(", ")}. Os valores são inválidos ou entram em conflito com um registro existente.` : "Não foi possível concluir a operação. Confira os dados e atualize a página antes de tentar novamente.")
      : status === 429 ? "Muitas tentativas. Aguarde e tente novamente."
      : "O serviço está indisponível. Tente novamente em instantes.";
    return Promise.reject(new Error(detail));
  },
);

export interface Truck {
  id: number;
  license_plate: string;
  brand: string;
  model: string;
  manufacturing_year: number;
  fipe_price: string | null;
  valuation_current: boolean;
  created_at: string;
  updated_at: string;
}

export interface TruckFormData {
  license_plate: string;
  brand: string;
  model: string;
  manufacturing_year: number;
}

export const truckService = {
  getPage: async (
    page = 1,
  ): Promise<{
    count: number;
    next: string | null;
    previous: string | null;
    results: Truck[];
  }> => {
    const response = await api.get("/trucks/", { params: { page } });
    return response.data;
  },

  getById: async (id: number): Promise<Truck> => {
    const response = await api.get(`/trucks/${id}/`);
    return response.data;
  },

  create: async (data: TruckFormData): Promise<Truck> => {
    const response = await api.post("/trucks/", data);
    return response.data;
  },

  update: async (id: number, data: Partial<TruckFormData>): Promise<Truck> => {
    const response = await api.put(`/trucks/${id}/`, data);
    return response.data;
  },

  patch: async (id: number, data: Partial<TruckFormData>): Promise<Truck> => {
    const response = await api.patch(`/trucks/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/trucks/${id}/`);
  },
};

export default api;
