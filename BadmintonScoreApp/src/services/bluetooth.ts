import { BleManager, Characteristic, Device, Subscription } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import { BluetoothDevice, ScoreAction, scoreActionFromCode } from '../types';

const BADMINTON_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
const SCORE_CHARACTERISTIC_UUID = '12345678-1234-1234-1234-123456789abd';
const CONTROL_CHARACTERISTIC_UUID = '12345678-1234-1234-1234-123456789abe';
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeBytesToBase64(bytes: number[]): string {
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    encoded += BASE64_ALPHABET[first >> 2];
    encoded += BASE64_ALPHABET[((first & 3) << 4) | ((second ?? 0) >> 4)];
    encoded += second === undefined
      ? '=='
      : third === undefined
        ? `${BASE64_ALPHABET[(second & 15) << 2]}=`
        : `${BASE64_ALPHABET[((second & 15) << 2) | (third >> 6)]}${BASE64_ALPHABET[third & 63]}`;
  }
  return encoded;
}

function normalizeUuid(uuid: string): string {
  return uuid.replace(/-/g, '').toLowerCase();
}

function decodeBytesFromBase64(value: string): number[] | null {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const chars = value.slice(index, index + 4);
    const first = BASE64_ALPHABET.indexOf(chars[0]);
    const second = BASE64_ALPHABET.indexOf(chars[1]);
    if (first < 0 || second < 0) {
      return null;
    }
    const third = chars[2] === '=' ? 0 : BASE64_ALPHABET.indexOf(chars[2]);
    const fourth = chars[3] === '=' ? 0 : BASE64_ALPHABET.indexOf(chars[3]);
    if (third < 0 || fourth < 0) {
      return null;
    }
    bytes.push((first << 2) | (second >> 4));
    if (chars[2] !== '=') {
      bytes.push(((second & 15) << 4) | (third >> 2));
    }
    if (chars[3] !== '=') {
      bytes.push(((third & 3) << 6) | fourth);
    }
  }
  return bytes;
}

function decodeRemoteCommand(bytes: number[]): ScoreAction | null {
  const command = bytes[0];
  switch (command) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
      return bytes.length === 1 ? scoreActionFromCode(command) : null;
    case 8:
    case 9: {
      if (bytes.length < 2) {
        return null;
      }
      try {
        const name = decodeURIComponent(bytes.slice(1).map(byte => `%${byte.toString(16).padStart(2, '0')}`).join(''));
        if (!name.trim()) {
          return null;
        }
        return command === 8
          ? { type: 'SET_TEAM_A_NAME', payload: name }
          : { type: 'SET_TEAM_B_NAME', payload: name };
      } catch {
        return null;
      }
    }
    case 10:
    case 11:
      if (bytes.length !== 2 || bytes[1] < 1) {
        return null;
      }
      return command === 10
        ? { type: 'SET_WINNING_SCORE', payload: bytes[1] }
        : { type: 'SET_BEST_OF', payload: bytes[1] };
    case 12:
      return bytes.length === 1 ? { type: 'START_GAME' } : null;
    case 13:
      return bytes.length === 1 ? { type: 'PAUSE_GAME' } : null;
    default:
      return null;
  }
}

class BluetoothService {
  private readonly manager = new BleManager();
  private connectedDevice: Device | null = null;
  private disconnectionSubscription: Subscription | null = null;
  private controlSubscription: Subscription | null = null;
  private scoreCharacteristic: Characteristic | null = null;
  private currentScore = { teamA: 0, teamB: 0 };
  private scoreWriteQueue: Promise<void> = Promise.resolve();
  private onScoreUpdateCallback: ((action: ScoreAction) => void) | null = null;
  private onConnectionChangeCallback:
    | ((connected: boolean, deviceName?: string) => void)
    | null = null;
  private isScanning = false;
  private scanTimeout: ReturnType<typeof setTimeout> | null = null;

  async initialize(): Promise<void> {
    if (Platform.OS !== 'android') {
      throw new Error('Bluetooth remote discovery is currently supported on Android only.');
    }
    const state = await this.manager.state();
    if (state !== 'PoweredOn') {
      throw new Error('Turn on Bluetooth to discover nearby remote apps.');
    }
    await this.requestBluetoothPermissions();
  }

  private async requestBluetoothPermissions(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }
    const permissions = Number(Platform.Version) >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const results = await PermissionsAndroid.requestMultiple(permissions);
    if (permissions.some(permission => results[permission] !== PermissionsAndroid.RESULTS.GRANTED)) {
      throw new Error('Bluetooth permissions are required to find and connect to a remote.');
    }
  }

  async scanForDevices(
    onDeviceFound: (device: BluetoothDevice) => void,
    onScanComplete: () => void,
    onScanError?: (error: Error) => void,
  ): Promise<void> {
    if (this.isScanning) {
      return;
    }
    await this.requestBluetoothPermissions();
    this.isScanning = true;
    try {
      this.manager.startDeviceScan([BADMINTON_SERVICE_UUID], null, (error, device) => {
        if (error) {
          this.finishScan(onScanComplete);
          onScanError?.(new Error(error.message));
          return;
        }
        if (device) {
          onDeviceFound({
            id: device.id,
            name: device.name || device.localName || `Badminton Score Remote (${device.id.slice(-5)})`,
            rssi: device.rssi ?? undefined,
          });
        }
      });
    } catch (error) {
      this.isScanning = false;
      throw error;
    }
    this.scanTimeout = setTimeout(() => this.finishScan(onScanComplete), 12000);
  }

  private finishScan(onScanComplete?: () => void): void {
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
    if (this.isScanning) {
      this.manager.stopDeviceScan();
      this.isScanning = false;
    }
    onScanComplete?.();
  }

  stopScan(): void {
    this.finishScan();
  }

  async connectToDevice(deviceId: string): Promise<void> {
    let connectingDevice: Device | null = null;
    try {
      await this.requestBluetoothPermissions();
      this.stopScan();
      connectingDevice = await this.manager.connectToDevice(deviceId, { timeout: 15000 });
      await connectingDevice.discoverAllServicesAndCharacteristics();

      const services = await connectingDevice.services();
      const service = services.find(
        item => normalizeUuid(item.uuid) === normalizeUuid(BADMINTON_SERVICE_UUID),
      );
      if (!service) {
        const availableServices = services.map(item => item.uuid).join(', ') || 'none';
        throw new Error(
          `Connected, but the remote did not expose the Badminton Score service. ` +
          `Available services: ${availableServices}. Confirm the updated Remote app is installed and open.`,
        );
      }

      const characteristics = await service.characteristics();
      const characteristic = characteristics.find(
        item => normalizeUuid(item.uuid) === normalizeUuid(CONTROL_CHARACTERISTIC_UUID),
      );
      if (!characteristic?.isNotifiable) {
        throw new Error('The selected remote app does not provide score notifications.');
      }
      const scoreCharacteristic = characteristics.find(
        item => normalizeUuid(item.uuid) === normalizeUuid(SCORE_CHARACTERISTIC_UUID),
      );
      if (!scoreCharacteristic?.isWritableWithResponse) {
        throw new Error('The selected remote app cannot receive live score updates. Update the Remote app and reconnect.');
      }
      this.connectedDevice = connectingDevice;
      this.scoreCharacteristic = scoreCharacteristic;
      this.disconnectionSubscription = this.manager.onDeviceDisconnected(deviceId, () => {
        if (this.connectedDevice?.id !== deviceId) {
          return;
        }
        this.connectedDevice = null;
        this.disconnectionSubscription?.remove();
        this.disconnectionSubscription = null;
        this.onConnectionChangeCallback?.(false);
      });
      this.controlSubscription = characteristic.monitor((error, updatedCharacteristic) => {
          if (error) {
            console.error('Remote score notification failed:', error.message);
            return;
          }
          const bytes = updatedCharacteristic?.value
            ? decodeBytesFromBase64(updatedCharacteristic.value)
            : null;
          const action = bytes?.length ? decodeRemoteCommand(bytes) : null;
          if (!action) {
            console.error('Ignoring invalid score notification from the remote app.');
            return;
          }
          this.onScoreUpdateCallback?.(action);
        });
      this.onConnectionChangeCallback?.(true, connectingDevice.name || 'Badminton Score Remote');
      this.sendCurrentScore();
    } catch (error) {
      this.disconnectionSubscription?.remove();
      this.disconnectionSubscription = null;
      this.controlSubscription?.remove();
      this.controlSubscription = null;
      this.connectedDevice = null;
      this.scoreCharacteristic = null;
      if (connectingDevice) {
        try {
          await this.manager.cancelDeviceConnection(connectingDevice.id);
        } catch (disconnectError) {
          console.error('Failed to clean up an unsuccessful Bluetooth connection:', disconnectError);
        }
      }
      this.onConnectionChangeCallback?.(false);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const deviceId = this.connectedDevice?.id;
    if (!deviceId) {
      return;
    }
    try {
      await this.manager.cancelDeviceConnection(deviceId);
    } finally {
      this.disconnectionSubscription?.remove();
      this.disconnectionSubscription = null;
      this.controlSubscription?.remove();
      this.controlSubscription = null;
      this.connectedDevice = null;
      this.scoreCharacteristic = null;
      this.onConnectionChangeCallback?.(false);
    }
  }

  onScoreUpdate(callback: (action: ScoreAction) => void): void {
    this.onScoreUpdateCallback = callback;
  }

  onConnectionChange(callback: (connected: boolean, deviceName?: string) => void): void {
    this.onConnectionChangeCallback = callback;
  }

  setCurrentScore(teamA: number, teamB: number): void {
    if (
      !Number.isInteger(teamA) || teamA < 0 || teamA > 255 ||
      !Number.isInteger(teamB) || teamB < 0 || teamB > 255
    ) {
      throw new Error('Scores sent to the remote must be whole numbers from 0 to 255.');
    }
    this.currentScore = { teamA, teamB };
    this.sendCurrentScore();
  }

  private sendCurrentScore(): void {
    const characteristic = this.scoreCharacteristic;
    const device = this.connectedDevice;
    if (!characteristic || !device) {
      return;
    }
    const value = encodeBytesToBase64([this.currentScore.teamA, this.currentScore.teamB]);
    this.scoreWriteQueue = this.scoreWriteQueue
      .then(async () => {
        if (this.connectedDevice?.id !== device.id || this.scoreCharacteristic !== characteristic) {
          return;
        }
        await characteristic.writeWithResponse(value);
      })
      .catch(error => {
        console.error('Unable to send the current score to the remote:', error);
      });
  }

  destroy(): void {
    this.stopScan();
    this.disconnectionSubscription?.remove();
    this.disconnectionSubscription = null;
    this.controlSubscription?.remove();
    this.controlSubscription = null;
    this.connectedDevice = null;
    this.manager.destroy();
  }
}

const bluetoothService = new BluetoothService();
export default bluetoothService;
