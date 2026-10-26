# Gemini integration

Gemini provides a short triage summary, issue category, priority, and suggested action for human reviewers. The server alone reads `GEMINI_API_KEY` and calls Google's `generateContent` API using `GEMINI_MODEL`; the key is never bundled into the client.

The prompt asks for an assessment without an eligibility decision. Gemini is requested to return JSON matching a schema; Zod validates and bounds every returned field before it is stored. The receipt and claim are saved, then the API responds without waiting for Gemini. Analysis continues in the server process with a 45-second timeout. A malformed response, provider error, absent key, or timeout leaves the claim submitted and records a non-success assessment state. Failures are logged server-side.

The admin sees the result under **AI-generated assessment**. If assessment failed, was unavailable, predates this status tracking, or has remained pending for over two minutes, an admin can retry it from the claim drawer. Gemini never changes claim status, approves, or rejects a claim. Status updates are explicit admin actions.

Provider reference: [Gemini generateContent API](https://ai.google.dev/api/generate-content) and [structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).
