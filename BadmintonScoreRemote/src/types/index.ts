export type ScoreAction = 
  | { type: 'INCREMENT_TEAM_A' }
  | { type: 'INCREMENT_TEAM_B' }
  | { type: 'DECREMENT_TEAM_A' }
  | { type: 'DECREMENT_TEAM_B' }
  | { type: 'TOGGLE_SERVER' }
  | { type: 'RESET_GAME' }
  | { type: 'RESET_MATCH' };

export const SCORE_ACTION_CODES: Record<ScoreAction['type'], number> = {
  INCREMENT_TEAM_A: 1,
  INCREMENT_TEAM_B: 2,
  DECREMENT_TEAM_A: 3,
  DECREMENT_TEAM_B: 4,
  TOGGLE_SERVER: 5,
  RESET_GAME: 6,
  RESET_MATCH: 7,
};

export interface BluetoothDevice {
  id: string;
  name: string;
  rssi?: number;
}

export const BADMINTON_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
export const SCORE_CHARACTERISTIC_UUID = '12345678-1234-1234-1234-123456789abd';
export const CONTROL_CHARACTERISTIC_UUID = '12345678-1234-1234-1234-123456789abe';