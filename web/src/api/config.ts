import { api } from './client.js'

export interface AppConfig {
  title: string
}

export const configApi = {
  get: () => api.get<AppConfig>('/config'),
}
