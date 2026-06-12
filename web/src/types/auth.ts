export type Role = 'player' | 'editor' | 'admin'

export interface PlayerSession {
  playerUuid: string
  playerName: string
  role: Role
}

export interface AuthCodeRequest {
  code: string
}

export interface AuthCodeResponse {
  token: string
  playerName: string
  playerUuid: string
  role: Role
}
