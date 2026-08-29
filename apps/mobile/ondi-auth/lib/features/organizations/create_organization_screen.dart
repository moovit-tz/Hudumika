import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/premium_widgets.dart';
import '../auth/auth_state.dart';

/// Same reserved-word/shape rule as the backend (services/ondi-api's
/// organizations.ts validateSubdomain, apps/api's onboarding.service.ts) —
/// duplicated here only for instant client-side feedback; the backend is
/// still the real authority and re-validates on submit.
final _reservedSubdomains = {
  'www', 'api', 'admin', 'app', 'mail', 'static', 'assets', 'cdn',
  'superadmin', 'support', 'help', 'blog', 'docs', 'status',
};

bool _looksLikeValidSubdomain(String value) {
  if (!RegExp(r'^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$').hasMatch(value)) return false;
  return !_reservedSubdomains.contains(value);
}

enum _SubdomainStatus { idle, checking, available, taken, invalid }

/// A real "create your company" flow, backed by services/ondi-api's
/// POST /organizations (subdomain param) + GET /organizations/by-subdomain
/// + POST /organizations/brela-search — the actual Phase B entry point,
/// since apps/web's old onboarding wizard isn't wired into production.
class CreateOrganizationScreen extends ConsumerStatefulWidget {
  const CreateOrganizationScreen({super.key});

  @override
  ConsumerState<CreateOrganizationScreen> createState() => _CreateOrganizationScreenState();
}

class _CreateOrganizationScreenState extends ConsumerState<CreateOrganizationScreen> {
  final _businessName = TextEditingController();
  final _registrationNumber = TextEditingController();
  final _country = TextEditingController(text: 'TZ');
  final _subdomain = TextEditingController();

  Timer? _debounce;
  _SubdomainStatus _subdomainStatus = _SubdomainStatus.idle;
  bool _brelaSearching = false;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _debounce?.cancel();
    _businessName.dispose();
    _registrationNumber.dispose();
    _country.dispose();
    _subdomain.dispose();
    super.dispose();
  }

  void _onSubdomainChanged(String raw) {
    _debounce?.cancel();
    final value = raw.trim().toLowerCase();
    if (value.isEmpty) {
      setState(() => _subdomainStatus = _SubdomainStatus.idle);
      return;
    }
    if (!_looksLikeValidSubdomain(value)) {
      setState(() => _subdomainStatus = _SubdomainStatus.invalid);
      return;
    }
    setState(() => _subdomainStatus = _SubdomainStatus.checking);
    _debounce = Timer(const Duration(milliseconds: 400), () async {
      try {
        final available = await ref.read(authNotifierProvider.notifier).api.isSubdomainAvailable(value);
        if (!mounted || _subdomain.text.trim().toLowerCase() != value) return;
        setState(() => _subdomainStatus = available ? _SubdomainStatus.available : _SubdomainStatus.taken);
      } catch (_) {
        // A failed availability check is a cosmetic miss, not a form error
        // — the real check happens again server-side on submit.
        if (mounted) setState(() => _subdomainStatus = _SubdomainStatus.idle);
      }
    });
  }

  Future<void> _searchBrela() async {
    final number = _registrationNumber.text.trim();
    if (number.isEmpty) return;
    setState(() => _brelaSearching = true);
    try {
      final results = await ref.read(authNotifierProvider.notifier).api.brelaSearch(objectType: 'ET-COMPANY', number: number);
      if (!mounted) return;
      if (results.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No BRELA record found for that number.')));
      } else {
        final match = results.first as Map<String, dynamic>;
        final name = match['legal_name'] ?? match['cm_name'] ?? match['bn_name'] ?? match['company_name'];
        if (name is String && name.isNotEmpty) {
          setState(() => _businessName.text = name);
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Found: $name')));
        }
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e))));
    } finally {
      if (mounted) setState(() => _brelaSearching = false);
    }
  }

  Future<void> _submit() async {
    final businessName = _businessName.text.trim();
    final registrationNumber = _registrationNumber.text.trim();
    if (businessName.isEmpty || registrationNumber.isEmpty) {
      setState(() => _error = 'Business name and registration number are required.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(authNotifierProvider.notifier).api.createOrganization(
            businessName: businessName,
            registrationNumber: registrationNumber,
            country: _country.text.trim().isEmpty ? 'TZ' : _country.text.trim().toUpperCase(),
            subdomain: _subdomain.text.trim().toLowerCase(),
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = describeApiError(e));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: const Text('Create organization')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(Gap.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Business details', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textSecondary)),
            const SizedBox(height: Gap.sm),
            TextField(
              controller: _registrationNumber,
              decoration: InputDecoration(
                labelText: 'BRELA registration number',
                suffixIcon: _brelaSearching
                    ? const Padding(padding: EdgeInsets.all(12), child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)))
                    : IconButton(icon: const Icon(Icons.search_rounded), tooltip: 'Search BRELA', onPressed: _searchBrela),
              ),
            ),
            const SizedBox(height: Gap.sm),
            TextField(controller: _businessName, decoration: const InputDecoration(labelText: 'Business name')),
            const SizedBox(height: Gap.sm),
            TextField(controller: _country, decoration: const InputDecoration(labelText: 'Country (ISO code)'), textCapitalization: TextCapitalization.characters),

            const SizedBox(height: Gap.xl),
            Text('Workspace address', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.textSecondary)),
            const SizedBox(height: Gap.sm),
            TextField(
              controller: _subdomain,
              onChanged: _onSubdomainChanged,
              textCapitalization: TextCapitalization.none,
              decoration: InputDecoration(
                labelText: 'Company code',
                hintText: 'mycompany',
                suffixText: '.hudumika.tz',
              ),
            ),
            const SizedBox(height: Gap.xs),
            _SubdomainStatusLine(status: _subdomainStatus),

            const SizedBox(height: Gap.xl),
            if (_error != null) ...[
              Text(_error!, style: TextStyle(color: AppTheme.statusError, fontSize: 13)),
              const SizedBox(height: Gap.md),
            ],
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _submitting || _subdomainStatus == _SubdomainStatus.taken || _subdomainStatus == _SubdomainStatus.invalid
                    ? null
                    : _submit,
                child: _submitting
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                    : const Text('Create organization'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SubdomainStatusLine extends StatelessWidget {
  const _SubdomainStatusLine({required this.status});
  final _SubdomainStatus status;

  @override
  Widget build(BuildContext context) {
    switch (status) {
      case _SubdomainStatus.idle:
        return const SizedBox(height: 16);
      case _SubdomainStatus.checking:
        return Row(children: [
          const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2)),
          const SizedBox(width: 8),
          Text('Checking availability…', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
        ]);
      case _SubdomainStatus.available:
        return Text('Available', style: TextStyle(fontSize: 12, color: AppTheme.statusSuccess, fontWeight: FontWeight.w600));
      case _SubdomainStatus.taken:
        return Text('Already taken', style: TextStyle(fontSize: 12, color: AppTheme.statusError, fontWeight: FontWeight.w600));
      case _SubdomainStatus.invalid:
        return Text('3-63 characters: lowercase letters, numbers and hyphens only', style: TextStyle(fontSize: 12, color: AppTheme.statusError));
    }
  }
}
