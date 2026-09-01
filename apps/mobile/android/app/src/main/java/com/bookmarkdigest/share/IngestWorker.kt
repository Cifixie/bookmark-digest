package com.bookmarkdigest.share

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.ListenableWorker.Result as WorkResult
/**
 * Does the actual POST, outside the share activity's lifetime.
 *
 * [ShareActivity] is `Theme.NoDisplay` and calls `finish()` immediately, so its
 * process is a candidate for death long before a 10-30s Firecrawl scrape
 * returns. WorkManager outlives it, and its network constraint means a link
 * shared with the radio off is delivered when connectivity returns instead of
 * being dropped.
 *
 * Feedback goes through [IngestNotifications], not toasts: once the share
 * sheet closes this worker is a background component, and the OS silently
 * swallows background toasts (Android 10+).
 */
class IngestWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): WorkResult {
        val url = inputData.getString(KEY_URL) ?: return WorkResult.failure()

        // Owns the auth check, not the activity: reading the Cognito session
        // hits EncryptedSharedPreferences and may refresh over the network.
        val token = Ingest.idToken()
        if (token == null) {
            IngestNotifications.showResult(applicationContext, url, Ingest.Result.Unauthorized)
            return WorkResult.failure()
        }

        return when (val result = Ingest.postSource(url, token)) {
            Ingest.Result.Saved -> {
                IngestNotifications.showResult(applicationContext, url, result)
                WorkResult.success()
            }

            Ingest.Result.AlreadySaved -> {
                IngestNotifications.showResult(applicationContext, url, result)
                WorkResult.success()
            }

            Ingest.Result.Unauthorized -> {
                IngestNotifications.showResult(applicationContext, url, result)
                WorkResult.failure()
            }

            Ingest.Result.FetchFailed -> {
                IngestNotifications.showResult(applicationContext, url, result)
                WorkResult.failure()
            }

            Ingest.Result.Retryable ->
                // Stay quiet while retries are still coming; only the last
                // attempt is worth interrupting the user for.
                if (runAttemptCount < MAX_ATTEMPTS) {
                    WorkResult.retry()
                } else {
                    IngestNotifications.showResult(applicationContext, url, result)
                    WorkResult.failure()
                }
        }
    }

    companion object {
        const val KEY_URL = "url"

        private const val MAX_ATTEMPTS = 3
    }
}
