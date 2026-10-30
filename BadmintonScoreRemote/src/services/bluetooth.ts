import {
  NativeEventEmitter,
  NativeEventSubscription,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { ScoreAction, SCORE_ACTION_CODES } from '../types';

interface BluetoothRemoteModule {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendAction(actionCode: number): Promise<void>;
  sendCommand(commandCode: number, payload: string): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

interface ConnectionEvent {
  connected: boolean;
  deviceName: string;
}

export interface MatchScore {
  teamA: number;
  teamB: number;
}

const remoteModule = NativeModules.BadmintonBleRemote as BluetoothRemoteModule | undefined;

class BluetoothService {
  private emitter: NativeEventEmitter | null = null;
  private connectionSubscription: NativeEventSubscription | null = null;
  private errorSubscription: NativeEventSubscription | null = null;
  private scoreSubscription: NativeEventSubscription | null = null;
  private connected = false;
  private initialized = false;
  private onConnectionChangeCallback:
    | ((connected: boolean, deviceName?: string) => void)
    | null = null;
  private onErrorCallback: ((message: string) => void) | null = null;
  private onScoreUpdateCallback: ((score: MatchScore) => void) | null = null;

  async initialize(): Promise<void> {
    if (Platform.OS !== 'android') {
      throw new Error('The remote Bluetooth service is currently supported on Android only.');
    }
    if (!remoteModule) {
      throw new Error('The Android Bluetooth remote module is not installed.');
    }
    if (this.initialized) {
      return;
    }

    if (Number(Platform.Version) >= 31) {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      ];
      const results = await PermissionsAndroid.requestMultiple(permissions);
      if (permissions.some(permission => results[permission] !== PermissionsAndroid.RESULTS.GRANTED)) {
        throw new Error('Bluetooth connect and advertise permissions are required on the remote device.');
      }
    }

    this.emitter = new NativeEventEmitter(remoteModule);
    this.connectionSubscription = this.emitter.addListener(
      'BadmintonBleRemoteConnection',
      (event: ConnectionEvent) => {
        this.connected = event.connected;
        this.onConnectionChangeCallback?.(event.connected, event.deviceName || 'Video recorder');
      },
    );
    this.errorSubscription = this.emitter.addListener(
      'BadmintonBleRemoteError',
      (message: string) => this.onErrorCallback?.(message),
    );
    this.scoreSubscription = this.emitter.addListener(
      'BadmintonBleRemoteScore',
      (score: MatchScore) => {
        if (
          Number.isInteger(score?.teamA) && score.teamA >= 0 && score.teamA <= 255 &&
          Number.isInteger(score?.teamB) && score.teamB >= 0 && score.teamB <= 255
        ) {
          this.onScoreUpdateCallback?.(score);
        } else {
          this.onErrorCallback?.('The recorder sent an invalid score update.');
        }
      },
    );
    try {
      await remoteModule.start();
      this.initialized = true;
    } catch (error) {
      this.removeEventListeners();
      throw error;
    }
  }

  onConnectionChange(callback: (connected: boolean, deviceName?: string) => void): void {
    this.onConnectionChangeCallback = callback;
  }

  onError(callback: (message: string) => void): void {
    this.onErrorCallback = callback;
  }

  onScoreUpdate(callback: (score: MatchScore) => void): void {
    this.onScoreUpdateCallback = callback;
  }

  async sendAction(action: ScoreAction): Promise<void> {
    if (!remoteModule || !this.connected) {
      throw new Error('Connect a video recorder before sending score changes.');
    }
    const actionCodes: Partial<Record<ScoreAction['type'], number>> = SCORE_ACTION_CODES;
    const actionCode = actionCodes[action.type];
    if (actionCode === undefined) {
      throw new Error('This score action cannot be sent to the remote device.');
    }
    await remoteModule.sendAction(actionCode);
  }

  async sendCommand(commandCode: number, payload = ''): Promise<void> {
    if (!remoteModule || !this.connected) {
      throw new Error('Connect a video recorder before changing match settings.');
    }
    await remoteModule.sendCommand(commandCode, payload);
  }

  private removeEventListeners(): void {
    this.connectionSubscription?.remove();
    this.errorSubscription?.remove();
    this.scoreSubscription?.remove();
    this.connectionSubscription = null;
    this.errorSubscription = null;
    this.scoreSubscription = null;
    this.emitter = null;
  }

  destroy(): void {
    this.connected = false;
    this.removeEventListeners();
    if (this.initialized && remoteModule) {
      this.initialized = false;
      remoteModule.stop().catch(error => {
        console.error('Failed to stop the Bluetooth remote service:', error);
      });
    }
  }
}

const bluetoothService = new BluetoothService();
export default bluetoothService;
