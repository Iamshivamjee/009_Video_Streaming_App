import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { GameProvider } from './src/context/GameContext';
import { BluetoothProvider } from './src/context/BluetoothContext';
import { ControlPanel } from './src/components/ControlPanel';
import { CameraRecordingScreen } from './src/components/CameraRecordingScreen';

const App: React.FC = () => {
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  return (
    <GameProvider>
      <BluetoothProvider>
        <SafeAreaView style={styles.container}>
          <StatusBar
            barStyle="light-content"
            backgroundColor="#1a1a2e"
            hidden={isCameraOpen}
          />
          {isCameraOpen ? (
            <CameraRecordingScreen onClose={() => setIsCameraOpen(false)} />
          ) : (
            <ControlPanel onOpenCamera={() => setIsCameraOpen(true)} />
          )}
        </SafeAreaView>
      </BluetoothProvider>
    </GameProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
});

export default App;