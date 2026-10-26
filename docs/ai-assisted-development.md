# AI-assisted development

AI coding assistance was used in planning, scaffolding, implementation, test construction, documentation, and review. The requirements and architecture constraints were supplied explicitly. Generated code is checked through TypeScript builds and automated tests; live provider behavior still needs a credential-backed smoke check.

Secrets are kept in environment variables and ignored by Git. Tests mock Gemini so they do not consume quota or require a production key. Human review remains necessary for deployment settings, credentials, and warranty decisions.
