package com.bookmarkdigest.share

import android.app.Application
import android.util.Log
import com.amplifyframework.AmplifyException
import com.amplifyframework.auth.cognito.AWSCognitoAuthPlugin
import com.amplifyframework.core.Amplify

/**
 * Configures Amplify Auth once per process.
 *
 * Both entry points (the launcher [LoginActivity] and the share target
 * [ShareActivity]) can start the process cold, so configuration has to happen
 * here rather than in either activity.
 */
class ShareApp : Application() {

    override fun onCreate() {
        super.onCreate()
        try {
            Amplify.addPlugin(AWSCognitoAuthPlugin())
            Amplify.configure(applicationContext)
        } catch (e: AmplifyException) {
            // Amplify.configure throws if called twice in one process, which can
            // happen under some test/instrumentation setups. Nothing to recover
            // from at runtime beyond not crashing the share sheet.
            Log.e(TAG, "Amplify configuration failed", e)
        }
    }

    companion object {
        const val TAG = "bookmark-digest"
    }
}
