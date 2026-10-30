# Badminton Score App - Task Tracker

## Project Overview
A badminton match recording app with:
- Camera recording with live score overlay embedded in video
- Bluetooth remote control for score changes
- Compact top-left scoreboard (2.8:1 aspect ratio per reference image)
- Video saved to Android Movies/Badminton Score folder

---

## ✅ COMPLETED TASKS

### 1. Project Setup & Architecture
- [x] React Native 0.76 project initialized (BadmintonScoreApp)
- [x] TypeScript configuration with strict mode
- [x] Android Gradle setup repaired (AGP 8.10, JDK 17)
- [x] Package dependencies resolved

### 2. Bluetooth Score Control (Dual-App Architecture)
- [x] **Display App** (BadmintonScoreApp) - BLE Central
  - Scans only for the Badminton Score Remote service UUID
  - Lists discovered remote apps and connects only after the user selects one
  - Provides an explicit disconnect control on the recorder
  - Game state management (Context API)
- [x] **Remote App** (BadmintonScoreRemote) - BLE GATT peripheral
  - Advertises the app-specific service and score notification characteristic
  - Sends scores, team names, game settings, and game actions to the selected recorder over BLE notifications
  - Receives the recorder's current score over a writable BLE characteristic
  - Start/Pause/Resume, server switch, game reset, and match reset controls
- [x] BLE protocol defined (UUIDs, command format)
- [x] Previous BLE role setup was tested on dual emulators; updated roles still require device testing:
  - Score increments/decrements
  - Server change (Team A ↔ Team B)
  - Game reset
  - Start/Pause/Resume

### 3. Camera & Video Recording
- [x] Camera permission handling (Android CAMERA permission)
- [x] Camera preview follows sensor orientation (portrait and landscape) using `react-native-vision-camera@4.6.4`
- [x] View recording using `react-native-screen-record@1.0.0` (PixelCopy + MediaCodec)
- [x] Recording output requests an exact 1920×1080 frame at a 30 FPS target and 24 Mbps
- [x] The captured camera viewport is constrained to 16:9 before recording, avoiding post-capture center cropping
- [x] PixelCopy scales directly into the encoder-sized bitmap instead of allocating a full-screen intermediate
- [x] Bottom camera controls hide during capture and the recording view expands to full screen before recording starts
- [x] Recording can be stopped and saved by holding the preview or pressing Android Back
- [x] Native video storage module (`BadmintonVideoStorageModule.java`)
  - Saves to MediaStore (Android 10+) / Movies folder (legacy)
  - Enables sensor-based rotation while the camera screen is open; portrait and landscape are both supported
  - Records microphone audio to AAC and muxes it into the saved MP4 with the H.264 video
- [x] Compatibility patch for `react-native-screen-record` (TurboModule → legacy)
- [x] Recording UI: timer, start/stop, save confirmation
- [x] Microphone AAC audio is muxed with the camera-view video in the saved MP4

### 4. Score Overlay (Compact Design)
- [x] Reference image analyzed: ~2.8:1 aspect ratio scoreboard
- [x] **ScoreOverlay.tsx** - Compact scoreboard component:
  - Width: 29% of the camera frame (maximum 360 dp)
  - Aspect ratio: 2.8:1
  - Two team rows with colored accents (Team A: #00d4aa, Team B: #ff6b6b)
  - Score badges with large numbers
  - Serving indicator (●)
  - Game info: "GAME X/Y · TO Z"
  - Match status: READY / IN PROGRESS / PAUSED / FINISHED
- [x] Overlay rendered **only in camera view** (removed from controls screen)
- [x] Overlay positioned top-left with safe margins
- [x] Overlay remains pinned within the exact 16:9 camera frame

### 5. Navigation & UI
- [x] Recorder controls are limited to remote discovery/connection and opening the camera
- [x] Team names, match settings, scoring, and game controls are available from the Remote app
- [x] **ControlPanel.tsx** - Match Recording section with "Open Camera & Record" button

### 6. Android Configuration
- [x] **AndroidManifest.xml**:
  - CAMERA permission
  - RECORD_AUDIO permission (requested before recording)
  - WRITE_EXTERNAL_STORAGE (legacy, API ≤28)
  - Display: BLUETOOTH_SCAN, BLUETOOTH_CONNECT
  - Remote: BLUETOOTH_CONNECT, BLUETOOTH_ADVERTISE
  - Camera feature (optional)
- [x] Native modules registered:
  - `BadmintonBleRemotePackage` (remote BLE GATT server)
  - `BadmintonVideoStoragePackage` (video gallery save)
- [x] Release build configuration:
  - Architectures: `x86_64,arm64-v8a`
  - Gradle heap: 2GB
  - Workers: 2

### 7. Build & Verification
- [x] TypeScript compilation: `npx tsc --noEmit` ✓
- [x] Debug Android build: ✓
- [x] Release Android build: ✓ (multi-arch APK ~51 MB)
- [x] APK contains native libs for both ABIs:
  - `lib/arm64-v8a/libVisionCamera.so`
  - `lib/x86_64/libVisionCamera.so`
- [x] Post-install patch hook verified

### 8. Emulator Testing (Final Release APK)
- [x] Final APK installed on `emulator-5554` (API 37, x86_64)
- [x] Controls screen: no overlay visible ✓
- [x] Camera screen: preview + compact overlay visible ✓
- [x] Recording started, stopped, saved to gallery ✓
- [x] Saved MP4 decoded and verified:
  - H.264, 1080×396
  - Camera scene + scoreboard overlay present in frame
  - File: `BadmintonScore_final_20261008_140007.mp4`
- [ ] Verify microphone audio capture, A/V synchronization, and full scorecard framing on a physical Android device

---

## ⚠️ KNOWN ISSUES / LIMITATIONS

### Critical: Low Frame Rate on Emulator
- **Issue**: Final test recording decoded at **2.24 fps** (55 frames / 24.59s)
- **Expected**: 30 FPS target (configured in `CameraRecordingScreen.tsx`)
- **Root cause**: PixelCopy and screen-frame encoding are more demanding than the phone camera's native video pipeline
- **Host RAM during test**: ~0.5-1.2 GB free (very constrained)
- **Emulator warning**: "System UI isn't responding" during recording
- **Mitigation**: PixelCopy scales directly to the encoder-sized bitmap; the viewport now matches 16:9 and recording requests 1080p, 30 FPS, and 24 Mbps
- **Status**: Must be measured again on the physical device; configured FPS is not a guarantee

### Native camera quality limitation
- The scoreboard is embedded by encoding a capture of the camera preview. This is not the camera's native encoded video stream, so matching the stock camera's image quality exactly is not guaranteed.
- A true native-quality recording with a baked-in scoreboard requires a native camera/encoder compositor; simply raising the screen-capture bitrate cannot remove this difference.

### Untested Scenarios
- [ ] Physical device camera recording (frame rate, quality, orientation)
- [ ] Physical device video playback (overlay visibility, sync)
- [ ] Bluetooth remote score changes **during active recording**
- [ ] Test recorder-side remote-app discovery, explicit selection, and disconnect on physical devices
- [ ] Two-device Bluetooth test of the updated roles, score changes, and reconnect after disconnect
- [ ] Long-duration recording stability (>5 min)
- [ ] App background/foreground during recording
- [ ] Storage permission edge cases (scoped storage, denied permissions)

### Code Quality
- [ ] No unit/integration tests (Jest runs with `--passWithNoTests`)
- [ ] No ESLint configuration
- [ ] Release build uses debug signing (not Play Store ready)
- [ ] Error boundaries not implemented

---

## 📋 PENDING TASKS (Priority Order)

### P0 - Must Fix Before Match Use
1. **Verify the updated recording performance on a physical Android device**
   - Install updated APK on phone
   - Record 30+ second clip
   - Verify frame rate ≥ 24 fps
   - Verify overlay visible in saved video
   - Record in portrait and landscape and verify video orientation, full-screen framing, and scoreboard placement

2. **Test Bluetooth remote during recording**
   - Pair display + remote apps on two phones
   - Start recording on display
   - Change scores from remote
   - Verify overlay updates in real-time in recording
   - Stop and verify saved video has all score changes
   - Verify team names, winning score, best-of, start/pause, and reset controls work from the remote

### P1 - Should Fix
3. **Investigate/improve recording frame rate if still below target**
   - If physical device also low FPS: profile PixelCopy + encoder
   - Consider: camera-native recording and a post-processing overlay pipeline
   - Document minimum device specs

4. **Add recording quality settings**
   - User-selectable: 720p/1080p, 30/60 fps, bitrate
   - Storage space estimation

5. **Two-device integration test (final APK)**
   - Verify BLE connection stability during recording
   - Test reconnection if dropped

### P2 - Nice to Have
6. **Video trimming/sharing from app**
7. **Match history / video gallery in-app**
8. **Export match data (CSV/JSON) with video**
9. **Play Store release build** (proper signing, privacy policy, etc.)

---

## 📁 KEY FILES MODIFIED/CREATED

### App Source
```
BadmintonScoreApp/
├── App.tsx                                    # Navigation, providers
├── src/
│   ├── context/
│   │   ├── GameContext.tsx                    # Game state, scores, settings
│   │   └── BluetoothContext.tsx               # BLE server state
│   ├── components/
│   │   ├── CameraRecordingScreen.tsx          # Camera + recording + overlay
│   │   ├── ScoreOverlay.tsx                   # Compact scoreboard (2.8:1)
│   │   ├── ControlPanel.tsx                   # Controls screen UI
│   │   └── ... (other components)
│   └── ...
├── android/
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml                # Permissions, features
│   │   └── java/com/badmintonscoreapp/
│   │       ├── BadmintonBlePeripheralPackage.java
│   │       ├── BadmintonVideoStorageModule.java
│   │       └── BadmintonVideoStoragePackage.java
├── patches/
│   └── react-native-screen-record+1.0.0.patch # TurboModule compatibility
└── package.json                               # Dependencies + postinstall
```

### Remote App (Separate Project)
```
BadmintonScoreRemote/
├── App.tsx
├── src/
│   ├── context/BluetoothContext.tsx           # BLE central
│   └── components/RemoteControlPanel.tsx
└── android/... (similar BLE setup)
```

---

## 🚀 DEPLOYMENT INSTRUCTIONS

### For Physical Device Testing

#### Display App (BadmintonScoreApp)
```bash
cd C:\Users\HP\Desktop\Code\009_Video_Streaming_App\BadmintonScoreApp

# Option 1: Install release APK directly
adb install -r android/app/build/outputs/apk/release/app-release.apk

# Option 2: Build and install debug (for logging)
npx react-native run-android --variant=debug
```

#### Remote App (BadmintonScoreRemote)
```bash
cd C:\Users\HP\Desktop\Code\009_Video_Streaming_App\BadmintonScoreRemote
npx react-native run-android --variant=debug
# Or build release APK similarly
```

### Required Device Setup
1. **Two Android devices** (API 26+ / Android 8.0+)
2. **Bluetooth enabled** on both
3. **Location permission** granted (required for BLE scan on Android 12+)
4. **Camera permission** granted on display device
5. **Storage permission** granted on display device (for video save)

### Test Procedure
1. Install both apps
2. Open Display app → note "Advertising for remote"
3. Open Remote app → tap display device to connect
4. On Display: "Open Camera & Record" → allow permissions
5. On Display: "Record" → play match
6. On Remote: Change scores during recording
7. On Display: "Stop & Save" → check gallery
8. Play back video → verify overlay embedded

---

## 📝 NOTES FOR NEXT SESSION

- **Start with physical device test** - this is the critical path
- If frame rate is good on device: proceed to Bluetooth-during-recording test
- If frame rate is poor: profile with `adb shell dumpsys gfxinfo` and `systrace`
- The `react-native-screen-record` library uses PixelCopy which captures at screen refresh rate; emulator vs device performance may differ significantly
- Consider adding a "test recording" button that records 5s and shows fps estimate

---

*Last updated: 2026-10-08 14:14 IST*
*Final release APK: `BadmintonScoreApp/android/app/build/outputs/apk/release/app-release.apk`*