# Quest join

Same Wi-Fi as the Mac. Quest Browser, not an APK.

1. On the Mac tab at `https://127.0.0.1:5173`, click **Enter Quest**.
2. That panel shows a LAN URL, a QR, and a 6-character code (about five
   minutes, single use).
3. On the headset, open `https://<mac-ip>:5173/pair`, accept the cert
   once, type the code. A phone can scan the QR instead (token is in the
   URL fragment).
4. Allow WebXR, then **Enter Studio**. Passthrough is in the in-headset
   settings.

Join URLs always use port **5173**, never the dev API port. After pairing,
the headset stores a device token (`sfab-bench.deviceToken` in
localStorage) and can open the viewer without typing the code again.

Mac and Quest share the loaded STEP, the agent-facing selection, the
active thread (including the live reply), and harness/model/effort.
Camera, XR placement, and card layout stay per client.

Opening `https://<lan-ip>:5173` on the Mac is treated as a guest: it
must pair.
