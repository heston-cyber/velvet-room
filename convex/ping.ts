import { query } from "./_generated/server";

// Connectivity check used during setup and by the host screen's status light.
export const ping = query({
  args: {},
  handler: async () => "The Velvet Room is open.",
});
