import axios from "axios";

const api = axios.create({
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
    const data = error.response?.data;
    const detail =
      data && typeof data === "object"
        ? Object.entries(data)
            .map(
              ([key, value]) =>
                key +
                ": " +
                (typeof value === "string" ? value : JSON.stringify(value)),
            )
            .join("; ")
        : error.message;
    return Promise.reject(new Error(detail || "Request failed"));
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
