import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../../core/theme/premium_widgets.dart';

/// Camera-based QR reader for adding a real MFA account — parity with
/// apps/web/ondi-auth's QrScanner.tsx, but using mobile_scanner instead of
/// the browser-only BarcodeDetector API so this also works in the native
/// Android/iOS builds, not just the web build. Pops with the raw
/// otpauth://totp/... string once a matching code is found.
class QrScanScreen extends StatefulWidget {
  const QrScanScreen({super.key});

  @override
  State<QrScanScreen> createState() => _QrScanScreenState();
}

class _QrScanScreenState extends State<QrScanScreen> {
  final MobileScannerController _controller = MobileScannerController(formats: [BarcodeFormat.qrCode]);
  bool _handled = false;
  // start()'s getUserMedia() promise can sit unresolved indefinitely — most
  // often the browser's own permission popup waiting on the person (easy to
  // miss, sits up in the address bar chrome, not inside the page), but a
  // stuck "Starting camera…" with no way out either way was the reported
  // bug. Bound the wait and always offer the manual-entry escape hatch.
  Timer? _timeoutTimer;
  bool _timedOut = false;

  @override
  void initState() {
    super.initState();
    _timeoutTimer = Timer(const Duration(seconds: 8), () {
      if (mounted && !_controller.value.isRunning) setState(() => _timedOut = true);
    });
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue;
      if (value != null && value.startsWith('otpauth://')) {
        _handled = true;
        Navigator.pop(context, value);
        return;
      }
    }
  }

  @override
  void dispose() {
    _timeoutTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Scan QR code'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Enter manually', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            errorBuilder: (context, error) {
              // e.g. camera permission denied, or no camera on this device —
              // never leave the person on a dead camera view with no way
              // forward, same principle as web's onUnsupported callback.
              return _StatusOverlay(
                icon: Icons.videocam_off_outlined,
                message: 'Camera access was denied — go back and enter the setup key manually instead.',
              );
            },
          ),
          // A plain black rectangle with no explanation (permission prompt
          // dismissed, no camera on this device/browser, stream stuck) was
          // exactly the reported bug — this makes what's actually happening
          // visible instead of silently indistinguishable from "broken".
          ValueListenableBuilder<MobileScannerState>(
            valueListenable: _controller,
            builder: (context, state, _) {
              if (state.isRunning) return const SizedBox.shrink();
              if (state.error != null) {
                return _StatusOverlay(
                  icon: Icons.videocam_off_outlined,
                  message: switch (state.error!.errorCode) {
                    MobileScannerErrorCode.permissionDenied =>
                      'Camera access was denied. Allow camera access for this site in your browser settings, then try again — or enter the setup key manually.',
                    _ => 'Camera unavailable: ${state.error!.errorDetails?.message ?? state.error!.errorCode}. Enter the setup key manually instead.',
                  },
                );
              }
              if (_timedOut) {
                return _StatusOverlay(
                  icon: Icons.videocam_off_outlined,
                  message: "This is taking a while. Check for a camera-permission popup from your browser (often near the address bar) — or tap \"Enter manually\" above.",
                );
              }
              return const _StatusOverlay(
                icon: null,
                message: 'Starting camera…',
                spinner: true,
              );
            },
          ),
          Center(
            child: Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.white.withOpacity(0.85), width: 2),
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: Gap.xxxl,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: Gap.xxl),
              child: Text(
                'Point the camera at the setup QR code from the other app.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 13, height: 1.4),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusOverlay extends StatelessWidget {
  final IconData? icon;
  final String message;
  final bool spinner;
  const _StatusOverlay({required this.icon, required this.message, this.spinner = false});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(Gap.xxl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (spinner)
                const SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              else if (icon != null)
                Icon(icon, color: Colors.white.withOpacity(0.7), size: 32),
              const SizedBox(height: Gap.md),
              Text(message, textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withOpacity(0.85), fontSize: 13, height: 1.4)),
            ],
          ),
        ),
      ),
    );
  }
}
