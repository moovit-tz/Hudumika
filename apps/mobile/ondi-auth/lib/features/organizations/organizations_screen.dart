import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/premium_widgets.dart';
import '../auth/auth_state.dart';
import 'create_organization_screen.dart';
import 'organization_detail_screen.dart';

/// The companies the signed-in Ondi identity belongs to — the entry point
/// for real multi-tenant company.hudumika.tz SSO (see services/ondi-api's
/// GET /organizations/mine and POST /organizations). Reached from Profile,
/// same weight as Devices/Passkeys/Recovery.
class OrganizationsScreen extends ConsumerStatefulWidget {
  const OrganizationsScreen({super.key});

  @override
  ConsumerState<OrganizationsScreen> createState() => _OrganizationsScreenState();
}

class _OrganizationsScreenState extends ConsumerState<OrganizationsScreen> {
  List<dynamic> _orgs = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final orgs = await ref.read(authNotifierProvider.notifier).api.getMyOrganizations();
      if (!mounted) return;
      setState(() {
        _orgs = orgs;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = describeApiError(e);
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: const Text('Organizations')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final created = await Navigator.push<bool>(
            context,
            MaterialPageRoute(builder: (_) => const CreateOrganizationScreen()),
          );
          if (created == true) _load();
        },
        icon: const Icon(Icons.add_rounded),
        label: const Text('Create'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: ErrorState(message: _error!, onRetry: _load))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(Gap.lg),
                    children: [
                      Text(
                        'The companies you belong to on Ondi — each gets its own workspace across every Hudumika product.',
                        style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                      ),
                      const SizedBox(height: Gap.lg),
                      if (_orgs.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 40),
                          child: Column(
                            children: [
                              IconBadge(icon: Icons.apartment_rounded, tone: Tone.neutral, size: 44),
                              const SizedBox(height: Gap.sm),
                              Text("You don't belong to any organization yet.", style: TextStyle(color: AppTheme.textSecondary)),
                            ],
                          ),
                        ),
                      for (final (i, org) in _orgs.cast<Map<String, dynamic>>().indexed)
                        Builder(builder: (context) {
                          final canManage = org['role'] == 'Owner' || org['role'] == 'Admin';
                          return NavRow(
                            icon: Icons.apartment_rounded,
                            title: org['businessName'] as String? ?? 'Unnamed organization',
                            subtitle: org['role'] as String?,
                            trailing: canManage ? null : const SizedBox.shrink(),
                            onTap: canManage
                                ? () => Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (_) => OrganizationDetailScreen(
                                          organizationId: org['id'] as String,
                                          businessName: org['businessName'] as String? ?? 'Unnamed organization',
                                        ),
                                      ),
                                    )
                                : () {},
                          );
                        }).entrance(i),
                    ],
                  ),
                ),
    );
  }
}
