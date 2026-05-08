/**
 * Type augmentation for Web Audio API.
 *
 * The W3C spec defines AudioContextState as "suspended" | "running" | "closed"
 * (https://www.w3.org/TR/webaudio/#enumdef-audiocontextstate), but the
 * TypeScript DOM lib currently maps it to "running" | "interrupted" | "suspended",
 * omitting "closed".
 */

export {};

declare global {
  interface BaseAudioContext {
    /**
     * Augmenting the state property to include 'closed' per W3C spec.
     */
    readonly state: "suspended" | "running" | "closed" | "interrupted";
  }
}
