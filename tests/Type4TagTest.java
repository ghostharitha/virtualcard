package com.tapfolio.nfc;

import java.util.Arrays;
import java.util.HexFormat;

public final class Type4TagTest {
  private static final HexFormat HEX = HexFormat.of();

  public static void main(String[] args) {
    // A URI record with the https:// prefix and the text example.org.
    String message = "d1010c55046578616d706c652e6f7267";
    Type4Tag tag = new Type4Tag(HEX.parseHex(message));
    check(tag, "00B0000002", "6986");
    check(tag, "00A4040007D276000085010100", "9000");
    check(tag, "00A4000C02E103", "9000");
    check(tag, "00B000000F", "000f2000ff00ff0406e104040000ff9000");
    check(tag, "00A4000C02E104", "9000");
    check(tag, "00B0000002", "00109000");
    check(tag, "00B0000207", message.substring(0, 14) + "9000");
    check(tag, "00B0000909", message.substring(14) + "9000");
    check(tag, "00D600000100", "6d00");
    check(tag, "00B0040001", "6b00");
    check(tag, "00A4000C02E102", "6a82");
    check(tag, "00B0000002", "6986");
    System.out.println("Type 4 tag checks passed");
  }

  private static void check(Type4Tag tag, String command, String expected) {
    byte[] response = tag.respond(HEX.parseHex(command));
    if (!Arrays.equals(response, HEX.parseHex(expected))) {
      throw new AssertionError(command + " returned " + HEX.formatHex(response) + ", expected " + expected);
    }
  }
}
