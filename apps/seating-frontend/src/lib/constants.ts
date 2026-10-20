export const APPLICATION_NAME = import.meta.env.VITE_APP_NAME || 'Bellvel';
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@bellvel.com';
export const SUPPORT_FORM_URL = 'https://forms.gle/7NdHWrdd786NHQkX6';
// Feature flag: show and wire the "AI Powered (LLM)" generation method.
// Gating by subscription tier will be layered on top of this later.
export const AI_GENERATION_ENABLED = true;
