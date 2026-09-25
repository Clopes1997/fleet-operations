import { useState, useEffect, useRef } from "react";
import { truckService, Truck } from "@/services/api";

export const useTrucks = () => {
  const requestId = useRef(0);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    count: 0,
    next: null as string | null,
    previous: null as string | null,
  });
  const [error, setError] = useState<string | null>(null);

  const fetchTrucks = async () => {
    const currentRequest = ++requestId.current;
    try {
      setLoading(true);
      setError(null);
      const data = await truckService.getPage(page);
      if (currentRequest !== requestId.current) return;
      setTrucks(data.results);
      setPagination(data);
    } catch (err: any) {
      if (currentRequest !== requestId.current) return;
      setError(
        err.response?.data?.detail ||
          err.message ||
          "Erro ao carregar caminhões",
      );
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrucks();
    return () => {
      requestId.current++;
    };
  }, [page]);

  return {
    trucks,
    page,
    setPage,
    pagination,
    loading,
    error,
    refetch: fetchTrucks,
  };
};
