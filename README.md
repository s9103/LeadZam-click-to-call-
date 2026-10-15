# LeadZam Click-to-Call

## Project overview

LeadZam Click-to-Call lets a user request a call from a browser-based
CRM and continue the call on an Android phone.

The flow is simple:

1.  The user clicks **Call** next to a lead in the CRM dashboard.
2.  The dashboard sends the request to the backend.
3.  The backend sends a message through Firebase Cloud Messaging (FCM).
4.  The Android app receives the request.
5.  The user taps **Call** on the phone.
6.  The native Android dialer opens with the phone number filled in.

**The app never places a call automatically.** The user decides whether
to place the call from the dialer.

The browser does not contain Firebase server credentials. Those
credentials stay on the backend.

## How the system works

``` mermaid
flowchart LR
    UI["CRM dashboard<br/>(browser)"] -- "POST /api/dial" --> API["Node.js / Express backend"]
    API -- "FCM data message" --> FCM[("Firebase Cloud Messaging")]
    FCM --> APP["Android app"]
    APP -- "App open: in-app list<br/>App in background: notification" --> USER(("User taps Call"))
    USER -- "ACTION_DIAL" --> DIALER["Native dialer<br/>number filled in"]
    APP -. "Status updates: /api/ack" .-> API
    API -. "Dashboard checks status every 2 seconds" .-> UI
```

## Repository layout

  -----------------------------------------------------------------------
  Path                                Purpose
  ----------------------------------- -----------------------------------
  `web/`                              CRM dashboard built with HTML, CSS,
                                      and JavaScript. The backend serves
                                      these files.

  `backend/`                          Node.js and Express API, Firebase
                                      message sender, and backend tests.

  `android/`                          Android app, including FCM
                                      handling, notifications, dialer
                                      launch, and unit tests.

  `scripts/check-secrets.sh`          Checks for secrets that should not
                                      be committed.
  -----------------------------------------------------------------------

## Requirements

Before running the project, install:

-   **Node.js 18 or newer.** The project was developed with Node.js 22.
-   **Android Studio Ladybug or newer.**
-   An Android phone running Android 7.0 (API 24) or newer, or an
    emulator with Google Play services.
-   A Firebase project.

## 1. Configure Firebase

Complete these steps once.

1.  Open the [Firebase Console](https://console.firebase.google.com/)
    and create a project.

2.  In **Project settings**, add an Android app with this package name:

    `com.leadzam.clicktocall`

3.  Download `google-services.json` and place it here:

    `android/app/google-services.json`

4.  In Firebase **Project settings → Service accounts**, generate a new
    private key.

5.  Save the key here:

    `backend/secrets/service-account.json`

Both files contain project-specific configuration or credentials and are
excluded from Git. **Never commit the service-account key or put it in
the web or Android app.**

## 2. Start the backend and CRM dashboard

Open a terminal in the project folder and run:

``` bash
cd backend
npm install
```

Create a local environment file from the example. On macOS/Linux, run:

``` bash
cp .env.example .env
```

On Windows PowerShell, run:

``` powershell
Copy-Item .env.example .env
```

Then start the backend:

``` bash
npm start
```

The backend and CRM dashboard are available at:

`http://localhost:3000`

### Run without Firebase

If you do not have Firebase configured yet, you can run the mock mode:

``` bash
npm run start:mock
```

Mock mode logs messages instead of sending them through FCM. It is
useful for trying the dashboard and backend without sending real push
notifications.

The dashboard can also simulate common FCM token errors by registering a
token that starts with `invalid` or `unregistered`.

## 3. Run the Android app

1.  Open the `android/` folder in Android Studio.
2.  Wait for Gradle sync to finish.
3.  Run the `app` configuration on an emulator or connected Android
    phone.
4.  Allow notifications when Android asks for permission. This prompt
    appears on Android 13 and newer.
5.  In the app, enter the **Backend URL** if it is not already correct.

Use the URL that matches your setup:

-   **Android emulator:** `http://10.0.2.2:3000`
-   **Physical phone:** `http://<your-laptop-LAN-IP>:3000`

For a physical phone, connect the phone and computer to the same Wi-Fi
network. Replace `<your-laptop-LAN-IP>` with your computer's local
network IP address. Allow Node.js through the computer's firewall if
prompted.

6.  Tap **Register with backend**. The dashboard's Android device
    indicator should turn green.

You can also tap **Copy token** in the app and register the token
manually in the dashboard.

The debug build allows HTTP for local development. Release builds block
cleartext HTTP by default.

## 4. Demo walkthrough


1.  Open the CRM dashboard and confirm that the Android device indicator
    is green.
2.  Click **Call** next to **Rahul Sharma**. The dashboard should show
    that the request was accepted by FCM.
3.  **Background test:** Put the Android app in the background. Send
    another call request from the dashboard. A notification should
    appear.
4.  Tap **Call** in the notification. The native dialer should open with
    `+919876543210` filled in. The call is not placed automatically.
5.  **Foreground test:** Return to the Android app and leave it open.
    Send another request from the dashboard. It should appear in the
    in-app request list with a snackbar, without a system notification.
6.  Tap **Call** on the request card. The native dialer should open with
    the requested number filled in.
7.  Click **Call** next to **Anita Verma**, the sample lead with an
    invalid number. The dashboard should show a validation error, and
    the request should not be sent.

Only describe a status as "received by the phone" or "dialer opened" if
you have verified that the app sent the corresponding acknowledgement.

## API overview

  -----------------------------------------------------------------------
  Method and path                     Purpose
  ----------------------------------- -----------------------------------
  `POST /api/dial`                    Validates a phone number and sends
                                      a call request.

  `POST /api/device`                  Registers the Android device.

  `GET /api/device`                   Returns the registered device with
                                      its token masked.

  `DELETE /api/device`                Removes the registered device.

  `POST /api/ack`                     Receives status updates from
                                      Android: `received`,
                                      `dialer_opened`, or `dismissed`.

  `GET /api/requests`                 Returns recent requests and their
                                      statuses for the dashboard.

  `GET /api/leads`                    Returns the sample leads.

  `GET /api/health`                   Checks whether the backend is
                                      running.
  -----------------------------------------------------------------------

The `POST /api/dial` endpoint accepts `phoneNumber` and an optional
`contactName`. Typical responses include:

-   `202`: the request was accepted for sending.
-   `400`: the request contains invalid data, or an FCM token is
    invalid.
-   `409`: no Android device is registered.
-   `410`: FCM reports that the token is no longer registered.
-   `502` or `503`: an FCM or backend configuration problem occurred.

Errors use a consistent structure:

``` json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "A readable explanation",
    "fields": {},
    "retryable": false
  }
}
```

The `fields` and `retryable` properties are optional.

## Example FCM message

The backend sends a data-only message similar to this:

``` json
{
  "token": "<device token>",
  "data": {
    "type": "dial_request",
    "requestId": "b3b1…",
    "phoneNumber": "+919876543210",
    "contactName": "Rahul Sharma",
    "sentAt": "2026-10-14T11:22:37.000Z"
  },
  "android": {
    "priority": "high",
    "ttl": 300000
  }
}
```

The token and request ID above are examples. The actual values depend on
the registered device and request.

## Important design decisions

### 1. The backend sends the FCM message

The browser calls the backend. The backend uses the Firebase Admin SDK
to send the message. This keeps server credentials out of the browser
and Android app.

### 2. The message contains data, not a notification block

The app needs to decide how to show each request. A data-only FCM
message lets the app handle the request and choose the foreground or
background experience.

### 3. Requests expire after five minutes

The FCM message uses high priority and a five-minute time-to-live (TTL).
A call request can become outdated quickly, so an old request should not
arrive much later.

There is no collapse key, so separate requests are not intentionally
collapsed into one message.

### 4. Foreground and background behavior are different

-   **App in the foreground:** The request appears in the in-app list
    and a snackbar is shown. No system notification is posted.
-   **App in the background:** The app posts a notification with a
    **Call** action.

The app does not unexpectedly open an activity over another app.

### 5. The dialer opens only after the user taps Call

The app uses Android's `ACTION_DIAL` intent. It opens the native dialer
with the number filled in. The user must press the dialer's call button
to place the call. This does not require the `CALL_PHONE` permission.

### 6. The app validates incoming numbers

The backend validates the number before sending it, and the Android app
validates it again. This helps reject unsafe input, including USSD/MMI
codes such as `*#06#`.

### 7. Status messages are based on acknowledgements

"Accepted by FCM" means Firebase accepted the message for sending. It
does **not** prove that the phone received it. The dashboard can show
later statuses when the Android app sends an acknowledgement.

Acknowledgements are best-effort. If the backend cannot be reached, the
app's dialer flow can still work, but a status update may be lost.

## Error handling and edge cases

  -----------------------------------------------------------------------
  Situation                           Expected behavior
  ----------------------------------- -----------------------------------
  Empty or invalid phone number       The backend returns a validation
                                      error. No FCM message is sent. The
                                      app also validates incoming data.

  No device registered                The API returns `409 NO_DEVICE`
                                      with an explanation.

  Invalid or unregistered FCM token   The backend reports the error and
                                      asks for device registration again.

  FCM is unavailable, rate-limited,   The backend returns an appropriate
  or times out                        error. Sending requests time out
                                      after 10 seconds.

  Firebase credentials are missing    The backend reports
                                      `503 FCM_NOT_CONFIGURED` and logs a
                                      startup warning.

  Browser cannot reach the backend    The dashboard shows a connection
                                      error.

  App is open or in the background    The request appears in the in-app
                                      list or as a notification,
                                      respectively.

  App is swiped away from Recents     FCM may start the service and the
                                      app can post a notification. Test
                                      this on the target device.

  App is force-stopped in Android     Android can block FCM delivery
  settings                            until the app is opened again.

  Notification permission is denied   The app can still store and show
                                      requests in its in-app list, and it
                                      displays a warning.

  User swipes away a notification     The request is marked as dismissed
                                      when the acknowledgement reaches
                                      the backend.

  Several requests arrive             Each request has its own ID and can
                                      be handled separately. Duplicate
                                      deliveries are ignored by request
                                      ID.

  No dialer app can handle the        The app shows a message and does
  request                             not mark the dialer as opened.
  -----------------------------------------------------------------------

## Testing

### Backend tests

Run from the `backend/` directory:

``` bash
npm test
```

The backend test suite has **22 tests** covering areas such as:

-   Phone-number validation and USSD rejection.
-   FCM payload contents and priority.
-   No-device and invalid-token responses.
-   FCM failures, missing credentials, and timeouts.
-   Acknowledgement status handling.
-   Concurrent requests and malformed JSON.

A backend smoke test using mock FCM also covers the health endpoint,
dashboard, device registration, dial requests, validation errors,
acknowledgements, and the unregistered-token path.

### Android unit tests

Run from the `android/` directory on Windows:

``` powershell
.\gradlew.bat testDebugUnitTest
```

On macOS/Linux:

``` bash
./gradlew testDebugUnitTest
```

The unit tests cover request parsing, number sanitisation, contact-name
cleaning, JSON conversion, and backend URL validation. Android-framework
behavior such as notifications and activities should also be tested on my
real device.

### Manual device checklist

Complete these checks on your target phone before recording the demo:

-   [ ] Foreground: request appears in the list with a snackbar and no
    system notification.
-   [ ] Background: notification appears, and **Call** opens the dialer
    with the correct number.
-   [ ] App swiped away from Recents: test whether the notification
    still arrives.
-   [ ] Two requests in a row: both requests appear and can be called.
-   [ ] Swipe away a notification: the dashboard shows the dismissed
    status.
-   [ ] Deny notification permission: the app shows a warning and
    requests remain visible in the app.
-   [ ] Keep the phone offline for more than five minutes: check that an
    expired request is not delivered later.
-   [ ] Test an unregistered token and confirm the dashboard reports the
    error.
-   [ ] Try the invalid sample number for Anita Verma and confirm that
    validation blocks it.


## Assumptions and known limitations

-   The project supports one demo device.
-   Device information is stored locally in the git-ignored
    `backend/data/device.json` file.
-   Request history is held in memory and contains only the 50 most
    recent requests. It resets when the backend restarts.
-   The device registration and acknowledgement endpoints do not require
    authentication. This is acceptable for a demo, but not for
    production.
-   Acknowledgements are sent without a retry queue, so an update can be
    lost if the app or backend stops at the wrong time.
-   The dashboard checks for status updates every two seconds instead of
    using server-sent events (SSE) or WebSockets.
-   Relative times in the Android request list refresh when the screen
    opens or changes, not continuously.
-   The leads are sample data defined in `backend/src/leads.js`.
-   Cleartext HTTP is enabled for debug builds only. Production should
    use HTTPS.

## What I would improve for production

-   **Support multiple devices:** Store device records in a database and
    let the user choose which phone receives a call request.
-   **Add authentication:** Protect device registration and
    acknowledgement endpoints, and add appropriate access controls.
-   **Improve reliability:** Retry acknowledgements using Android
    WorkManager and expire old requests on the CRM side.
-   **Update the dashboard in real time:** Consider SSE instead of
    polling every two seconds.
-   **Add stronger tests:** Add Android UI/instrumentation tests and
    automated end-to-end tests.
-   **Support dual SIM:** Let the user choose a SIM where Android and
    the selected dialer support it.
-   **Improve security:** Use HTTPS, rate limiting, and a secure secret
    manager.

## AI Usage Notes

-   **AI tools used:** Claude and ChatGPT.
-   **How AI helped:** AI tools assisted with implementation, code
    refinement, debugging, testing, and documentation in different parts
    of the project.
-   **Areas where AI assisted:** Android notification and dialer flow,
    backend API and FCM handling, foreground/background behavior,
    user-interface improvements, tests, and project documentation.
-   **Developer involvement:** Worked on frontend and backend development, reviewed AI-generated code, integrated changes and
    resolved issues, tested the end-to-end workflow, and made decisions about the final implementation.

### One AI suggestion I changed or improved

I used Android's `ACTION_DIAL` rather than `ACTION_CALL`. This opens the
native dialer with the phone number filled in and leaves the final
decision to the user. It also avoids requiring the `CALL_PHONE`
permission.
