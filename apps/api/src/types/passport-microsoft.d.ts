declare module 'passport-microsoft' {
  /** Microsoft identity platform OAuth2 strategy */
  export class Strategy {
    constructor(
      options: Record<string, unknown>,
      verify?: (...args: unknown[]) => void,
    );
  }
}
