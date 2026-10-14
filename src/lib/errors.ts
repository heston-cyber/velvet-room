import { ConvexError } from "convex/values";

export function friendlyError(err: unknown): string {
  if (err instanceof ConvexError) return String(err.data);
  if (err instanceof Error && err.message && !/Server Error|\[CONVEX/.test(err.message)) return err.message;
  return "Something went wrong. Check your connection and try again.";
}
