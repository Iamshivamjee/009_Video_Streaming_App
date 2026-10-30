import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { BluetoothDevice } from '../types';
import bluetoothService from '../services/bluetooth';

interface BluetoothContextType {
  isScanning: boolean;
  isConnected: boolean;
  connectedDeviceName: string | null;
  discoveredDevices: BluetoothDevice[];
  scanForDevices: () => Promise<void>;
  stopScan: () => void;
  connectToDevice: (deviceId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  error: string | null;
}

const BluetoothContext = createContext<BluetoothContextType | undefined>(undefined);

export function BluetoothProvider({ children }: { children: ReactNode }) {
  const [isScanning, setIsScanning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = useState<BluetoothDevice[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bluetoothService.onConnectionChange((connected, deviceName) => {
      setIsConnected(connected);
      setConnectedDeviceName(connected ? deviceName || null : null);
    });

    bluetoothService.initialize().catch(initializationError => {
      setError(
        initializationError instanceof Error
          ? initializationError.message
          : 'Failed to initialize Bluetooth.',
      );
    });

    return () => bluetoothService.destroy();
  }, []);

  const scanForDevices = useCallback(async () => {
    if (isScanning) {
      return;
    }
    setError(null);
    setDiscoveredDevices([]);
    setIsScanning(true);
    try {
      await bluetoothService.scanForDevices(
        device => {
          setDiscoveredDevices(current => {
            const existingIndex = current.findIndex(item => item.id === device.id);
            if (existingIndex < 0) {
              return [...current, device];
            }
            const updated = [...current];
            updated[existingIndex] = device;
            return updated;
          });
        },
        () => setIsScanning(false),
        scanError => setError(scanError.message),
      );
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Bluetooth scan failed.');
      setIsScanning(false);
    }
  }, [isScanning]);

  const stopScan = useCallback(() => {
    bluetoothService.stopScan();
    setIsScanning(false);
  }, []);

  const connectToDevice = useCallback(async (deviceId: string) => {
    setError(null);
    stopScan();
    try {
      await bluetoothService.connectToDevice(deviceId);
    } catch (connectionError) {
      setError(connectionError instanceof Error ? connectionError.message : 'Connection failed.');
      throw connectionError;
    }
  }, [stopScan]);

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      await bluetoothService.disconnect();
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'Disconnect failed.');
    }
  }, []);

  return (
    <BluetoothContext.Provider value={{
      isScanning,
      isConnected,
      connectedDeviceName,
      discoveredDevices,
      scanForDevices,
      stopScan,
      connectToDevice,
      disconnect,
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
