import { COMMUNITY_SHARING } from "../config";
import type { NewExerciseOpts } from "../repo/types";

// Whether a create publishes to the shared library (owner_id null +
// created_by, via the publish_exercise RPC) or stays a private owned row.
// One rule, shared by the repo (which picks the RPC vs. the direct insert),
// the optimistic row (which must not flash a private create as shared) and
// the create form (which warns when a machine link forces privacy).
//
// Publishing is the default while COMMUNITY_SHARING is on, but two things
// force a private row: an explicit `share: false` (every fork path — the
// library's Make-a-private-copy, detail's Duplicate, the session's
// copy-on-write — passes it so a copy is never itself published), and a
// machine link. The publish RPC's parameter whitelist has no machine_id, so
// a machine-bearing create can never ride the shared library; publishing it
// would silently drop the machine. Staged demo media forces privacy the same
// way — media_path/media_type are likewise absent from the whitelist — but
// media lives in the editor's local state, not opts, so the editor passes
// `share: false` for it rather than this function seeing it.
export function resolveExerciseShare(opts?: NewExerciseOpts): boolean {
  if (opts?.share === false) return false;
  if (opts?.machineId) return false;
  return COMMUNITY_SHARING;
}
