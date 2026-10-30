import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { ScoreAction } from '../types';
import bluetoothService, { MatchScore } from '../services/bluetooth';

interface BluetoothContextType {
  isConnected: boolean;
  connectedDeviceName: string | null;
  sendAction: (action: ScoreAction) => Promise<void>;
  sendTeamName: (team: 'A' | 'B', name: string) => Promise<void>;
  sendWinningScore: (score: number) => Promise<void>;
  sendBestOf: (games: number) => Promise<void>;
  sendGameStatus: (playing: boolean) => Promise<void>;
  currentScore: MatchScore | null;
  error: string | null;
}

const BluetoothContext = createContext<BluetoothContextType | undefined>(undefined);

export function BluetoothProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);
  const [currentScore, setCurrentScore] = useState<MatchScore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bluetoothService.onConnectionChange((connected, deviceName) => {
      setIsConnected(connected);
      setConnectedDeviceName(connected ? deviceName || null : null);
    });
    bluetoothService.onError(setError);
    bluetoothService.onScoreUpdate(setCurrentScore);
    bluetoothService.initialize().catch(initializationError => {
      setError(
        initializationError instanceof Error
          ? initializationError.message
          : 'Failed to start the Bluetooth remote.',
      );
    });
    return () => bluetoothService.destroy();
  }, []);

  useEffect(() => {
    if (!isConnected) {
      setCurrentScore(null);
    }
  }, [isConnected]);

  const sendAction = useCallback(async (action: ScoreAction) => {
    try {
      await bluetoothService.sendAction(action);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Failed to send score action.');
      throw sendError;
    }
  }, []);

  const sendCommand = useCallback(async (code: number, payload = '') => {
    try {
      await bluetoothService.sendCommand(code, payload);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Failed to send match setting.');
      throw sendError;
    }
  }, []);

  return (
    <BluetoothContext.Provider value={{
      isConnected,
      connectedDeviceName,
      sendAction,
      sendTeamName: (team, name) => sendCommand(team === 'A' ? 8 : 9, name),
      sendWinningScore: score => sendCommand(10, score.toString()),
      sendBestOf: games => sendCommand(11, games.toString()),
      sendGameStatus: playing => sendCommand(playing ? 12 : 13),
      currentScore,
      error,
    }}>
      {children}
    </BluetoothContext.Provider>
  );
}

export function useBluetooth() {
  const context = useContext(BluetoothContext);
  if (!context) {
    throw new Error('useBluetooth must be used within a BluetoothProvider');
  }
  return context;
}
