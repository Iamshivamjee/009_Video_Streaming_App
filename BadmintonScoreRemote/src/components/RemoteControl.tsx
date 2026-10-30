import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView,
  Alert,
  SafeAreaView,
  StatusBar,
  TextInput,
} from 'react-native';
import { useBluetooth } from '../context/BluetoothContext';
import { ScoreAction } from '../types';

function utf8ByteLength(value: string): number {
  let byteLength = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    byteLength += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return byteLength;
}

export const RemoteControl: React.FC = () => {
  const { 
    isConnected, 
    connectedDeviceName, 
    sendAction,
    sendTeamName,
    sendWinningScore,
    sendBestOf,
    sendGameStatus,
    currentScore,
    error,
  } = useBluetooth();
  const [teamAName, setTeamAName] = useState('Team A');
  const [teamBName, setTeamBName] = useState('Team B');
  const [winningScore, setWinningScore] = useState('21');
  const [bestOf, setBestOf] = useState('3');
  const [savingSettings, setSavingSettings] = useState(false);

  const sendScoreAction = async (action: ScoreAction) => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Connect to the video recorder from the display app first.');
      return;
    }
    try {
      await sendAction(action);
    } catch (sendError) {
      Alert.alert('Unable to send command', sendError instanceof Error ? sendError.message : 'Bluetooth command failed.');
    }
  };

  const saveMatchSettings = async () => {
    const trimmedTeamAName = teamAName.trim();
    const trimmedTeamBName = teamBName.trim();
    const score = Number(winningScore);
    const games = Number(bestOf);
    if (
      !trimmedTeamAName ||
      !trimmedTeamBName ||
      utf8ByteLength(trimmedTeamAName) > 19 ||
      utf8ByteLength(trimmedTeamBName) > 19
    ) {
      Alert.alert('Invalid team name', 'Each team name must fit within 19 UTF-8 bytes and cannot be empty.');
      return;
    }
    if (!Number.isInteger(score) || score < 1 || score > 255 || !Number.isInteger(games) || games < 1 || games > 255) {
      Alert.alert('Invalid game settings', 'Winning score and best-of must be whole numbers from 1 to 255.');
      return;
    }

    setSavingSettings(true);
    try {
      await sendTeamName('A', trimmedTeamAName);
      await sendTeamName('B', trimmedTeamBName);
      await sendWinningScore(score);
      await sendBestOf(games);
      Alert.alert('Settings saved', 'Team names and game settings were updated on the recorder.');
    } catch (sendError) {
      Alert.alert('Unable to save settings', sendError instanceof Error ? sendError.message : 'Bluetooth command failed.');
    } finally {
      setSavingSettings(false);
    }
  };

  const sendTeamNameOnBlur = async (team: 'A' | 'B', value: string) => {
    const name = value.trim();
    if (!name || utf8ByteLength(name) > 19) {
      Alert.alert('Invalid team name', 'Each team name must fit within 19 UTF-8 bytes and cannot be empty.');
      return;
    }
    try {
      await sendTeamName(team, name);
    } catch (sendError) {
      Alert.alert('Unable to update team name', sendError instanceof Error ? sendError.message : 'Bluetooth command failed.');
    }
  };

  const resetMatch = async () => {
    try {
      await sendAction({ type: 'RESET_MATCH' });
      setTeamAName('Team A');
      setTeamBName('Team B');
      setWinningScore('21');
      setBestOf('3');
    } catch (sendError) {
      Alert.alert('Unable to reset match', sendError instanceof Error ? sendError.message : 'Bluetooth command failed.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Connection Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Text style={styles.statusTitle}>📡 Remote Controller</Text>
            <View style={[
              styles.connectionIndicator,
              isConnected ? styles.connected : styles.disconnected
            ]}>
              <Text style={styles.connectionText}>
                {isConnected ? '● Connected' : '○ Disconnected'}
              </Text>
            </View>
          </View>
          
          {isConnected && (
            <Text style={styles.connectedDevice}>
              Paired with: {connectedDeviceName}
            </Text>
          )}
          
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>

        {/* Connection Controls */}
        <View style={styles.section}>
          <View style={[styles.mainButton, isConnected ? styles.buttonConnect : styles.remoteWaiting]}>
            <Text style={styles.mainButtonText}>
              {isConnected ? 'Connected to video recorder' : 'Waiting for video recorder'}
            </Text>
          </View>
          <Text style={styles.remoteHint}>
            Open the display app and tap “Find Remote Apps” to discover and connect to this controller.
          </Text>
        </View>

        {/* Score Controls - Only show when connected */}
        {isConnected && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🏷️ Teams & Match Settings</Text>
              <Text style={styles.remoteHint}>
                Team names are sent when you finish editing. Save Match Settings applies both names and game settings.
              </Text>
              <Text style={styles.fieldLabel}>Team A name</Text>
              <TextInput
                style={styles.settingsInput}
                value={teamAName}
                onChangeText={setTeamAName}
                placeholder="Team A"
                placeholderTextColor="#888888"
                autoCapitalize="words"
                maxLength={20}
                onEndEditing={({ nativeEvent }) => void sendTeamNameOnBlur('A', nativeEvent.text)}
              />
              <Text style={styles.fieldLabel}>Team B name</Text>
              <TextInput
                style={styles.settingsInput}
                value={teamBName}
                onChangeText={setTeamBName}
                placeholder="Team B"
                placeholderTextColor="#888888"
                autoCapitalize="words"
                maxLength={20}
                onEndEditing={({ nativeEvent }) => void sendTeamNameOnBlur('B', nativeEvent.text)}
              />
              <View style={styles.settingsRow}>
                <View style={styles.settingsField}>
                  <Text style={styles.fieldLabel}>Winning score</Text>
                  <TextInput
                    style={styles.settingsInput}
                    value={winningScore}
                    onChangeText={setWinningScore}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                </View>
                <View style={styles.settingsField}>
                  <Text style={styles.fieldLabel}>Best of</Text>
                  <TextInput
                    style={styles.settingsInput}
                    value={bestOf}
                    onChangeText={setBestOf}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[styles.settingsSaveButton, savingSettings && styles.disabledButton]}
                disabled={savingSettings}
                onPress={() => void saveMatchSettings()}
              >
                <Text style={styles.controlButtonText}>{savingSettings ? 'Saving…' : 'Save Match Settings'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🎮 Score Controls</Text>
              <View style={styles.currentScoreCard} accessibilityLabel="Current match score">
                <View style={styles.currentScoreTeam}>
                  <Text numberOfLines={1} style={styles.currentScoreName}>{teamAName || 'TEAM A'}</Text>
                  <Text style={styles.currentScoreValue}>{currentScore?.teamA ?? '–'}</Text>
                </View>
                <Text style={styles.currentScoreSeparator}>:</Text>
                <View style={styles.currentScoreTeam}>
                  <Text numberOfLines={1} style={styles.currentScoreName}>{teamBName || 'TEAM B'}</Text>
                  <Text style={styles.currentScoreValue}>{currentScore?.teamB ?? '–'}</Text>
                </View>
              </View>
              {!currentScore && (
                <Text style={styles.remoteHint}>Waiting for the recorder to send the live score…</Text>
              )}
              
              {/* Team A Controls */}
              <View style={styles.teamControlCard}>
                <Text style={styles.teamLabel}>{teamAName || 'TEAM A'}</Text>
                <View style={styles.scoreControlRow}>
                  <TouchableOpacity 
                    style={styles.scoreButton}
                    onPress={() => sendScoreAction({ type: 'DECREMENT_TEAM_A' })}
                  >
                    <Text style={styles.scoreButtonText}>−</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.scoreButtonPrimary}
                    onPress={() => sendScoreAction({ type: 'INCREMENT_TEAM_A' })}
                  >
                    <Text style={styles.scoreButtonTextPrimary}>+1</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Team B Controls */}
              <View style={styles.teamControlCard}>
                <Text style={styles.teamLabel}>{teamBName || 'TEAM B'}</Text>
                <View style={styles.scoreControlRow}>
                  <TouchableOpacity 
                    style={styles.scoreButton}
                    onPress={() => sendScoreAction({ type: 'DECREMENT_TEAM_B' })}
                  >
                    <Text style={styles.scoreButtonText}>−</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.scoreButtonPrimary}
                    onPress={() => sendScoreAction({ type: 'INCREMENT_TEAM_B' })}
                  >
                    <Text style={styles.scoreButtonTextPrimary}>+1</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Additional Controls */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>⚙️ Game Controls</Text>
              
              <View style={styles.controlGrid}>
                <TouchableOpacity
                  style={styles.controlButton}
                  onPress={() => void sendGameStatus(true).catch(sendError => {
                    Alert.alert('Unable to start game', sendError instanceof Error ? sendError.message : 'Bluetooth command failed.');
                  })}
                >
                  <Text style={styles.controlButtonText}>▶ Start Game</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.controlButton}
                  onPress={() => void sendGameStatus(false).catch(sendError => {
                    Alert.alert('Unable to pause game', sendError instanceof Error ? sendError.message : 'Bluetooth command failed.');
                  })}
                >
                  <Text style={styles.controlButtonText}>⏸ Pause Game</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.controlButton}
                  onPress={() => sendScoreAction({ type: 'TOGGLE_SERVER' })}
                >
                  <Text style={styles.controlButtonText}>🔄 Switch Server</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.controlButton}
                  onPress={() => sendScoreAction({ type: 'RESET_GAME' })}
                >
                  <Text style={styles.controlButtonText}>🔄 Reset Game</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.controlButton, styles.controlButtonDanger]}
                  onPress={() => {
                    Alert.alert('Reset Match', 'Reset the entire match?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Reset', onPress: () => void resetMatch(), style: 'destructive' },
                    ]);
                  }}
                >
                  <Text style={styles.controlButtonText}>🗑️ Reset Match</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* Instructions when not connected */}
        {!isConnected && (
          <View style={styles.instructionsCard}>
            <Text style={styles.instructionsTitle}>How to Use</Text>
            <View style={styles.instructionItem}>
              <Text style={styles.instructionNumber}>1</Text>
              <Text style={styles.instructionText}>
                Open the recorder app on the camera phone
              </Text>
            </View>
            <View style={styles.instructionItem}>
              <Text style={styles.instructionNumber}>2</Text>
              <Text style={styles.instructionText}>
              Tap “Find Remote Apps” on the recorder
              </Text>
            </View>
            <View style={styles.instructionItem}>
              <Text style={styles.instructionNumber}>3</Text>
              <Text style={styles.instructionText}>
                Select this remote from the recorder’s discovered-device list
              </Text>
            </View>
            <View style={styles.instructionItem}>
              <Text style={styles.instructionNumber}>4</Text>
              <Text style={styles.instructionText}>
                Use the buttons to control the score remotely
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

    </SafeAreaView>
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
  statusCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  connectionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  connected: {
    backgroundColor: 'rgba(40, 167, 69, 0.2)',
  },
  disconnected: {
    backgroundColor: 'rgba(220, 53, 69, 0.2)',
  },
  connectionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  connectedDevice: {
    fontSize: 14,
    color: '#00BFFF',
    fontWeight: '500',
  },
  errorBanner: {
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    borderColor: '#ff4444',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
  },
  section: {
    marginBottom: 24,
  },
  fieldLabel: {
    color: '#CCCCCC',
    fontSize: 14,
    marginBottom: 6,
    marginTop: 10,
  },
  settingsInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  settingsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  settingsField: {
    flex: 1,
  },
  settingsSaveButton: {
    alignItems: 'center',
    backgroundColor: '#00BFFF',
    borderRadius: 10,
    marginTop: 16,
    padding: 14,
  },
  disabledButton: {
    opacity: 0.6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  mainButton: {
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonConnect: {
    backgroundColor: '#00BFFF',
  },
  buttonDisconnect: {
    backgroundColor: '#dc3545',
  },
  remoteWaiting: {
    backgroundColor: '#666677',
  },
  remoteHint: {
    color: '#CCCCCC',
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 12,
  },
  mainButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  teamControlCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  currentScoreCard: {
    backgroundColor: 'rgba(0, 191, 255, 0.12)',
    borderColor: 'rgba(0, 191, 255, 0.5)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  currentScoreTeam: {
    flex: 1,
    alignItems: 'center',
  },
  currentScoreName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    maxWidth: '100%',
  },
  currentScoreValue: {
    color: '#FFD700',
    fontSize: 42,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  currentScoreSeparator: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
    paddingHorizontal: 12,
  },
  teamLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 2,
  },
  scoreControlRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  scoreButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(220, 53, 69, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#dc3545',
  },
  scoreButtonPrimary: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#28a745',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  scoreButtonText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#dc3545',
  },
  scoreButtonTextPrimary: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  controlGrid: {
    gap: 12,
  },
  controlButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  controlButtonDanger: {
    borderColor: '#dc3545',
    backgroundColor: 'rgba(220, 53, 69, 0.1)',
  },
  controlButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  instructionsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  instructionNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#00BFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  instructionText: {
    fontSize: 16,
    color: '#CCCCCC',
    flex: 1,
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