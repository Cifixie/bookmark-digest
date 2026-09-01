package com.bookmarkdigest.share

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf

/**
 * The share target. `Theme.NoDisplay`, so the share sheet closes at once and
 * the user never sees a screen — just a toast.
 *
 * This does no network and no auth: reading the Cognito session touches
 * EncryptedSharedPreferences and may refresh over the network, so it belongs
 * off the main thread and after `finish()`. [IngestWorker] handles both.
 */
class ShareActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val url = Ingest.extractUrl(intent?.getStringExtra(Intent.EXTRA_TEXT))
        if (url == null) {
            toast(R.string.toast_no_link)
        } else {
            enqueue(url)
            IngestNotifications.showSaving(applicationContext, url)
            // The notification is the share's ongoing state; a toast is only
            // the immediate ack when that permission has not been granted
            // (in which case the notification above would be dropped).
            if (!IngestNotifications.canNotify(applicationContext)) {
                toast(R.string.toast_saving)
            }
        }

        finish()
    }

    private fun enqueue(url: String) {
        val request = OneTimeWorkRequestBuilder<IngestWorker>()
            .setInputData(workDataOf(IngestWorker.KEY_URL to url))
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .build()

        // Keyed on the URL so double-tapping share does not queue it twice.
        WorkManager.getInstance(applicationContext).enqueueUniqueWork(
            "ingest:$url",
            ExistingWorkPolicy.KEEP,
            request,
        )
    }

    private fun toast(messageRes: Int) {
        Toast.makeText(applicationContext, messageRes, Toast.LENGTH_SHORT).show()
    }
}
