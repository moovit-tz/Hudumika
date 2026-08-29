import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Shared chrome for every screen in the auth flow (login → onboarding →
/// device trust) — these all render on AuthGradientBackground and need to
/// read as one continuous flow, not a premium login screen handing off to a
/// plain-theme form. Pulled out of login_screen.dart so onboarding_screen.dart
/// stops being the one screen in the flow that looks like a different app.

/// Step progress — three small pills, the current one wider and lit.
/// Onboarding is exactly 3 steps (name/PIN/device-trust); login's own
/// welcome→phone→OTP progression doesn't show this (it can also *end* at
/// step 1 for a Google sign-in), so this is onboarding-only for now.
class AuthStepDots extends StatelessWidget {
  final int step; // 0-based
  final int total;
  const AuthStepDots({super.key, required this.step, required this.total});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(total, (i) {
        final active = i == step;
        final done = i < step;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 250),
          margin: const EdgeInsets.symmetric(horizontal: 3),
          width: active ? 22 : 7,
          height: 7,
          decoration: BoxDecoration(
            color: (active || done) ? Colors.white : Colors.white.withOpacity(0.25),
            borderRadius: BorderRadius.circular(999),
          ),
        );
      }),
    );
  }
}

/// Translucent glass input — the pill treatment login's phone step already
/// uses, generalised so onboarding's name/PIN fields match it instead of
/// falling back to the default Material outline TextField.
class GlassInput extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final bool autofocus;
  final TextInputType? keyboardType;
  final bool obscureText;
  final TextAlign textAlign;
  final TextStyle? style;
  final ValueChanged<String>? onSubmitted;
  final int? maxLength;
  final List<TextInputFormatter>? inputFormatters;
  const GlassInput({
    super.key,
    required this.controller,
    required this.hint,
    this.autofocus = false,
    this.keyboardType,
    this.obscureText = false,
    this.textAlign = TextAlign.start,
    this.style,
    this.onSubmitted,
    this.maxLength,
    this.inputFormatters,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.22)),
      ),
      child: TextField(
        controller: controller,
        autofocus: autofocus,
        keyboardType: keyboardType,
        obscureText: obscureText,
        textAlign: textAlign,
        maxLength: maxLength,
        inputFormatters: inputFormatters,
        onSubmitted: onSubmitted,
        style: style ?? const TextStyle(color: Colors.white, fontSize: 15),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: TextStyle(color: Colors.white.withOpacity(0.4)),
          border: InputBorder.none,
          counterText: '',
          contentPadding: const EdgeInsets.symmetric(vertical: 15, horizontal: 16),
        ),
      ),
    );
  }
}

/// Primary CTA — the indigo gradient pill from login's phone/OTP steps
/// (#5b6bf0 -> #4253d1), now shared so onboarding uses the exact same
/// button instead of the default flat ElevatedButton.
class GradientPillButton extends StatelessWidget {
  final String label;
  final bool busy;
  final VoidCallback? onPressed;
  const GradientPillButton({super.key, required this.label, this.busy = false, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, constraints) {
      return SizedBox(
        width: constraints.maxWidth,
        height: 50,
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [Color(0xFF5B6BF0), Color(0xFF4253D1)]),
            borderRadius: BorderRadius.circular(999),
            boxShadow: [BoxShadow(color: const Color(0xFF5060DC).withOpacity(0.4), blurRadius: 20, offset: const Offset(0, 8))],
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(999),
              onTap: busy ? null : onPressed,
              child: Center(
                child: busy
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
              ),
            ),
          ),
        ),
      );
    });
  }
}

/// Translucent white pill — login's secondary "Continue with phone number"
/// treatment, generalised for reuse (e.g. a "Skip" / "Not now" action).
class GlassPillButton extends StatelessWidget {
  final String label;
  final VoidCallback onPressed;
  const GlassPillButton({super.key, required this.label, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          backgroundColor: Colors.white.withOpacity(0.12),
          side: BorderSide(color: Colors.white.withOpacity(0.28)),
          shape: const StadiumBorder(),
          padding: const EdgeInsets.symmetric(vertical: 15),
        ),
        child: Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
      ),
    );
  }
}

/// Six-box code entry — login's OTP boxes, generalised with an
/// `obscure` flag so onboarding's PIN step (a secret you set, not a code
/// you read off an SMS) reuses the identical widget instead of a bare
/// `maxLength: 6` TextField that looks like it belongs to a different app.
class CodeBoxes extends StatefulWidget {
  final bool error;
  final bool obscure;
  final void Function(String value) onChanged;
  const CodeBoxes({super.key, required this.onChanged, this.error = false, this.obscure = false});

  @override
  State<CodeBoxes> createState() => _CodeBoxesState();
}

class _CodeBoxesState extends State<CodeBoxes> {
  final _controllers = List.generate(6, (_) => TextEditingController());
  final _focusNodes = List.generate(6, (_) => FocusNode());

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  void _notify() => widget.onChanged(_controllers.map((c) => c.text).join());

  void _onChanged(int index, String value) {
    final digits = value.replaceAll(RegExp(r'\D'), '');
    if (digits.length > 1) {
      for (var i = 0; i < digits.length && index + i < 6; i++) {
        _controllers[index + i].text = digits[i];
      }
      final next = (index + digits.length).clamp(0, 5);
      _focusNodes[next].requestFocus();
      _notify();
      return;
    }
    if (digits.isNotEmpty && index < 5) _focusNodes[index + 1].requestFocus();
    _notify();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(6, (i) {
        return Padding(
          padding: EdgeInsets.only(right: i == 5 ? 0 : 8),
          child: SizedBox(
            width: 44,
            height: 52,
            child: Focus(
              onKeyEvent: (node, event) {
                if (event is KeyDownEvent &&
                    event.logicalKey == LogicalKeyboardKey.backspace &&
                    _controllers[i].text.isEmpty &&
                    i > 0) {
                  _controllers[i - 1].clear();
                  _focusNodes[i - 1].requestFocus();
                  _notify();
                }
                return KeyEventResult.ignored;
              },
              child: TextField(
                controller: _controllers[i],
                focusNode: _focusNodes[i],
                autofocus: i == 0,
                obscureText: widget.obscure,
                textAlign: TextAlign.center,
                keyboardType: TextInputType.number,
                maxLength: 6,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
                onChanged: (v) => _onChanged(i, v),
                onTap: () => _controllers[i].selection = TextSelection(baseOffset: 0, extentOffset: _controllers[i].text.length),
                decoration: InputDecoration(
                  counterText: '',
                  filled: true,
                  fillColor: Colors.white.withOpacity(0.10),
                  contentPadding: EdgeInsets.zero,
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: widget.error ? const Color(0xFFF87171) : Colors.white.withOpacity(0.25)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: widget.error ? const Color(0xFFF87171) : Colors.white.withOpacity(0.6)),
                  ),
                ),
              ),
            ),
          ),
        );
      }),
    );
  }
}

/// Error copy under a field/button — same red across every auth step.
class AuthErrorText extends StatelessWidget {
  final String text;
  const AuthErrorText(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    return Text(text, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 13));
  }
}
