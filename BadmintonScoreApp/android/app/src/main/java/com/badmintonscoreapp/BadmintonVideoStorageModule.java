package com.badmintonscoreapp;

import android.content.ContentValues;
import android.content.Context;
import android.app.Activity;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.content.ContentResolver;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.media.MediaRecorder;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public final class BadmintonVideoStorageModule extends ReactContextBaseJavaModule {
  private static final String ALBUM_NAME = "Badminton Score";
  private MediaRecorder audioRecorder;
  private File audioRecordingFile;

  BadmintonVideoStorageModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return "BadmintonVideoStorage";
  }

  @ReactMethod
  public void setSensorOrientation(boolean enabled, Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "The camera screen is not attached to an Android activity.");
      return;
    }

    activity.runOnUiThread(() -> {
      activity.setRequestedOrientation(
          enabled
              ? android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR
              : android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
      promise.resolve(null);
    });
  }

  @ReactMethod
  public void setKeepScreenOn(boolean enabled, Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "The camera screen is not attached to an Android activity.");
      return;
    }

    activity.runOnUiThread(() -> {
      if (enabled) {
        activity.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      } else {
        activity.getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      }
      promise.resolve(null);
    });
  }

  @ReactMethod
  public void saveToGallery(String recordingUri, Promise promise) {
    Uri sourceUri = Uri.parse(recordingUri);
    String sourcePath = sourceUri.getPath();
    if (sourcePath == null) {
      promise.reject("E_INVALID_URI", "The recorder returned a video URI without a file path.");
      return;
    }

    File sourceFile = new File(sourcePath);
    if (!sourceFile.isFile()) {
      promise.reject("E_MISSING_RECORDING", "The temporary recording file could not be found.");
      return;
    }

    String displayName = "BadmintonScore_"
        + new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date())
        + ".mp4";
    try {
      String savedUri = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
          ? saveWithMediaStore(sourceFile, displayName)
          : saveToLegacyMovies(sourceFile, displayName);
      if (!sourceFile.delete()) {
        sourceFile.deleteOnExit();
      }
      promise.resolve(savedUri);
    } catch (Exception error) {
      promise.reject("E_SAVE_RECORDING", "Unable to save the match video: " + error.getMessage(), error);
    }
  }

    @ReactMethod
    public void startAudioCapture(Promise promise) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
          && getReactApplicationContext().checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
              != android.content.pm.PackageManager.PERMISSION_GRANTED) {
        promise.reject("E_AUDIO_PERMISSION", "Microphone permission is required to record match audio.");
        return;
      }
      if (audioRecorder != null) {
        promise.reject("E_AUDIO_BUSY", "Audio recording is already in progress.");
        return;
      }

      File file = new File(
          getReactApplicationContext().getCacheDir(),
          "match-audio-" + System.currentTimeMillis() + ".mp4");
      MediaRecorder recorder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
          ? new MediaRecorder(getReactApplicationContext())
          : new MediaRecorder();
      try {
        recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
        recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
        recorder.setAudioSamplingRate(44100);
        recorder.setAudioEncodingBitRate(128000);
        recorder.setAudioChannels(1);
        recorder.setOutputFile(file.getAbsolutePath());
        recorder.prepare();
        recorder.start();
        audioRecorder = recorder;
        audioRecordingFile = file;
        promise.resolve(Uri.fromFile(file).toString());
      } catch (Exception error) {
        recorder.release();
        file.delete();
        promise.reject("E_AUDIO_START", "Unable to start microphone recording: " + error.getMessage(), error);
      }
    }

    @ReactMethod
    public void stopAudioCapture(Promise promise) {
      MediaRecorder recorder = audioRecorder;
      File file = audioRecordingFile;
      audioRecorder = null;
      audioRecordingFile = null;
      if (recorder == null || file == null) {
        promise.reject("E_AUDIO_NOT_RECORDING", "Microphone recording is not active.");
        return;
      }

      try {
        recorder.stop();
        promise.resolve(Uri.fromFile(file).toString());
      } catch (RuntimeException error) {
        file.delete();
        promise.reject("E_AUDIO_STOP", "Unable to finish microphone recording: " + error.getMessage(), error);
      } finally {
        recorder.release();
      }
    }

    @ReactMethod
    public void mergeAudioIntoVideo(String videoUri, String audioUri, Promise promise) {
      String videoPath = Uri.parse(videoUri).getPath();
      String audioPath = Uri.parse(audioUri).getPath();
      if (videoPath == null || audioPath == null) {
        promise.reject("E_INVALID_URI", "The temporary video or audio URI does not contain a file path.");
        return;
      }
      File videoFile = new File(videoPath);
      File audioFile = new File(audioPath);
      if (!videoFile.isFile() || !audioFile.isFile()) {
        promise.reject("E_MISSING_RECORDING", "The temporary video or audio recording could not be found.");
        return;
      }

      File outputFile = new File(
          getReactApplicationContext().getCacheDir(),
          "match-with-audio-" + System.currentTimeMillis() + ".mp4");
      MediaExtractor videoExtractor = new MediaExtractor();
      MediaExtractor audioExtractor = new MediaExtractor();
      MediaMuxer muxer = null;
      boolean muxerStarted = false;
      try {
        videoExtractor.setDataSource(videoFile.getAbsolutePath());
        audioExtractor.setDataSource(audioFile.getAbsolutePath());
        int videoTrack = findTrack(videoExtractor, "video/");
        int audioTrack = findTrack(audioExtractor, "audio/");
        if (videoTrack < 0 || audioTrack < 0) {
          throw new IOException("The recording is missing its video or microphone audio track.");
        }

        muxer = new MediaMuxer(outputFile.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        int outputVideoTrack = muxer.addTrack(videoExtractor.getTrackFormat(videoTrack));
        int outputAudioTrack = muxer.addTrack(audioExtractor.getTrackFormat(audioTrack));
        muxer.start();
        muxerStarted = true;
        copyTrack(videoExtractor, videoTrack, muxer, outputVideoTrack, true);
        copyTrack(audioExtractor, audioTrack, muxer, outputAudioTrack, false);
        muxer.stop();
        muxerStarted = false;
        promise.resolve(Uri.fromFile(outputFile).toString());
      } catch (Exception error) {
        outputFile.delete();
        promise.reject("E_MERGE_AUDIO", "Unable to combine match video and audio: " + error.getMessage(), error);
      } finally {
        if (muxer != null) {
          if (muxerStarted) {
            try {
              muxer.stop();
            } catch (RuntimeException ignored) {
            }
          }
          muxer.release();
        }
        videoExtractor.release();
        audioExtractor.release();
        audioFile.delete();
        if (outputFile.isFile()) {
          videoFile.delete();
        }
      }
    }

    private int findTrack(MediaExtractor extractor, String mimePrefix) {
      for (int index = 0; index < extractor.getTrackCount(); index++) {
        String mime = extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME);
        if (mime != null && mime.startsWith(mimePrefix)) {
          return index;
        }
      }
      return -1;
    }

    private void copyTrack(
        MediaExtractor extractor, int inputTrack, MediaMuxer muxer, int outputTrack, boolean videoTrack)
        throws IOException {
      extractor.selectTrack(inputTrack);
      ByteBuffer buffer = ByteBuffer.allocateDirect(4 * 1024 * 1024);
      MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
      while (true) {
        buffer.clear();
        int sampleSize = extractor.readSampleData(buffer, 0);
        if (sampleSize < 0) {
          return;
        }
        if (sampleSize > buffer.capacity()) {
          throw new IOException("An encoded video frame exceeded the supported muxing buffer size.");
        }
        info.set(
            0,
            sampleSize,
            extractor.getSampleTime(),
            videoTrack && (extractor.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0
                ? MediaCodec.BUFFER_FLAG_KEY_FRAME
                : 0);
        buffer.position(0);
        buffer.limit(sampleSize);
        muxer.writeSampleData(outputTrack, buffer, info);
        extractor.advance();
      }
    }

  private String saveWithMediaStore(File sourceFile, String displayName) throws IOException {
    Context context = getReactApplicationContext();
    ContentResolver resolver = context.getContentResolver();
    ContentValues values = new ContentValues();
    values.put(MediaStore.Video.Media.DISPLAY_NAME, displayName);
    values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
    values.put(
        MediaStore.Video.Media.RELATIVE_PATH,
        Environment.DIRECTORY_MOVIES + File.separator + ALBUM_NAME);
    values.put(MediaStore.Video.Media.IS_PENDING, 1);

    Uri destinationUri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values);
    if (destinationUri == null) {
      throw new IOException("Android could not create a gallery entry for the recording.");
    }

    try {
      copyToUri(sourceFile, resolver, destinationUri);
      ContentValues published = new ContentValues();
      published.put(MediaStore.Video.Media.IS_PENDING, 0);
      if (resolver.update(destinationUri, published, null, null) == 0) {
        throw new IOException("Android could not publish the video in the gallery.");
      }
      return destinationUri.toString();
    } catch (IOException error) {
      resolver.delete(destinationUri, null, null);
      throw error;
    }
  }

  @SuppressWarnings("deprecation")
  private String saveToLegacyMovies(File sourceFile, String displayName) throws IOException {
    File moviesDirectory = new File(
        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES),
        ALBUM_NAME);
    if (!moviesDirectory.isDirectory() && !moviesDirectory.mkdirs()) {
      throw new IOException("Could not create the Movies/Badminton Score folder.");
    }

    File destination = new File(moviesDirectory, displayName);
    try (InputStream input = new FileInputStream(sourceFile);
         OutputStream output = new java.io.FileOutputStream(destination)) {
      copy(input, output);
    } catch (IOException error) {
      if (destination.exists()) {
        destination.delete();
      }
      throw error;
    }

    MediaScannerConnection.scanFile(
        getReactApplicationContext(),
        new String[] {destination.getAbsolutePath()},
        new String[] {"video/mp4"},
        null);
    return Uri.fromFile(destination).toString();
  }

  private void copyToUri(File sourceFile, ContentResolver resolver, Uri destinationUri)
      throws IOException {
    try (InputStream input = new FileInputStream(sourceFile);
         OutputStream output = resolver.openOutputStream(destinationUri, "w")) {
      if (output == null) {
        throw new IOException("Android could not open the gallery video for writing.");
      }
      copy(input, output);
    }
  }

  private void copy(InputStream input, OutputStream output) throws IOException {
    byte[] buffer = new byte[64 * 1024];
    int bytesRead;
    while ((bytesRead = input.read(buffer)) != -1) {
      output.write(buffer, 0, bytesRead);
    }
    output.flush();
  }
}
