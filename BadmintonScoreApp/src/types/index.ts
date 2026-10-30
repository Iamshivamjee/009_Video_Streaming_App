export interface Team {
  id: 'teamA' | 'teamB';
  name: string;
  score: number;
}

export interface GameState {
  teamA: Team;
  teamB: Team;
  currentServer: 'teamA' | 'teamB';
  gameStatus: 'waiting' | 'playing' | 'paused' | 'finished';
  winningScore: number;
  bestOf: number;
  currentGame: number;
  gamesWon: { teamA: number; teamB: number };
}

export interface BluetoothDevice {
  id: string;
  name: string;
  rssi?: number;
}

export interface BLEService {
  serviceUUID: string;
  characteristicUUID: string;
}

export const BADMINTON_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
export const SCORE_CHARACTERISTIC_UUID = '12345678-1234-1234-1234-123456789abd';
export const CONTROL_CHARACTERISTIC_UUID = '12345678-1234-1234-1234-123456789abe';

export type ScoreAction = 
  | { type: 'INCREMENT_TEAM_A' }
  | { type: 'INCREMENT_TEAM_B' }
  | { type: 'DECREMENT_TEAM_A' }
  | { type: 'DECREMENT_TEAM_B' }
  | { type: 'SET_TEAM_A_NAME'; payload: string }
  | { type: 'SET_TEAM_B_NAME'; payload: string }
  | { type: 'SET_TEAM_A_SCORE'; payload: number }
  | { type: 'SET_TEAM_B_SCORE'; payload: number }
  | { type: 'RESET_GAME' }
  | { type: 'RESET_MATCH' }
  | { type: 'TOGGLE_SERVER' }
  | { type: 'SET_WINNING_SCORE'; payload: number }
  | { type: 'SET_BEST_OF'; payload: number }
  | { type: 'START_GAME' }
  | { type: 'PAUSE_GAME' }
  | { type: 'UNDO' };

export const SCORE_ACTION_CODES = {
  INCREMENT_TEAM_A: 1,
  INCREMENT_TEAM_B: 2,
  DECREMENT_TEAM_A: 3,
  DECREMENT_TEAM_B: 4,
  TOGGLE_SERVER: 5,
  RESET_GAME: 6,
  RESET_MATCH: 7,
} as const;

export function scoreActionFromCode(code: number): ScoreAction | null {
  switch (code) {
    case SCORE_ACTION_CODES.INCREMENT_TEAM_A:
      return { type: 'INCREMENT_TEAM_A' };
    case SCORE_ACTION_CODES.INCREMENT_TEAM_B:
      return { type: 'INCREMENT_TEAM_B' };
    case SCORE_ACTION_CODES.DECREMENT_TEAM_A:
      return { type: 'DECREMENT_TEAM_A' };
    case SCORE_ACTION_CODES.DECREMENT_TEAM_B:
      return { type: 'DECREMENT_TEAM_B' };
    case SCORE_ACTION_CODES.TOGGLE_SERVER:
      return { type: 'TOGGLE_SERVER' };
    case SCORE_ACTION_CODES.RESET_GAME:
      return { type: 'RESET_GAME' };
    case SCORE_ACTION_CODES.RESET_MATCH:
      return { type: 'RESET_MATCH' };
    default:
      return null;
  }
}