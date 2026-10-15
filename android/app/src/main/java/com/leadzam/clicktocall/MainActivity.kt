package com.leadzam.clicktocall

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.snackbar.Snackbar
import com.google.firebase.messaging.FirebaseMessaging
import android.widget.LinearLayout
import androidx.core.view.WindowCompat

/**
 * Single screen: device registration at the top, received CRM call requests below.
 *
 * This is also the "app is open" half of the foreground/background behaviour: while this
 * activity is started, new requests appear in the list (and a snackbar) instead of a notification.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var tokenText: TextView
    private lateinit var registerStatus: TextView
    private lateinit var notificationWarning: TextView
    private lateinit var emptyText: TextView
    private lateinit var backendUrlInput: EditText
    private lateinit var deviceNameInput: EditText
    private lateinit var adapter: RequestAdapter

    private val knownRequestIds = HashSet<String>()
    private var announcedOnce = false

    private val repositoryListener = DialRequestRepository.Listener { refreshList(announceNew = true) }

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { updateNotificationWarning() }

   override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    WindowCompat.setDecorFitsSystemWindows(window, true)

    setContentView(R.layout.activity_main)

    tokenText = findViewById(R.id.tvToken)
    registerStatus = findViewById(R.id.tvRegisterStatus)
    notificationWarning = findViewById(R.id.tvNotifWarning)
    emptyText = findViewById(R.id.tvEmpty)
    backendUrlInput = findViewById(R.id.etBackendUrl)
    deviceNameInput = findViewById(R.id.etDeviceName)

    backendUrlInput.setText(Settings.backendUrl(this) ?: Settings.DEFAULT_BACKEND_URL)
    deviceNameInput.setText(Settings.deviceName(this))

    val deviceDetailsToggle: TextView =
        findViewById(R.id.tvDeviceDetailsToggle)

    val deviceDetailsLayout: LinearLayout =
        findViewById(R.id.layoutDeviceDetails)

    deviceDetailsToggle.setOnClickListener {
        val expanded = deviceDetailsLayout.visibility == View.VISIBLE

        deviceDetailsLayout.visibility =
            if (expanded) View.GONE else View.VISIBLE

        deviceDetailsToggle.text =
            if (expanded) "Device Details  ▼" else "Device Details  ▲"
    }

    adapter = RequestAdapter(onCall = ::callRequest, onDismiss = ::dismissRequest)

    findViewById<RecyclerView>(R.id.rvRequests).apply {
        layoutManager = LinearLayoutManager(this@MainActivity)
        adapter = this@MainActivity.adapter
    }

    findViewById<Button>(R.id.btnCopyToken).setOnClickListener { copyToken() }
    findViewById<Button>(R.id.btnRegister).setOnClickListener { registerWithBackend() }

    NotificationHelper.ensureChannel(this)
    requestNotificationPermissionIfNeeded()
    loadToken()
}

    override fun onStart() {
        super.onStart()
        AppForeground.isVisible = true
        // The list is the source of truth now; clear tray notifications so they don't duplicate it.
        NotificationHelper.cancelAll(this)
        DialRequestRepository.addListener(repositoryListener)
        refreshList(announceNew = false)
        updateNotificationWarning()
    }

    override fun onStop() {
        AppForeground.isVisible = false
        DialRequestRepository.removeListener(repositoryListener)
        super.onStop()
    }

    // ---- request list ---------------------------------------------------------------------

    private fun refreshList(announceNew: Boolean) {
        val items = DialRequestRepository.all(this)
        val newestUnseen = items.firstOrNull {
            it.status == RequestStatus.PENDING && it.requestId !in knownRequestIds
        }
        knownRequestIds.addAll(items.map { it.requestId })

        adapter.setItems(items)
        emptyText.visibility = if (items.isEmpty()) View.VISIBLE else View.GONE

        if (announceNew && announcedOnce && newestUnseen != null) {
            val name = newestUnseen.contactName ?: getString(R.string.unknown_contact)
            Snackbar.make(
                findViewById(android.R.id.content),
                getString(R.string.snackbar_new_request, name),
                Snackbar.LENGTH_LONG,
            ).show()
        }
        announcedOnce = true
    }

    private fun callRequest(request: DialRequest) {
        if (!DialRequestActions.openDialer(this, request.requestId, request.phoneNumber)) {
            Toast.makeText(this, R.string.error_no_dialer, Toast.LENGTH_LONG).show()
        }
    }

    private fun dismissRequest(request: DialRequest) = DialRequestActions.dismiss(this, request.requestId)

    // ---- device registration --------------------------------------------------------------

    private fun loadToken() {
        tokenText.setText(R.string.token_loading)
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                Log.w(TAG, "Fetching FCM token failed", task.exception)
                tokenText.setText(R.string.token_unavailable)
                return@addOnCompleteListener
            }
            val token = task.result
            Settings.saveToken(this, token)
            tokenText.text = token
        }
    }

    private fun copyToken() {
        val token = Settings.token(this) ?: run {
            Toast.makeText(this, R.string.status_no_token, Toast.LENGTH_SHORT).show()
            return
        }
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("FCM token", token))
        Toast.makeText(this, R.string.token_copied, Toast.LENGTH_SHORT).show()
    }

    private fun registerWithBackend() {
        val baseUrl = BackendUrl.normalize(backendUrlInput.text.toString())
        if (baseUrl == null) {
            backendUrlInput.error = getString(R.string.error_backend_url)
            return
        }
        val token = Settings.token(this)
        if (token == null) {
            registerStatus.setText(R.string.status_no_token)
            return
        }
        val deviceName = deviceNameInput.text.toString().trim().ifEmpty { Build.MODEL }

        Settings.saveBackendUrl(this, baseUrl)
        Settings.saveDeviceName(this, deviceName)
        registerStatus.setText(R.string.status_registering)

        BackendClient.registerDevice(baseUrl, token, deviceName) { result ->
            runOnUiThread {
                registerStatus.text = result.fold(
                    onSuccess = { getString(R.string.status_registered) },
                    onFailure = { getString(R.string.status_register_failed, it.message ?: it.javaClass.simpleName) },
                )
            }
        }
    }

    // ---- notification permission ----------------------------------------------------------

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !NotificationManagerCompat.from(this).areNotificationsEnabled()
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun updateNotificationWarning() {
        val enabled = NotificationManagerCompat.from(this).areNotificationsEnabled()
        notificationWarning.visibility = if (enabled) View.GONE else View.VISIBLE
    }

    private companion object {
        const val TAG = "MainActivity"
    }
}
