import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:hugeicons/hugeicons.dart';
import 'app_theme.dart';

/// Shared premium building blocks used across every dashboard/security
/// screen so the app reads as one enterprise product instead of a set of
/// screens each hand-rolling their own card/row/badge. Keep new screens on
/// these instead of raw Card+ListTile+Icon — see CLAUDE.md's design-system
/// mapping for why ad-hoc per-screen chrome is the thing that drifts first.

/// Every mutating action (trust/lock/remove a device, delete a passkey,
/// accept/remove a recovery contact, approve/deny a push, disconnect an
/// app) used to `await api.xxx(); onChanged();` unconditionally — the bool
/// success/failure the client already returns was thrown away, so a failed
/// action (offline, session expired, backend error) looked identical to a
/// successful one: the button did nothing and the list didn't change, with
/// no indication anything was wrong. Call this from the `else` branch
/// instead of silently no-op'ing.
void showActionFailure(BuildContext context, String message) {
  AppTheme.showCustomToast(context, message, icon: HugeIcons.strokeRoundedAlert02, color: AppTheme.statusError);
}

/// Fixed spacing ladder — stop picking one-off gaps (10, 14, 18...).
class Gap {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0;
  static const xxl = 24.0;
  static const xxxl = 32.0;
}

enum Tone { brand, success, warning, error, neutral }

Color _toneColor(Tone tone) {
  switch (tone) {
    case Tone.brand:
      return AppTheme.primary;
    case Tone.success:
      return AppTheme.statusSuccess;
    case Tone.warning:
      return AppTheme.statusWarning;
    case Tone.error:
      return AppTheme.statusError;
    case Tone.neutral:
      return AppTheme.textSecondary;
  }
}

/// Uppercase, letter-spaced section label with an optional trailing action —
/// replaces the bare `Text(fontWeight: w700)` each screen used for "Recent
/// activity" / "Authentication" / etc. with one consistent treatment.
class SectionHeader extends StatelessWidget {
  final String title;
  final Widget? trailing;
  const SectionHeader({super.key, required this.title, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title.toUpperCase(),
          style: TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
            color: AppTheme.textSecondary,
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

/// Icon-in-a-tinted-rounded-square — the mobile analogue of the web design
/// system's FeaturedIcon. Use for anything that used to be a bare `Icon(...)`
/// leading a row: nav tiles, activity rows, empty states.
class IconBadge extends StatelessWidget {
  final IconData icon;
  final Tone tone;
  final double size;
  const IconBadge({super.key, required this.icon, this.tone = Tone.brand, this.size = 36});

  @override
  Widget build(BuildContext context) {
    final color = _toneColor(tone);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color.withOpacity(AppTheme.isDark ? 0.16 : 0.10),
        borderRadius: BorderRadius.circular(size * 0.32),
      ),
      child: Icon(icon, size: size * 0.5, color: color),
    );
  }
}

/// Premium replacement for the plain `Card(child: ListTile(...))` nav-tile
/// pattern repeated across Security/Devices/Apps — icon badge, title,
/// subtitle, chevron, consistent padding, tap ripple that respects the
/// card's own radius.
class NavRow extends StatelessWidget {
  final IconData icon;
  final Tone tone;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback onTap;
  final EdgeInsets margin;
  const NavRow({
    super.key,
    required this.icon,
    this.tone = Tone.brand,
    required this.title,
    this.subtitle,
    this.trailing,
    required this.onTap,
    this.margin = const EdgeInsets.only(bottom: Gap.sm),
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.cardBorder),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(Gap.md),
            child: Row(
              children: [
                IconBadge(icon: icon, tone: tone),
                const SizedBox(width: Gap.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
                      if (subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(subtitle!, style: TextStyle(fontSize: 12, color: AppTheme.textSecondary, height: 1.3)),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: Gap.sm),
                trailing ?? Icon(Icons.chevron_right_rounded, color: AppTheme.textSecondary.withOpacity(0.6)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Consistent info/alert banner — replaces the one-off warning `Container`
/// in security_tab and any similar ad-hoc banner elsewhere. `tone` drives
/// both the tint and the default icon; pass `action` for a trailing link.
class AlertBanner extends StatelessWidget {
  final String title;
  final String body;
  final Tone tone;
  final IconData icon;
  final Widget? action;
  const AlertBanner({
    super.key,
    required this.title,
    required this.body,
    this.tone = Tone.warning,
    this.icon = Icons.info_rounded,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    final color = _toneColor(tone);
    return Container(
      padding: const EdgeInsets.all(Gap.lg),
      decoration: BoxDecoration(
        color: color.withOpacity(AppTheme.isDark ? 0.10 : 0.08),
        border: Border.all(color: color.withOpacity(0.28)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: Gap.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color)),
                const SizedBox(height: 4),
                Text(body, style: TextStyle(fontSize: 12.5, color: AppTheme.textSecondary, height: 1.4)),
                if (action != null) ...[const SizedBox(height: Gap.sm), action!],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Plain info card — the "Authentication" / "Multi-factor verification"
/// style block, standardised so every screen stops re-declaring the same
/// Card+Padding+Column.
class InfoCard extends StatelessWidget {
  final String title;
  final String body;
  final EdgeInsets margin;
  const InfoCard({super.key, required this.title, required this.body, this.margin = const EdgeInsets.only(bottom: Gap.sm)});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      padding: const EdgeInsets.all(Gap.lg),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
          const SizedBox(height: 6),
          Text(body, style: TextStyle(fontSize: 12.5, color: AppTheme.textSecondary, height: 1.45)),
        ],
      ),
    );
  }
}

/// Stat tile with an icon accent — premium replacement for the bare
/// number+label `_StatBox` columns on Overview.
class StatTile extends StatelessWidget {
  final IconData icon;
  final Tone tone;
  final String label;
  final int value;
  final VoidCallback onTap;
  const StatTile({super.key, required this.icon, this.tone = Tone.brand, required this.label, required this.value, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final color = _toneColor(tone);
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: Gap.sm),
          child: Column(
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(height: 6),
              Text('$value', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
              const SizedBox(height: 1),
              Text(label, style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Distinct from an empty state — this is "it failed to load," not "there's
/// nothing here." Every screen that fetches a list (devices, authenticator
/// accounts, apps, passkeys, recovery contacts, activity) now shows this
/// instead of silently rendering the same empty-state copy a real
/// zero-items response would show — see core/api_error.dart for why that
/// distinction was missing before.
class ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const ErrorState({super.key, required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Column(
        children: [
          IconBadge(icon: Icons.wifi_off_rounded, tone: Tone.error, size: 44),
          const SizedBox(height: Gap.sm),
          Text(message, textAlign: TextAlign.center, style: TextStyle(color: AppTheme.textSecondary)),
          const SizedBox(height: Gap.md),
          OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

/// Staggered fade+slide-in for list rows — one shared motion signature
/// instead of each screen inventing (or skipping) its own. Keep durations
/// short; this is a settle-in, not a showpiece.
extension PremiumEntrance on Widget {
  Widget entrance(int index) {
    return animate(delay: (40 * index).ms)
        .fadeIn(duration: 260.ms, curve: Curves.easeOut)
        .slideY(begin: 0.06, end: 0, duration: 260.ms, curve: Curves.easeOut);
  }
}
