import React from 'react';
import { BluetoothProvider } from './src/context/BluetoothContext';
import { RemoteControl } from './src/components/RemoteControl';

const App: React.FC = () => {
  return (
    <BluetoothProvider>
      <RemoteControl />
    </BluetoothProvider>
  );
};

export default App;