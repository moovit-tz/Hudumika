/// A federated (Google/Microsoft/Apple) signup with no phone linked yet gets
/// a non-deliverable `federated_<provider>_<sub>` placeholder in
/// User.phoneNumber (see services/ondi-api's federated.ts) rather than
/// null — mirrors apps/web/ondi-auth's hasDeliverablePhone in src/lib/api.ts.
/// Any UI showing "phone verified" status or the phone itself must check
/// this first, or it'll render the raw placeholder / claim a channel that
/// doesn't actually exist.
bool hasDeliverablePhone(String? phoneNumber) {
  return phoneNumber != null &&
      phoneNumber.isNotEmpty &&
      !phoneNumber.startsWith('federated_') &&
      !phoneNumber.startsWith('deleted_');
}
