# bookmark-digest share target (Android)

A one-tap way to get a link into the sources table: share any URL from Chrome,
YouTube, or anything else that emits `text/plain`, and this app POSTs it to
`POST /sources` on the existing API. No UI beyond a toast.

Not part of the pnpm workspace — it has no `package.json`, so pnpm's `apps/*`
glob skips it. Build it with Gradle, not `pnpm`.

## Toolchain

The versions here are load-bearing; two of them are pinned by a hard
incompatibility rather than by preference.

| Piece | Version | Why this one |
|---|---|---|
| JDK | Android Studio's bundled JBR (Java 25) | The only JDK on this machine. Gradle 8.x refuses to run on Java 25, which is why Gradle 9 is used below. |
| Gradle | **9.5.0** | Java 25 needs Gradle 9.x, but AGP 8.x calls `org.gradle.api.problems.internal.InternalProblems`, which Gradle **removed in 9.6**. So 9.5.0 is the only version that satisfies both ends. Do not bump this without also moving off AGP 8.x. |
| AGP | 8.13.2 | |
| Kotlin | 2.3.21 | |
| compileSdk / targetSdk | 36 | `androidx.core:core-ktx:1.17.0` refuses to compile against anything below 36. |
| minSdk | 26 | |

`local.properties` (gitignored) needs one line:

```
sdk.dir=/Users/<you>/Library/Android/sdk
```

Required SDK packages: `platform-tools`, `platforms;android-36`,
`build-tools;36.0.0`.

## Build and install

```sh
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew assembleDebug          # -> app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug           # with a device on USB debugging
```

In Android Studio, open `apps/mobile/android` as the project root (not the repo
root).

## How it works

- `ShareActivity` — `Theme.NoDisplay`, so the share sheet closes instantly.
  Extracts the URL, enqueues `IngestWorker`, toasts, finishes. No network, no
  auth, nothing that can outlive the activity.
- `IngestWorker` — the POST, in WorkManager so it survives the activity and
  retries when the phone is offline. Also owns the auth check.
- `LoginActivity` — the launcher entry. One-time Cognito email/password sign-in
  via Amplify, plus a sign-out button to switch accounts.
- `Ingest` — URL extraction and the raw `HttpURLConnection` POST.

Two non-obvious constraints are written up in `wiki/gotchas.md`: the
`Authorization` header takes a **bare** ID token (no `Bearer ` prefix), and
shared text is usually *not* a bare URL. The rationale for Cognito-over-API-key
and WorkManager-over-coroutine is in `wiki/decisions.md`.

## Config

Non-secret, and already public in `apps/infra/outputs.json`:

- API base URL — `buildConfigField` in `app/build.gradle.kts`
- Cognito pool and client IDs — `app/src/main/res/raw/amplifyconfiguration.json`

No password or API key is compiled in. The user pool has self-signup disabled,
so the account must already exist; sign in once and Amplify handles refresh
from then on.
