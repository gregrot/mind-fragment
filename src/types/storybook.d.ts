declare module '@storybook/react' {
  // Minimal Storybook type stubs for type-checking in environments without Storybook installed.
  export type Meta<TArgs = Record<string, unknown>> = unknown;
  export type StoryObj<TArgs = Record<string, unknown>> = unknown;
}
