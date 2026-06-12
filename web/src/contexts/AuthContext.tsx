import { createContext, useContext } from 'react'
import type { PlayerSession, Role } from '@/types/auth.js'

interface AuthContextValue {
  me: PlayerSession | undefined
  role: Role
  isEditor: boolean
}

export const AuthContext = createContext<AuthContextValue>({
  me: undefined,
  role: 'player',
  isEditor: false,
})

export function useAuth() {
  return useContext(AuthContext)
}
