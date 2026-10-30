package com.badmintonscoreremote;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.ParcelUuid;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.util.Arrays;
import java.util.Set;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Queue;
import java.util.concurrent.ConcurrentHashMap;

public final class BadmintonBleRemoteModule extends ReactContextBaseJavaModule {
  private static final UUID SERVICE_UUID =
      UUID.fromString("12345678-1234-1234-1234-123456789abc");
  private static final UUID SCORE_CHARACTERISTIC_UUID =
      UUID.fromString("12345678-1234-1234-1234-123456789abd");
  private static final UUID CONTROL_CHARACTERISTIC_UUID =
      UUID.fromString("12345678-1234-1234-1234-123456789abe");
  private static final UUID CLIENT_CONFIGURATION_UUID =
      UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
  private static final int FIRST_ACTION_CODE = 1;
  private static final int LAST_ACTION_CODE = 7;
  private static final int FIRST_SETTINGS_CODE = 8;
  private static final int LAST_SETTINGS_CODE = 13;

  private final ReactApplicationContext reactContext;
  private final Set<BluetoothDevice> connectedDevices = ConcurrentHashMap.newKeySet();
  private final Set<BluetoothDevice> subscribedDevices = ConcurrentHashMap.newKeySet();
  private final Queue<PendingNotification> notificationQueue = new ArrayDeque<>();
  private BluetoothGattServer gattServer;
  private BluetoothLeAdvertiser advertiser;
  private BluetoothGattCharacteristic controlCharacteristic;
  private BluetoothGattCharacteristic scoreCharacteristic;
  private Promise startPromise;
  private boolean notificationInFlight;

  private static final class PendingNotification {
    final byte[] value;
    final Promise promise;

    PendingNotification(byte[] value, Promise promise) {
      this.value = value;
      this.promise = promise;
    }
  }

  private final BluetoothGattServerCallback gattCallback = new BluetoothGattServerCallback() {
    @Override
    public void onServiceAdded(int status, BluetoothGattService service) {
      if (!SERVICE_UUID.equals(service.getUuid())) {
        return;
      }
      if (status != BluetoothGatt.GATT_SUCCESS) {
        rejectStart("SERVICE_SETUP_FAILED", "Android could not register the remote Bluetooth service.");
        return;
      }
      startAdvertising();
    }

    @Override
    public void onConnectionStateChange(BluetoothDevice device, int status, int newState) {
      if (status == BluetoothGatt.GATT_SUCCESS && newState == BluetoothProfile.STATE_CONNECTED) {
        if (!connectedDevices.isEmpty() && !connectedDevices.contains(device)) {
          if (gattServer != null) {
            gattServer.cancelConnection(device);
          }
          return;
        }
        connectedDevices.add(device);
      } else if (newState == BluetoothProfile.STATE_DISCONNECTED || status != BluetoothGatt.GATT_SUCCESS) {
        connectedDevices.remove(device);
        subscribedDevices.remove(device);
        rejectPendingNotifications("The recorder disconnected before the command was sent.");
      } else {
        return;
      }
      emitConnectionChange();
    }

    @Override
    public void onDescriptorWriteRequest(
        BluetoothDevice device,
        int requestId,
        BluetoothGattDescriptor descriptor,
        boolean preparedWrite,
        boolean responseNeeded,
        int offset,
        byte[] value) {
      if (!CLIENT_CONFIGURATION_UUID.equals(descriptor.getUuid())
          || preparedWrite
          || offset != 0
          || value == null) {
        respond(device, requestId, responseNeeded, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, offset);
        return;
      }
      if (Arrays.equals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE, value)) {
        subscribedDevices.add(device);
      } else if (Arrays.equals(BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE, value)) {
        subscribedDevices.remove(device);
      } else {
        respond(device, requestId, responseNeeded, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, offset);
        return;
      }
      descriptor.setValue(value);
      respond(device, requestId, responseNeeded, BluetoothGatt.GATT_SUCCESS, offset);
      emitConnectionChange();
    }

    @Override
    public void onCharacteristicWriteRequest(
        BluetoothDevice device,
        int requestId,
        BluetoothGattCharacteristic characteristic,
        boolean preparedWrite,
        boolean responseNeeded,
        int offset,
        byte[] value) {
      if (!SCORE_CHARACTERISTIC_UUID.equals(characteristic.getUuid())
          || preparedWrite
          || offset != 0
          || value == null
          || value.length != 2) {
        respond(
            device,
            requestId,
            responseNeeded,
            BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED,
            offset);
        return;
      }
      respond(device, requestId, responseNeeded, BluetoothGatt.GATT_SUCCESS, offset);
      emitScoreUpdate(value[0] & 0xff, value[1] & 0xff);
    }

    @Override
    public void onNotificationSent(BluetoothDevice device, int status) {
      completeNotification(status);
    }
  };

  private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {
    @Override
    public void onStartSuccess(AdvertiseSettings settingsInEffect) {
      Promise promise = startPromise;
      startPromise = null;
      if (promise != null) {
        promise.resolve(null);
      }
    }

    @Override
    public void onStartFailure(int errorCode) {
      rejectStart("ADVERTISING_FAILED", "Bluetooth advertising failed with error code " + errorCode + ".");
    }
  };

  BadmintonBleRemoteModule(ReactApplicationContext context) {
    super(context);
    reactContext = context;
  }

  @NonNull
  @Override
  public String getName() {
    return "BadmintonBleRemote";
  }

  @ReactMethod
  public void start(Promise promise) {
    if (gattServer != null && advertiser != null) {
      promise.resolve(null);
      return;
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        && (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(reactContext, Manifest.permission.BLUETOOTH_ADVERTISE)
                != PackageManager.PERMISSION_GRANTED)) {
      promise.reject("BLUETOOTH_PERMISSION_DENIED", "Bluetooth connect and advertise permissions are required.");
      return;
    }

    startPromise = promise;
    BluetoothManager manager = (BluetoothManager) reactContext.getSystemService(Context.BLUETOOTH_SERVICE);
    BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
    if (adapter == null || !adapter.isEnabled()) {
      rejectStart("BLUETOOTH_UNAVAILABLE", "Turn on Bluetooth on the remote device.");
      return;
    }
    try {
      advertiser = adapter.getBluetoothLeAdvertiser();
      gattServer = manager.openGattServer(reactContext, gattCallback);
      if (advertiser == null || gattServer == null) {
        rejectStart("BLE_SERVER_UNAVAILABLE", "Android could not open the remote Bluetooth service.");
        return;
      }

      BluetoothGattService service =
          new BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY);
      controlCharacteristic =
          new BluetoothGattCharacteristic(
              CONTROL_CHARACTERISTIC_UUID,
              BluetoothGattCharacteristic.PROPERTY_READ | BluetoothGattCharacteristic.PROPERTY_NOTIFY,
              BluetoothGattCharacteristic.PERMISSION_READ);
      controlCharacteristic.addDescriptor(
          new BluetoothGattDescriptor(
              CLIENT_CONFIGURATION_UUID,
              BluetoothGattDescriptor.PERMISSION_READ | BluetoothGattDescriptor.PERMISSION_WRITE));
      scoreCharacteristic =
          new BluetoothGattCharacteristic(
              SCORE_CHARACTERISTIC_UUID,
              BluetoothGattCharacteristic.PROPERTY_WRITE,
              BluetoothGattCharacteristic.PERMISSION_WRITE);
      service.addCharacteristic(controlCharacteristic);
      service.addCharacteristic(scoreCharacteristic);
      if (!gattServer.addService(service)) {
        rejectStart("SERVICE_SETUP_FAILED", "Android rejected the remote Bluetooth service.");
      }
    } catch (SecurityException exception) {
      rejectStart("BLUETOOTH_PERMISSION_DENIED", exception.getMessage());
    }
  }

  @ReactMethod
  public void sendAction(int actionCode, Promise promise) {
    if (actionCode < FIRST_ACTION_CODE || actionCode > LAST_ACTION_CODE) {
      promise.reject("INVALID_ACTION", "The score action code is not supported.");
      return;
    }
    sendNotification(new byte[] {(byte) actionCode}, promise);
  }

  @ReactMethod
  public void sendCommand(int commandCode, String payload, Promise promise) {
    if (commandCode < FIRST_SETTINGS_CODE || commandCode > LAST_SETTINGS_CODE) {
      promise.reject("INVALID_COMMAND", "The remote command code is not supported.");
      return;
    }
    byte[] payloadBytes;
    if (commandCode == 8 || commandCode == 9) {
      payloadBytes = payload == null ? new byte[0] : payload.getBytes(StandardCharsets.UTF_8);
      if (payloadBytes.length == 0 || payloadBytes.length > 19) {
        promise.reject("INVALID_TEAM_NAME", "Team names must contain between 1 and 19 UTF-8 bytes.");
        return;
      }
    } else if (commandCode == 10 || commandCode == 11) {
      try {
        int value = Integer.parseInt(payload);
        if (value < 1 || value > 255) {
          throw new NumberFormatException("value out of range");
        }
        payloadBytes = new byte[] {(byte) value};
      } catch (NumberFormatException exception) {
        promise.reject("INVALID_SETTING", "Game settings must be a whole number between 1 and 255.");
        return;
      }
    } else {
      if (payload != null && !payload.isEmpty()) {
        promise.reject("INVALID_COMMAND", "This remote command does not accept a value.");
        return;
      }
      payloadBytes = new byte[0];
    }

    byte[] notification = new byte[payloadBytes.length + 1];
    notification[0] = (byte) commandCode;
    System.arraycopy(payloadBytes, 0, notification, 1, payloadBytes.length);
    sendNotification(notification, promise);
  }

  private void sendNotification(byte[] value, Promise promise) {
    synchronized (notificationQueue) {
      notificationQueue.add(new PendingNotification(value, promise));
      sendNextNotification();
    }
  }

  private void sendNextNotification() {
    if (notificationInFlight) {
      return;
    }
    PendingNotification pending = notificationQueue.peek();
    if (pending == null) {
      return;
    }
    if (gattServer == null || controlCharacteristic == null || subscribedDevices.isEmpty()) {
      notificationQueue.remove();
      pending.promise.reject("NO_DISPLAY_CONNECTED", "Connect a video recorder before sending score changes.");
      sendNextNotification();
      return;
    }

    BluetoothDevice device = subscribedDevices.iterator().next();
    try {
      if (!controlCharacteristic.setValue(pending.value)) {
        notificationQueue.remove();
        pending.promise.reject("NOTIFICATION_FAILED", "Android could not prepare the Bluetooth command.");
        sendNextNotification();
        return;
      }
      boolean accepted = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
          ? gattServer.notifyCharacteristicChanged(device, controlCharacteristic, false, pending.value)
              == BluetoothGatt.GATT_SUCCESS
          : gattServer.notifyCharacteristicChanged(device, controlCharacteristic, false);
      if (!accepted) {
        notificationQueue.remove();
        pending.promise.reject("NOTIFICATION_FAILED", "Android could not queue the Bluetooth command.");
        sendNextNotification();
        return;
      }
      notificationInFlight = true;
    } catch (SecurityException exception) {
      notificationQueue.remove();
      pending.promise.reject("BLUETOOTH_PERMISSION_DENIED", exception.getMessage());
      sendNextNotification();
    }
  }

  private void completeNotification(int status) {
    synchronized (notificationQueue) {
      PendingNotification pending = notificationQueue.poll();
      notificationInFlight = false;
      if (pending != null) {
        if (status == BluetoothGatt.GATT_SUCCESS) {
          pending.promise.resolve(null);
        } else {
          pending.promise.reject("NOTIFICATION_FAILED", "Android failed to deliver the Bluetooth command.");
        }
      }
      sendNextNotification();
    }
  }

  private void rejectPendingNotifications(String message) {
    synchronized (notificationQueue) {
      PendingNotification pending;
      while ((pending = notificationQueue.poll()) != null) {
        pending.promise.reject("NO_DISPLAY_CONNECTED", message);
      }
      notificationInFlight = false;
    }
  }

  @ReactMethod
  public void stop(Promise promise) {
    try {
      stopServer();
      promise.resolve(null);
    } catch (SecurityException exception) {
      promise.reject("BLUETOOTH_PERMISSION_DENIED", exception.getMessage());
    }
  }

  @ReactMethod
  public void addListener(String eventName) {}

  @ReactMethod
  public void removeListeners(int count) {}

  private void startAdvertising() {
    AdvertiseSettings settings =
        new AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(true)
            .setTimeout(0)
            .build();
    AdvertiseData data =
        new AdvertiseData.Builder()
            .addServiceUuid(new ParcelUuid(SERVICE_UUID))
            .setIncludeDeviceName(false)
            .build();
    try {
      advertiser.startAdvertising(settings, data, advertiseCallback);
    } catch (SecurityException exception) {
      rejectStart("BLUETOOTH_PERMISSION_DENIED", exception.getMessage());
    }
  }

  private void rejectStart(String code, String message) {
    Promise promise = startPromise;
    startPromise = null;
    stopServer();
    if (promise != null) {
      promise.reject(code, message);
    }
  }

  private void stopServer() {
    rejectPendingNotifications("Bluetooth remote service stopped before the command was sent.");
    if (advertiser != null) {
      try {
        advertiser.stopAdvertising(advertiseCallback);
      } catch (SecurityException exception) {
        emitError("Failed to stop Bluetooth advertising: " + exception.getMessage());
      }
      advertiser = null;
    }
    if (gattServer != null) {
      gattServer.close();
      gattServer = null;
    }
    connectedDevices.clear();
    subscribedDevices.clear();
    controlCharacteristic = null;
    scoreCharacteristic = null;
    emitConnectionChange();
  }

  private void respond(
      BluetoothDevice device, int requestId, boolean responseNeeded, int status, int offset) {
    if (responseNeeded && gattServer != null) {
      gattServer.sendResponse(device, requestId, status, offset, null);
    }
  }

  private void emitConnectionChange() {
    BluetoothDevice device = connectedDevices.isEmpty() ? null : connectedDevices.iterator().next();
    WritableMap event = Arguments.createMap();
    event.putBoolean("connected", device != null && subscribedDevices.contains(device));
    event.putString("deviceName", getDeviceName(device));
    reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
        .emit("BadmintonBleRemoteConnection", event);
  }

  private String getDeviceName(BluetoothDevice device) {
    if (device == null) {
      return "";
    }
    try {
      String name = device.getName();
      return name == null ? "Video recorder" : name;
    } catch (SecurityException exception) {
      return "Video recorder";
    }
  }

  private void emitError(String message) {
    reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
        .emit("BadmintonBleRemoteError", message);
  }

  private void emitScoreUpdate(int teamA, int teamB) {
    WritableMap event = Arguments.createMap();
    event.putInt("teamA", teamA);
    event.putInt("teamB", teamB);
    reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
        .emit("BadmintonBleRemoteScore", event);
  }
}
