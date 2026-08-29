import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/premium_widgets.dart';
import '../auth/auth_state.dart';

/// Owner/Admin only — where a self-service "join as a corporate" request
/// (see the Hudumika Workspace app's flow, when a searched company already
/// exists) gets approved or declined. Approving is what actually creates
/// the person's membership; everything they did before this (search, BRELA
/// confirm, sign-in) only proved who they are and which company they meant.
class OrganizationDetailScreen extends ConsumerStatefulWidget {
  const OrganizationDetailScreen({super.key, required this.organizationId, required this.businessName});
  final String organizationId;
  final String businessName;

  @override
  ConsumerState<OrganizationDetailScreen> createState() => _OrganizationDetailScreenState();
}

class _OrganizationDetailScreenState extends ConsumerState<OrganizationDetailScreen> {
  List<dynamic> _requests = [];
  bool _loading = true;
  String? _error;
  final Set<String> _resolving = {};

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
      final requests = await ref.read(authNotifierProvider.notifier).api.getJoinRequests(widget.organizationId);
      if (!mounted) return;
      setState(() {
        _requests = requests;
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

  Future<void> _decide(String requestId, bool approve) async {
    setState(() => _resolving.add(requestId));
    try {
      final api = ref.read(authNotifierProvider.notifier).api;
      if (approve) {
        await api.approveJoinRequest(widget.organizationId, requestId);
      } else {
        await api.declineJoinRequest(widget.organizationId, requestId);
      }
      if (mounted) _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e))));
      }
    } finally {
      if (mounted) setState(() => _resolving.remove(requestId));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: Text(widget.businessName)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: ErrorState(message: _error!, onRetry: _load))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(Gap.lg),
                    children: [
                      const SectionHeader(title: 'Pending join requests'),
                      const SizedBox(height: Gap.sm),
                      if (_requests.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 32),
                          child: Column(
                            children: [
                              IconBadge(icon: Icons.how_to_reg_rounded, tone: Tone.neutral, size: 40),
                              const SizedBox(height: Gap.sm),
                              Text('No pending requests.', style: TextStyle(color: AppTheme.textSecondary)),
                            ],
                          ),
                        ),
                      for (final (i, req) in _requests.cast<Map<String, dynamic>>().indexed)
                        _JoinRequestCard(
                          request: req,
                          busy: _resolving.contains(req['id'] as String),
                          onApprove: () => _decide(req['id'] as String, true),
                          onDecline: () => _decide(req['id'] as String, false),
                        ).entrance(i),
                    ],
                  ),
                ),
    );
  }
}

class _JoinRequestCard extends StatelessWidget {
  const _JoinRequestCard({required this.request, required this.busy, required this.onApprove, required this.onDecline});
  final Map<String, dynamic> request;
  final bool busy;
  final VoidCallback onApprove;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    final user = request['user'] as Map<String, dynamic>? ?? {};
    final name = (user['name'] as String?)?.trim();
    final email = user['email'] as String?;
    final phone = user['phone'] as String?;

    return Container(
      margin: const EdgeInsets.only(bottom: Gap.sm),
      padding: const EdgeInsets.all(Gap.md),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(name?.isNotEmpty == true ? name! : 'Unnamed user', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
          if (email != null) ...[
            const SizedBox(height: 2),
            Text(email, style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
          ],
          if (phone != null) ...[
            const SizedBox(height: 2),
            Text(phone, style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
          ],
          const SizedBox(height: Gap.md),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: busy ? null : onDecline,
                  child: const Text('Decline'),
                ),
              ),
              const SizedBox(width: Gap.sm),
              Expanded(
                child: ElevatedButton(
                  onPressed: busy ? null : onApprove,
                  child: busy
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Approve'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
