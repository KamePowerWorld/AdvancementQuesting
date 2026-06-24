import { api } from './client.js'
import type { DashboardConfig } from '@/types/dashboard.js'

export const dashboardApi = {
  get: () => api.get<DashboardConfig>('/dashboard'),
  put: (config: DashboardConfig) => api.put<void>('/dashboard', config),
}
