package com.bookmarkdigest.share

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * The share state machine the user can actually see.
 *
 * [ShareActivity] finishes the moment the share sheet closes, and
 * [IngestWorker] then runs in the background — so a toast from the worker is
 * the wrong tool: the OS silently swallows toasts from background components
 * (Android 10+). Notifications are the only surface a background worker is
 * allowed to draw on.
 *
 * One notification per URL, keyed by the URL's hash: the "Saving…" state
 * posted at enqueue time is replaced in place by the terminal state, so a
 * share never stacks more than one notification.
 */
object IngestNotifications {

    private const val CHANNEL_ID = "share"

    /**
     * True when notifications will actually reach the status bar.
     *
     * Below Android 13 the permission does not exist and this is always true.
     */
    fun canNotify(context: Context): Boolean =
        context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED

    /** Creates the channel once per process; safe to call repeatedly. */
    fun ensureChannel(context: Context) {
        context.getSystemService(NotificationManager::class.java)
            .createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    context.getString(R.string.channel_share),
                    NotificationManager.IMPORTANCE_DEFAULT,
                ),
            )
    }

    /** Indeterminate progress, posted when the share is enqueued. */
    fun showSaving(context: Context, url: String) {
        NotificationManagerCompat.from(context).notify(
            url.hashCode(),
            NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(context.getString(R.string.state_saving))
                .setContentText(url)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setProgress(0, 0, true)
                .build(),
        )
    }

    /**
     * The terminal state of the share, replacing the "Saving…" notification.
     *
     * [Ingest.Result.Unauthorized] is the one state the user can act on: a
     * notification *can* launch an activity from the background (a worker
     * cannot), so it taps through to [LoginActivity] instead of dead-ending
     * in "open the app yourself".
     */
    fun showResult(context: Context, url: String, result: Ingest.Result) {
        val titleRes = when (result) {
            Ingest.Result.Saved -> R.string.state_saved
            Ingest.Result.AlreadySaved -> R.string.state_already_saved
            Ingest.Result.Unauthorized -> R.string.state_sign_in_required
            Ingest.Result.FetchFailed -> R.string.state_fetch_failed
            Ingest.Result.Retryable -> R.string.state_failed
        }
        val contentIntent = (result as? Ingest.Result.Unauthorized)?.let {
            PendingIntent.getActivity(
                context,
                0,
                Intent(context, LoginActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE,
            )
        }

        NotificationManagerCompat.from(context).notify(
            url.hashCode(),
            NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(context.getString(titleRes))
                .setContentText(url)
                .setOnlyAlertOnce(true)
                .setAutoCancel(true)
                .setContentIntent(contentIntent)
                .build(),
        )
    }
}
