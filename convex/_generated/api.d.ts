/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as data from "../data.js";
import type * as exercises from "../exercises.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as routines from "../routines.js";
import type * as rows from "../rows.js";
import type * as sessions from "../sessions.js";
import type * as tables from "../tables.js";
import type * as tokenApi from "../tokenApi.js";
import type * as user from "../user.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  data: typeof data;
  exercises: typeof exercises;
  files: typeof files;
  http: typeof http;
  lib: typeof lib;
  routines: typeof routines;
  rows: typeof rows;
  sessions: typeof sessions;
  tables: typeof tables;
  tokenApi: typeof tokenApi;
  user: typeof user;
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
