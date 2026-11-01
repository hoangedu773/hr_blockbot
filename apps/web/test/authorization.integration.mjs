// Compatibility entrypoint for the previous foundation command.
// V1's owned-Mongo browser suite preserves the nine-profile login/scope panel and
// 320px checks, then also verifies real onboarding/delegation/lifecycle/grant flows.
// Capless foundation fixtures must not be given authority by legacy global flags.
import './authorization-v1.integration.mjs';
