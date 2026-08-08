# GitHub Integration

## Capabilities
- **Branch Tracking**: Link branches to Lens items.
- **PR Sync**: Automatically transition items to `IN_REVIEW` when a linked PR is opened.
- **Merge Sync**: Automatically transition items to `DONE` when a linked PR is merged.
- **CI Status**: Display GitHub Actions build status directly on the Lens item.

## Webhooks
Lens listens for GitHub webhooks at `/v1/lens/webhooks/github` to process `pull_request` and `push` events in real-time.