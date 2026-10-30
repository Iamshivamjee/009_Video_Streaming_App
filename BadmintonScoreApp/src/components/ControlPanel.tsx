import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useBluetooth } from '../context/BluetoothContext';

interface ControlPanelProps {
  onOpenCamera: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ onOpenCamera }) => {
  const {
    isScanning,
    isConnected, 
    connectedDeviceName, 
    discoveredDevices,
    scanForDevices,
    stopScan,
    connectToDevice,
    disconnect,
    error,
  } = useBluetooth();

  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Bluetooth Connection Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📡 Bluetooth Remote</Text>
            <View 
              style={[
                styles.bluetoothButton, 
                isConnected && styles.bluetoothButtonConnected
              ]}
            >
              <Text style={styles.bluetoothButtonText}>
                {isConnected
                  ? `Connected: ${connectedDeviceName}`
                  : error ? 'Bluetooth unavailable' : 'Ready to find remote'}
              </Text>
            </View>
          </View>
          <Text style={styles.inputLabel}>
            Search for nearby Badminton Score Remote apps, then select the device to connect.
          </Text>
          <TouchableOpacity
            style={[styles.bluetoothActionButton, isConnected && styles.bluetoothDisconnectButton]}
            onPress={() => {
              if (isConnected) {
                void disconnect();
              } else if (isScanning) {
                stopScan();
              } else {
                void scanForDevices();
              }
            }}
          >
            <Text style={styles.bluetoothActionText}>
              {isConnected ? 'Disconnect Remote' : isScanning ? 'Stop Searching' : 'Find Remote Apps'}
            </Text>
          </TouchableOpacity>

          {!isConnected && discoveredDevices.map(device => (
            <TouchableOpacity
              key={device.id}
              style={styles.bluetoothDevice}
              disabled={connectingDeviceId !== null}
              onPress={() => {
                setConnectingDeviceId(device.id);
                void connectToDevice(device.id)
                  .catch(connectionError => {
                    Alert.alert(
                      'Unable to connect',
                      connectionError instanceof Error ? connectionError.message : 'Bluetooth connection failed.',
                    );
                  })
                  .finally(() => setConnectingDeviceId(null));
              }}
            >
              <Text style={styles.bluetoothDeviceName}>
                {connectingDeviceId === device.id ? 'Connecting…' : device.name}
              </Text>
              <Text style={styles.bluetoothDeviceSignal}>
                {device.rssi === undefined ? 'Tap to connect' : `Signal ${device.rssi} dBm · Tap to connect`}
              </Text>
            </TouchableOpacity>
          ))}

          {!isConnected && !isScanning && discoveredDevices.length === 0 && !error && (
            <Text style={styles.inputLabel}>
              Turn on the remote app, then tap Find Remote Apps.
            </Text>
          )}

          {isScanning && <Text style={styles.inputLabel}>Searching for nearby remote apps…</Text>}
          
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎥 Match Recording</Text>
          <Text style={styles.inputLabel}>
            Keep this phone mounted on the camera. Team names, scores and game controls are managed from the remote app.
          </Text>
          <TouchableOpacity
            style={[styles.actionButton, styles.recordButton]}
            onPress={onOpenCamera}
          >
            <Text style={styles.actionButtonText}>Open Camera & Record</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  bluetoothButton: {
    backgroundColor: '#00BFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  bluetoothButtonConnected: {
    backgroundColor: '#28a745',
  },
  bluetoothButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  bluetoothActionButton: {
    backgroundColor: '#00BFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  bluetoothDisconnectButton: {
    backgroundColor: '#c62828',
  },
  bluetoothActionText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  bluetoothDevice: {
    backgroundColor: 'rgba(0, 191, 255, 0.12)',
    borderColor: 'rgba(0, 191, 255, 0.5)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  bluetoothDeviceName: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  bluetoothDeviceSignal: {
    color: '#CCCCCC',
    fontSize: 12,
    marginTop: 4,
  },
  errorBanner: {
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    borderColor: '#ff4444',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  inputContainer: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    color: '#CCCCCC',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 16,
  },
  teamControls: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  teamControlTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 12,
    textAlign: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#00BFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00BFFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  controlButtonText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  currentScore: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    minWidth: 60,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  serverToggleButton: {
    backgroundColor: '#FFD700',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  serverToggleText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  actionButtons: {
    gap: 12,
  },
  actionButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#28a745',
  },
  recordButton: {
    backgroundColor: '#c62828',
    marginTop: 12,
  },
  resetButton: {
    backgroundColor: '#ffc107',
  },
  resetMatchButton: {
    backgroundColor: '#dc3545',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statusSection: {
    alignItems: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusLabel: {
    fontSize: 14,
    color: '#CCCCCC',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statusPlaying: {
    color: '#28a745',
  },
  statusFinished: {
    color: '#FFD700',
  },
  winnerText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    marginTop: 8,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#00BFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalClose: {
    fontSize: 24,
    color: '#CCCCCC',
  },
  scanningIndicator: {
    padding: 16,
    alignItems: 'center',
  },
  scanningText: {
    color: '#00BFFF',
    fontSize: 16,
  },
  deviceList: {
    maxHeight: 300,
  },
  deviceItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  deviceInfo: {
    gap: 4,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  deviceId: {
    fontSize: 12,
    color: '#888888',
    fontFamily: 'monospace',
  },
  deviceRssi: {
    fontSize: 12,
    color: '#00BFFF',
  },
  noDevices: {
    textAlign: 'center',
    color: '#888888',
    padding: 20,
  },
  scanAgainButton: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#00BFFF',
    borderRadius: 8,
    alignItems: 'center',
  },
  scanAgainText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});