# GitHub Actions Workflows

## Active Workflows

- **reusable-deploy-supabase.yml**: Deploys Edge Functions and migrations
- **schedule-chatlog-export.yml**: Daily export to Google Drive (2 AM UTC)
- **schedule-content-engine.yml**: Content generation every 6 hours
- **reusable-security-audit.yml**: Dependency vulnerability scanning

## Required Secrets

| Secret | Purpose | How to Obtain |
|--------|---------|---------------|
| \`SUPABASE_ACCESS_TOKEN\` | Deploy to Supabase | https://app.supabase.com/account/tokens |
| \`SUPABASE_PROJECT_ID\` | Project identifier | Supabase Dashboard → Settings |
| \`GOOGLE_DRIVE_CREDENTIALS\` | Service account auth | GCP Console → IAM → Service Accounts |
| \`GOOGLE_DRIVE_FOLDER_ID\` | Target folder | From folder URL |

## Troubleshooting

See \`DEBUGGING_NOTES.md\` for common issues and solutions.
