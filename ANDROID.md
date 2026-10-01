# Android app

The game ships to Android as a [Capacitor](https://capacitorjs.com) app: the
Next.js site is statically exported (`output: "export"` → `out/`) and bundled
inside a native shell in `android/`. It runs fully offline; progress stays in
the WebView's `localStorage` on the device.

## Getting an APK (no Android tooling needed)

Every push runs the **Android build** GitHub Actions workflow
(`.github/workflows/android.yml`). Open the run under the repo's **Actions**
tab and download the **ArrowFlow-debug-apk** artifact (a zip containing the
`.apk`).

To install it on a phone: copy the `.apk` over (or download it on the phone),
open it, and allow "Install unknown apps" for whichever app opened it when
Android asks. Debug builds all share the committed debug key and carry an
increasing version code, so a newer one installs over the old one and keeps
your progress.

## Building locally

Needs Node 22, JDK 21 and the Android SDK (easiest: install Android Studio).

```bash
npm ci
npm run android:apk          # → android/app/build/outputs/apk/debug/app-debug.apk
npm run android:open         # or open the project in Android Studio
```

After any change to the web code, `npm run android:sync` rebuilds the site and
copies it into the Android project.

## Icon and splash screen

Sources are the SVGs in `assets/`. After editing them run
`npm run android:assets` to regenerate every density in `android/app/src/main/res`.

## Signed release build (for the Play Store)

The debug APK is fine for testing but can't go on Play. For that, create an
upload key **once** and keep it safe (lose it and you need Google support to
reset it):

```bash
keytool -genkeypair -v -keystore upload.keystore -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 upload.keystore     # macOS: base64 -i upload.keystore
```

Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the base64 output above |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | the key password |

From then on each workflow run also uploads **ArrowFlow-release**: a signed
release `.apk` and the `.aab` bundle that Play Console asks for.

The app ID is `com.spacemanclub.arrowflow` (`capacitor.config.ts` and
`android/app/build.gradle`). It is permanent once published, so change it
before the first Play upload if you want a different one.
