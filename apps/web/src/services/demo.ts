import type { AxiosAdapter } from 'axios';

// Fictional, read-only fixtures. This adapter never falls through to the network.
const trucks = [
  { id: 1, license_plate: 'DEMO001', brand: 'Volvo', model: 'FH 460', manufacturing_year: 2022, fipe_price: null, valuation_current: false, created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 2, license_plate: 'DEMO002', brand: 'Scania', model: 'R 450', manufacturing_year: 2021, fipe_price: null, valuation_current: false, created_at: '2026-01-01', updated_at: '2026-01-01' },
];
const customers = [{ id: 1, display_name: 'Transportadora Exemplo', notes: 'Cliente fictício para demonstração' }];
const orders = [
  { id: 1, customer: 1, vehicle: 1, customer_snapshot: 'Transportadora Exemplo', description: 'Revisão preventiva', quoted_value: '2500.00', deadline: '2026-10-15', status: 'pendente', version: 1, transitions: [] },
  { id: 2, customer: 1, vehicle: 2, customer_snapshot: 'Transportadora Exemplo', description: 'Inspeção de freios', quoted_value: '1800.00', deadline: '2026-10-20', status: 'em_andamento', version: 1, transitions: [] },
];
export const demoAdapter: AxiosAdapter = async config => {
  if (config.method !== 'get') throw new Error('Demonstração somente leitura. Alterações exigem o backend.');
  const url = config.url;
  const params = config.params ?? {};
  let data: unknown;
  if (url === '/session/') data = { authenticated: true };
  else if (url === '/trucks/fipe/') data = [];
  else if (url === '/trucks/' || url === '/customers/' || url === '/orders/') {
    const rows = url === '/trucks/' ? trucks : url === '/customers/' ? customers : orders.filter(o =>
      (!params.status || o.status === params.status) && (!params.search || `${o.customer_snapshot} ${o.description}`.toLowerCase().includes(String(params.search).toLowerCase())));
    const page = Math.max(1, Number(params.page) || 1);
    data = { count: rows.length, next: null, previous: page > 1 ? String(page - 1) : null, results: rows.slice((page - 1) * 20, page * 20) };
  } else throw new Error('Recurso indisponível na demonstração.');
  return { data: structuredClone(data), status: 200, statusText: 'OK', headers: {}, config };
};
