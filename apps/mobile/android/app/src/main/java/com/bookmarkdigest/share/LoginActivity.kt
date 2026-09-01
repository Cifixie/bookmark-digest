package com.bookmarkdigest.share

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.amplifyframework.kotlin.core.Amplify
import kotlinx.coroutines.launch

/**
 * One-time sign-in, and the way back out.
 *
 * The user pool has self-signup disabled and SRP as its only auth flow
 * (`apps/infra/lib/bookmark-digest-stack.ts`), so this mirrors the web
 * Authenticator: plain email and password, no sign-up, no MFA. Amplify
 * persists the tokens in EncryptedSharedPreferences and refreshes them, so
 * this screen is normally visited exactly once.
 */
class LoginActivity : AppCompatActivity() {

    private lateinit var status: TextView
    private lateinit var email: EditText
    private lateinit var password: EditText
    private lateinit var submit: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        status = findViewById(R.id.status)
        email = findViewById(R.id.email)
        password = findViewById(R.id.password)
        submit = findViewById(R.id.submit)

        // Notifications are the only feedback channel for a share, so ask
        // for the Android 13+ permission whenever this screen is open without
        // it. ShareActivity cannot ask — it is NoDisplay and finishes
        // instantly. The system re-prompts on the next open until granted or
        // permanently denied; no result callback needed.
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }

        render()
    }

    /** Shows either the sign-in form or a signed-in-as line with a sign-out button. */
    private fun render() {
        lifecycleScope.launch {
            // getCurrentUser throws rather than returning null when signed out.
            val user = runCatching { Amplify.Auth.getCurrentUser() }.getOrNull()

            if (user == null) {
                status.text = getString(R.string.sign_in_hint)
                setFormVisible(true)
                submit.setText(R.string.sign_in)
                submit.setOnClickListener { signIn() }
            } else {
                status.text = getString(R.string.signed_in_as, user.username)
                setFormVisible(false)
                submit.setText(R.string.sign_out)
                submit.setOnClickListener { signOut() }
            }
        }
    }

    private fun setFormVisible(visible: Boolean) {
        val visibility = if (visible) View.VISIBLE else View.GONE
        email.visibility = visibility
        password.visibility = visibility
    }

    private fun signIn() {
        val username = email.text.toString().trim()
        val secret = password.text.toString()
        if (username.isEmpty() || secret.isEmpty()) return

        submit.isEnabled = false
        lifecycleScope.launch {
            try {
                val result = Amplify.Auth.signIn(username, secret)
                if (result.isSignedIn) {
                    password.text.clear()
                    render()
                } else {
                    // Any unfinished step (new password required, MFA) is not
                    // something this one-screen app can drive — the web app can.
                    toast("Sign-in needs ${result.nextStep.signInStep} — use the web app")
                }
            } catch (e: Exception) {
                toast(e.message ?: "Sign-in failed")
            } finally {
                submit.isEnabled = true
            }
        }
    }

    private fun signOut() {
        lifecycleScope.launch {
            Amplify.Auth.signOut()
            toast(getString(R.string.signed_out))
            render()
        }
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }
}
