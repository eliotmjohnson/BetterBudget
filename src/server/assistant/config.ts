import 'server-only';

/** The assistant is enabled only when a Claude API key is configured. */
export const assistantConfigured = () =>
    Boolean(process.env.ANTHROPIC_API_KEY?.trim());
