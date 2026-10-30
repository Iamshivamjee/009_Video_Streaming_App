import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { recordView, stopRecording } from 'react-native-screen-record';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { ScoreOverlay } from './ScoreOverlay';

interface VideoStorageModule {
  saveToGallery(recordingUri: string): Promise<string>;
  setSensorOrientation(enabled: boolean): Promise<void>;
  setKeepScreenOn(enabled: boolean): Promise<void>;
  startAudioCapture(): Promise<string>;
  stopAudioCapture(): Promise<string>;
  mergeAudioIntoVideo(videoUri: string, audioUri: string): Promise<string>;
}

const videoStorage = NativeModules.BadmintonVideoStorage as VideoStorageModule | undefined;

interface CameraRecordingScreenProps {
  onClose: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const CameraRecordingScreen: React.FC<CameraRecordingScreenProps> = ({ onClose }) => {
  const videoViewRef = useRef<View>(null);
  const recordingPromiseRef = useRef<Promise<string> | null>(null);
  const audioRecordingUriRef = useRef<string | null>(null);
  const permissionRequestedRef = useRef(false);
  const savingRef = useRef(false);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [preparingRecording, setPreparingRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraAreaSize, setCameraAreaSize] = useState({ width: 0, height: 0 });
  const frameWidth = Math.min(cameraAreaSize.width, cameraAreaSize.height * (16 / 9));
  const frameHeight = frameWidth * (9 / 16);

  useEffect(() => {
    if (!videoStorage) {
      return;
    }

    void videoStorage.setSensorOrientation(true).catch(error => {
      setCameraError(`Unable to enable camera rotation: ${errorMessage(error)}`);
    });

    return () => {
      void videoStorage.setSensorOrientation(false).catch(error => {
        console.error('Unable to restore the screen orientation:', error);
      });
    };
  }, []);

  useEffect(() => {
    if (!recording && !saving) {
      return;
    }
    if (!videoStorage) {
      setCameraError('Unable to keep the screen awake: the Android video-storage module is not installed.');
      return;
    }

    let effectActive = true;
    void videoStorage.setKeepScreenOn(true).catch(error => {
      if (effectActive) {
        setCameraError(`Unable to keep the screen awake during recording: ${errorMessage(error)}`);
      }
    });

    return () => {
      effectActive = false;
      void videoStorage.setKeepScreenOn(false).catch(error => {
        console.error('Unable to restore the screen timeout after recording:', error);
      });
    };
  }, [recording, saving]);

  useEffect(() => {
    if (hasPermission || permissionRequestedRef.current) {
      return;
    }

    permissionRequestedRef.current = true;
    void requestPermission().catch(error => {
      setCameraError(`Unable to request camera permission: ${errorMessage(error)}`);
    });
  }, [hasPermission, requestPermission]);

  const requestCameraAccess = useCallback(async () => {
    permissionRequestedRef.current = true;
    try {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert('Camera permission required', 'Allow camera access in Android settings to record a match.');
      }
    } catch (error) {
      Alert.alert('Camera permission error', errorMessage(error));
    }
  }, [requestPermission]);

  const startRecording = useCallback(async () => {
    if (Platform.OS !== 'android' || Number(Platform.Version) < 26) {
      Alert.alert('Unsupported Android version', 'Video recording requires Android 8.0 (API 26) or later.');
      return;
    }
    if (!videoStorage) {
      Alert.alert('Recording unavailable', 'The Android video-storage module is not installed. Rebuild the app.');
      return;
    }
    if (!videoViewRef.current) {
      Alert.alert('Camera is not ready', 'Wait for the camera preview to finish loading, then try again.');
      return;
    }

    try {
      audioRecordingUriRef.current = await videoStorage.startAudioCapture();
      const pendingRecording = recordView(videoViewRef, {
        durationMs: 0,
        width: 1920,
        height: 1080,
        fps: 30,
        bitRate: 24_000_000,
      });
      recordingPromiseRef.current = pendingRecording;
      setRecording(true);

      void pendingRecording.catch(error => {
        if (recordingPromiseRef.current === pendingRecording) {
          recordingPromiseRef.current = null;
          setRecording(false);
          const activeAudioUri = audioRecordingUriRef.current;
          audioRecordingUriRef.current = null;
          if (activeAudioUri) {
            void videoStorage.stopAudioCapture().catch(audioError => {
              console.error('Unable to stop microphone recording after a video error:', audioError);
            });
          }
          Alert.alert('Recording failed', errorMessage(error));
        }
      });
    } catch (error) {
      if (audioRecordingUriRef.current) {
        audioRecordingUriRef.current = null;
        try {
          await videoStorage.stopAudioCapture();
        } catch (audioError) {
          console.error('Unable to clean up microphone recording:', audioError);
        }
      }
      Alert.alert('Recording failed', errorMessage(error));
    }
  }, []);

  const requestRecording = useCallback(async () => {
    if (!cameraReady || saving || cameraError) {
      return;
    }
    try {
      const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Microphone permission required', 'Allow microphone access to include match audio in the recording.');
        return;
      }
    } catch (error) {
      Alert.alert('Microphone permission error', errorMessage(error));
      return;
    }
    setPreparingRecording(true);
  }, [cameraReady, saving, cameraError]);

  const onVideoFrameLayout = useCallback(() => {
    if (!preparingRecording) {
      return;
    }
    setPreparingRecording(false);
    startRecording();
  }, [preparingRecording, startRecording]);

  const stopAndSaveRecording = useCallback(async () => {
    const pendingRecording = recordingPromiseRef.current;
    if (!pendingRecording || !videoStorage || savingRef.current) {
      return;
    }

    savingRef.current = true;
    setSaving(true);

    try {
      stopRecording();
      const audioUri = await videoStorage.stopAudioCapture();
      audioRecordingUriRef.current = null;
      if (Number(Platform.Version) <= 28) {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        );
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error('Storage permission is required to save the recording to the gallery.');
        }
      }

      const recordingUri = await pendingRecording;
      const recordingWithAudioUri = await videoStorage.mergeAudioIntoVideo(recordingUri, audioUri);
      const savedUri = await videoStorage.saveToGallery(recordingWithAudioUri);
      recordingPromiseRef.current = null;
      setRecording(false);
      Alert.alert(
        'Recording saved',
        `The match video, including the score overlay, was saved to Movies/Badminton Score.\n\n${savedUri}`,
      );
    } catch (error) {
      recordingPromiseRef.current = null;
      setRecording(false);
      Alert.alert('Unable to save recording', errorMessage(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    if (!recording) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (saving) {
        return true;
      }
      void stopAndSaveRecording();
      return true;
    });
    return () => subscription.remove();
  }, [recording, saving, stopAndSaveRecording]);

  const closeCamera = useCallback(() => {
    if (recording || preparingRecording || saving) {
      Alert.alert('Recording in progress', 'Stop and save the recording before closing the camera.');
      return;
    }
    onClose();
  }, [onClose, recording, preparingRecording, saving]);

  return (
    <View style={styles.screen}>
      <View
        style={styles.cameraArea}
        onLayout={event => {
          const { width, height } = event.nativeEvent.layout;
          setCameraAreaSize({ width, height });
        }}
      >
        <View
          ref={videoViewRef}
          collapsable={false}
          onLayout={onVideoFrameLayout}
          style={[styles.videoFrame, { width: frameWidth, height: frameHeight }]}
        >
        {hasPermission && device ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive
            video
            audio={false}
            androidPreviewViewType="texture-view"
            onInitialized={() => setCameraReady(true)}
            onError={error => setCameraError(error.message)}
          />
        ) : (
          <View style={styles.cameraMessage}>
            {!hasPermission ? (
              <>
                <Text style={styles.messageText}>Camera access is needed to record a match.</Text>
                <TouchableOpacity style={styles.secondaryButton} onPress={requestCameraAccess}>
                  <Text style={styles.buttonText}>Allow Camera</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.messageText}>No back-facing camera is available on this device.</Text>
            )}
          </View>
        )}

        {hasPermission && !cameraReady && !cameraError && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.messageText}>Starting camera…</Text>
          </View>
        )}

        {hasPermission && device && (
          <ScoreOverlay />
        )}

        {recording && (
          <Pressable
            style={StyleSheet.absoluteFill}
            disabled={saving}
            onLongPress={() => void stopAndSaveRecording()}
            delayLongPress={900}
            accessibilityRole="button"
            accessibilityLabel="Hold to stop and save the recording"
          />
        )}

        {cameraError && (
          <View style={styles.errorBanner}>
            <Text style={styles.messageText}>{cameraError}</Text>
          </View>
        )}
        </View>
      </View>

      {!recording && !preparingRecording && (
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.controlButton, styles.secondaryButton]}
            onPress={closeCamera}
            disabled={saving}
          >
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>

          <Text style={styles.recordingInfo}>
            Hold camera preview to stop · 16:9 1080p · High bitrate · Audio & score included
          </Text>

          <TouchableOpacity
            style={[
              styles.controlButton,
              styles.recordButton,
              (!cameraReady || saving || !!cameraError) && styles.disabledButton,
            ]}
            onPress={requestRecording}
            disabled={!cameraReady || saving || !!cameraError}
          >
            <Text style={styles.buttonText}>Record</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraArea: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  videoFrame: {
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  cameraMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  messageText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    gap: 12,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    padding: 12,
    backgroundColor: 'rgba(150, 0, 0, 0.9)',
    borderRadius: 8,
  },
  controls: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    gap: 8,
    backgroundColor: '#101018',
  },
  controlButton: {
    minWidth: 92,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#444455',
  },
  recordButton: {
    backgroundColor: '#c62828',
  },
  disabledButton: {
    opacity: 0.45,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  recordingInfo: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    textAlign: 'center',
  },
});
