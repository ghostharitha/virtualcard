# Tapfolio

Tapfolio is a React Native Android app for creating and sharing digital business cards. The Node.js server holds accounts and cards in SQLite and serves the public card pages.

## Run locally

Install Node.js 24+, Android Studio with the Android 36 SDK, and JDK 17. Set up an Android emulator or connect an Android phone with USB debugging enabled.

Copy the example environment file and set a unique admin password of at least 10 characters. The server creates the admin account on first startup. Set the admin email before that first run. Registration in the app creates regular user accounts.

~~~powershell
Copy-Item .env.example .env
notepad .env
npm install
~~~

Start the server and leave it running.

~~~powershell
node --env-file-if-exists=.env server/index.mjs
~~~

In another terminal, build the Android app.

~~~powershell
npx expo prebuild --platform android
Push-Location android
.\gradlew.bat --init-script ../scripts/android-toolchains.init.gradle :app:assembleRelease
Pop-Location
~~~

Install the test APK from `android/app/build/outputs/apk/release/app-release.apk`. The generated release build uses the Android debug signing key for local installation.

The example URLs use the Android emulator's address for the host computer. For testing with physical phones on the same network, change both URLs to the computer's LAN address and make port 8787 reachable from those phones. Restart the server and Metro after editing the URLs. The app needs a native Android build for NFC because the project includes a custom Android module.

For sharing beyond your local network, run the server behind HTTPS with a persistent SQLite directory, set both URL variables to the reachable HTTPS origin, and turn off TAPFOLIO_ALLOW_HTTP before generating the Android build. Keep the admin password in the server environment.

## Create and share a card

1. Create an account, tap **Create business card**, fill in your details, and submit for review. Set up an optional six-digit PIN or fingerprint from **Account**. Use **Lock app** to return to the sign-in screen and try either method.
2. Choose **Admin sign-in** and use the account configured on the server. Open a user to review and publish their submission, or create a card directly for them.
3. Return to the user account. The published card appears on the home screen. Choose **Share card** for the QR code, public link, or NFC. The public page includes a **Save contact** download.
4. To revise a published card, use **Edit my details**. The public URL stays the same. The current version remains live until the admin publishes the changes.

## Test phone-to-phone NFC

Use a physical Android sender that supports NFC host card emulation and a receiving phone that can read Type 4 NDEF tags. Unlock both phones and enable NFC. On the sender, open **Share card**, tap **Start NFC sharing**, and hold the backs of the phones close together. Open the link prompt on the receiver if prompted. The sender makes the card URL available over NFC while the share screen stays open, for up to two minutes. Reader behavior varies by model and Android version. Use the QR code or share link when the recipient's phone does not open the NFC link.

## Automated checks

~~~powershell
node server/index.test.mjs
New-Item -ItemType Directory -Force dist/nfc-check
javac -d dist/nfc-check modules/card-nfc/android/src/main/java/com/tapfolio/nfc/Type4Tag.java tests/Type4TagTest.java
java -cp dist/nfc-check com.tapfolio.nfc.Type4TagTest
~~~

The server check covers account roles, admin publication, public pages, contact downloads, edits, and device sign-in credentials. The Java check exercises the NFC tag command responses. Verify fingerprint prompts and NFC handoff on physical devices.
