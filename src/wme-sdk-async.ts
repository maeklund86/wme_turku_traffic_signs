import type { AsyncWmeSDK } from "wme-sdk-typings";

interface AsyncWmeSdkOptions {
  scriptId: string;
  scriptName: string;
  mode: "async";
}

type AsyncWmeSdkFactory = (options: AsyncWmeSdkOptions) => AsyncWmeSDK;

/**
 * The pinned SDK typings still declare only the synchronous getWmeSdk shape.
 * This adapter adds the documented async-mode option and result type in one
 * place without widening the rest of the SDK surface.
 */
export function getAsyncWmeSdk(
  factory: NonNullable<Window["getWmeSdk"]>,
  options: Omit<AsyncWmeSdkOptions, "mode">,
): AsyncWmeSDK {
  const asyncFactory = factory as unknown as AsyncWmeSdkFactory;
  return asyncFactory({ ...options, mode: "async" });
}
