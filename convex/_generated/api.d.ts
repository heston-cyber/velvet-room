/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as cards from "../cards.js";
import type * as engine_build from "../engine/build.js";
import type * as engine_fake from "../engine/fake.js";
import type * as engine_rng from "../engine/rng.js";
import type * as engine_text from "../engine/text.js";
import type * as engine_textAdult from "../engine/textAdult.js";
import type * as engine_types from "../engine/types.js";
import type * as game from "../game.js";
import type * as host from "../host.js";
import type * as join from "../join.js";
import type * as lib from "../lib.js";
import type * as narration from "../narration.js";
import type * as ping from "../ping.js";
import type * as registration from "../registration.js";
import type * as seal from "../seal.js";
import type * as shared from "../shared.js";
import type * as voice from "../voice.js";
import type * as voiceLines from "../voiceLines.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  cards: typeof cards;
  "engine/build": typeof engine_build;
  "engine/fake": typeof engine_fake;
  "engine/rng": typeof engine_rng;
  "engine/text": typeof engine_text;
  "engine/textAdult": typeof engine_textAdult;
  "engine/types": typeof engine_types;
  game: typeof game;
  host: typeof host;
  join: typeof join;
  lib: typeof lib;
  narration: typeof narration;
  ping: typeof ping;
  registration: typeof registration;
  seal: typeof seal;
  shared: typeof shared;
  voice: typeof voice;
  voiceLines: typeof voiceLines;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
