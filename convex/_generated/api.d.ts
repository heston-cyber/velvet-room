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
import type * as caseFile from "../caseFile.js";
import type * as engine_build from "../engine/build.js";
import type * as engine_fake from "../engine/fake.js";
import type * as engine_rng from "../engine/rng.js";
import type * as engine_text from "../engine/text.js";
import type * as engine_textAdult from "../engine/textAdult.js";
import type * as engine_types from "../engine/types.js";
import type * as figures from "../figures.js";
import type * as game from "../game.js";
import type * as heckles from "../heckles.js";
import type * as host from "../host.js";
import type * as hosting from "../hosting.js";
import type * as join from "../join.js";
import type * as lib from "../lib.js";
import type * as narration from "../narration.js";
import type * as ping from "../ping.js";
import type * as registration from "../registration.js";
import type * as replay from "../replay.js";
import type * as roasts from "../roasts.js";
import type * as rollCall from "../rollCall.js";
import type * as seal from "../seal.js";
import type * as shared from "../shared.js";
import type * as show from "../show.js";
import type * as voice from "../voice.js";
import type * as voiceLines from "../voiceLines.js";
import type * as weapons from "../weapons.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  cards: typeof cards;
  caseFile: typeof caseFile;
  "engine/build": typeof engine_build;
  "engine/fake": typeof engine_fake;
  "engine/rng": typeof engine_rng;
  "engine/text": typeof engine_text;
  "engine/textAdult": typeof engine_textAdult;
  "engine/types": typeof engine_types;
  figures: typeof figures;
  game: typeof game;
  heckles: typeof heckles;
  host: typeof host;
  hosting: typeof hosting;
  join: typeof join;
  lib: typeof lib;
  narration: typeof narration;
  ping: typeof ping;
  registration: typeof registration;
  replay: typeof replay;
  roasts: typeof roasts;
  rollCall: typeof rollCall;
  seal: typeof seal;
  shared: typeof shared;
  show: typeof show;
  voice: typeof voice;
  voiceLines: typeof voiceLines;
  weapons: typeof weapons;
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
