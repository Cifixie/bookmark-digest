package com.bookmarkdigest.share

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.widget.Toast
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
 */
class IngestWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): WorkResult {
        val url = inputData.getString(KEY_URL) ?: return WorkResult.failure()

        val token = Ingest.idToken()
        if (token == null) {
            toast(R.string.toast_sign_in_required)
            return WorkResult.failure()
        }

        return when (Ingest.postSource(url, token)) {
            Ingest.Result.Saved -> {
                toast(R.string.toast_saved)
                WorkResult.success()
            }

            Ingest.Result.AlreadySaved -> {
                toast(R.string.toast_already_saved)
                WorkResult.success()
            }

            Ingest.Result.Unauthorized -> {
                toast(R.string.toast_sign_in_required)
                WorkResult.failure()
            }

            Ingest.Result.FetchFailed -> {
                toast(R.string.toast_fetch_failed)
                WorkResult.failure()
            }

            Ingest.Result.Retryable ->
                // Stay quiet while retries are still coming; only the last
                // attempt is worth interrupting the user for.
                if (runAttemptCount < MAX_ATTEMPTS) {
                    WorkResult.retry()
                } else {
                    toast(R.string.toast_failed)
                    WorkResult.failure()
                }
        }
    }

    private fun toast(messageRes: Int) {
        Handler(Looper.getMainLooper()).post {
            Toast.makeText(applicationContext, messageRes, Toast.LENGTH_SHORT).show()
        }
    }

    companion object {
        const val KEY_URL = "url"
        private const val MAX_ATTEMPTS = 3
    }
}
