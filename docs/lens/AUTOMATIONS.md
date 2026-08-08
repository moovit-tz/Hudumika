# Automations

Lens includes a lightweight rules engine to automate workflows.

## Example Rules
- **Trigger**: GitHub PR Merged -> **Action**: Move item to `DONE`.
- **Trigger**: Item moved to `IN_PROGRESS` -> **Action**: Assign to current user if unassigned.
- **Trigger**: High priority bug created -> **Action**: Send Slack notification to #engineering.