package com.bookmarkdigest.share

import com.amplifyframework.auth.cognito.AWSCognitoAuthSession
import com.amplifyframework.kotlin.core.Amplify
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * URL extraction and the single `POST /sources` call.
 *
 * Mirrors the web client's request exactly — see
 * `apps/web/src/utils/fetchApi.ts` and the submit path in
 * `apps/web/src/app/page.tsx`.
 */
object Ingest {

    /** Trailing characters a shared link picks up from surrounding prose. */
    private const val TRAILING_JUNK = ".,;:!?)]}>\"'”’"

    private val URL_PATTERN = Regex("""https?://\S+""")

    /**
     * Pulls the first http(s) URL out of shared text.
     *
     * Shared text is very often not a bare URL: YouTube sends "Video title\n
     * https://youtu.be/xyz", and other apps append a promo line. The ingest
     * Lambda hands `url` straight to Firecrawl, so anything but a clean URL
     * comes back as a 422.
     */
    fun extractUrl(text: String?): String? {
        val match = URL_PATTERN.find(text ?: return null) ?: return null
        val trimmed = match.value.trimEnd { it in TRAILING_JUNK }
        return trimmed.ifEmpty { null }
    }

    /**
     * The Cognito ID token, or null when nobody is signed in.
     *
     * Amplify refreshes an expired token transparently here, which is why the
     * sign-in in [LoginActivity] only has to happen once.
     */
    suspend fun idToken(): String? {
        val session = Amplify.Auth.fetchAuthSession()
        if (!session.isSignedIn) return null
        return (session as? AWSCognitoAuthSession)?.userPoolTokensResult?.value?.idToken
    }

    /** What the ingest Lambda said, mapped to something the UI can act on. */
    sealed interface Result {
        /** 201 — stored, now embedding. */
        data object Saved : Result

        /** 200 — the URL was already in the sources table. */
        data object AlreadySaved : Result

        /** 401/403 — the token was rejected; the user has to sign in again. */
        data object Unauthorized : Result

        /** 422 — Firecrawl could not get the page. Retrying will not help. */
        data object FetchFailed : Result

        /** 5xx, a timeout, or no network. Worth another attempt later. */
        data object Retryable : Result
    }

    /**
     * POSTs the URL. Blocking; callers are on a worker thread.
     *
     * The `Authorization` header carries the raw JWT with no "Bearer " prefix —
     * that is what `fetchApi.ts` sends and what the API Gateway Cognito
     * authorizer's default identity source expects. Adding the prefix 401s.
     *
     * Deliberately sends only `url`. The Lambda's `content`/`contentType`
     * fields are paste mode, which skips Firecrawl entirely.
     */
    fun postSource(url: String, idToken: String): Result {
        val connection = (URL("${BuildConfig.API_BASE_URL}/sources").openConnection()
                as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Authorization", idToken)
            // Firecrawl scrapes routinely take 10-30s behind this endpoint.
            connectTimeout = 15_000
            readTimeout = 120_000
        }

        return try {
            val body = JSONObject().put("url", url).toString()
            connection.outputStream.use { it.write(body.toByteArray()) }

            when (val status = connection.responseCode) {
                201 -> Result.Saved
                200 -> Result.AlreadySaved
                401, 403 -> Result.Unauthorized
                422 -> Result.FetchFailed
                else -> if (status in 400..499) Result.FetchFailed else Result.Retryable
            }
        } catch (e: IOException) {
            Result.Retryable
        } finally {
            connection.disconnect()
        }
    }
}
