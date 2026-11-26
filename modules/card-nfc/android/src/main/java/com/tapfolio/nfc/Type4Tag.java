package com.tapfolio.nfc;

import java.util.Arrays;

/** Read-only NFC Forum Type 4 Tag containing one NDEF message. */
final class Type4Tag {
  static final int FILE_SIZE = 1024;
  private static final byte[] NDEF_AID = {
      (byte) 0xD2, 0x76, 0x00, 0x00, (byte) 0x85, 0x01, 0x01
  };
  private static final byte[] CAPABILITIES = {
      0x00, 0x0F, 0x20, 0x00, (byte) 0xFF, 0x00, (byte) 0xFF,
      0x04, 0x06, (byte) 0xE1, 0x04, (byte) (FILE_SIZE >> 8), (byte) FILE_SIZE,
      0x00, (byte) 0xFF
  };
  private final byte[] ndefFile = new byte[FILE_SIZE];
  private boolean selectedApp;
  private byte[] selectedFile;

  Type4Tag(byte[] message) {
    ndefFile[0] = (byte) (message.length >> 8);
    ndefFile[1] = (byte) message.length;
    System.arraycopy(message, 0, ndefFile, 2, message.length);
  }

  byte[] respond(byte[] command) {
    if (command.length < 4) return status(0x6700);
    if (command[0] != 0) return status(0x6E00);
    switch (command[1] & 0xFF) {
      case 0xA4:
        return select(command);
      case 0xB0:
        return read(command);
      default:
        return status(0x6D00);
    }
  }

  private byte[] select(byte[] command) {
    if (command.length < 5) return status(0x6700);
    int length = command[4] & 0xFF;
    if (command.length != 5 + length && command.length != 6 + length) return status(0x6700);
    byte[] name = Arrays.copyOfRange(command, 5, 5 + length);
    selectedFile = null;
    if (command[2] == 0x04) {
      selectedApp = Arrays.equals(name, NDEF_AID);
      return status(selectedApp ? 0x9000 : 0x6A82);
    }
    if (!selectedApp || command[2] != 0 || length != 2 || name[0] != (byte) 0xE1) {
      return status(0x6A82);
    }
    if (name[1] == 0x03) selectedFile = CAPABILITIES;
    if (name[1] == 0x04) selectedFile = ndefFile;
    return status(selectedFile == null ? 0x6A82 : 0x9000);
  }

  private byte[] read(byte[] command) {
    if (command.length != 5) return status(0x6700);
    if (selectedFile == null) return status(0x6986);
    int offset = ((command[2] & 0xFF) << 8) | (command[3] & 0xFF);
    int length = command[4] & 0xFF;
    if (offset >= selectedFile.length) return status(0x6B00);
    int requested = length == 0 ? 256 : length;
    int count = Math.min(requested, selectedFile.length - offset);
    byte[] response = new byte[count + 2];
    System.arraycopy(selectedFile, offset, response, 0, count);
    byte[] result = status(count == requested ? 0x9000 : 0x6282);
    response[count] = result[0];
    response[count + 1] = result[1];
    return response;
  }

  private static byte[] status(int code) {
    return new byte[] { (byte) (code >> 8), (byte) code };
  }
}
