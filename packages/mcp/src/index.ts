#!/usr/bin/env bun
// SBL MCP server (stdio): lets an AI client query your training data through
// the personal-access-token API. Config via env: SBL_TOKEN, SBL_API_URL.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { APP_NAME, conditionFindings, progressionFindings } from "@sbl/core";
import { z } from "zod";
import { api, fetchExport, toFindingsInputs } from "./api";

const server = new McpServer({
  name: `${APP_NAME.toLowerCase()}-mcp`,
  version: "0.1.0",
});

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

server.registerTool(
  "list_exercises",
  { description: "List the user's exercises (seeded + custom)." },
  async () => text(await api("/v1/exercises?limit=1000")),
);

server.registerTool(
  "list_sessions",
  {
    description: "List training sessions, newest first, with condition values.",
    inputSchema: {
      limit: z.number().int().min(1).max(1000).optional(),
      offset: z.number().int().min(0).optional(),
    },
  },
  async ({ limit = 50, offset = 0 }) =>
    text(await api(`/v1/sessions?limit=${limit}&offset=${offset}`)),
);

server.registerTool(
  "get_session",
  {
    description: "One session with its exercises and every logged set.",
    inputSchema: { session_id: z.string() },
  },
  async ({ session_id }) => {
    const bundle = await fetchExport();
    const session = bundle.sessions.find((s) => s.id === session_id);
    if (!session) throw new Error(`no session ${session_id}`);
    const exerciseName = new Map(
      bundle.exercises.map((e) => [e.id as string, e.name as string]),
    );
    const ses = bundle.session_exercises.filter(
      (se) => se.session_id === session_id,
    );
    return text({
      ...session,
      exercises: ses.map((se) => ({
        exercise: exerciseName.get(se.exercise_id as string) ?? se.exercise_id,
        sets: bundle.set_logs
          .filter((sl) => sl.session_exercise_id === se.id)
          .sort((a, b) => (a.set_no as number) - (b.set_no as number)),
      })),
    });
  },
);

server.registerTool(
  "get_sets",
  {
    description:
      "Raw set logs, newest first (weight_kg, reps, RIR, notes, custom metric values).",
    inputSchema: {
      limit: z.number().int().min(1).max(1000).optional(),
      offset: z.number().int().min(0).optional(),
    },
  },
  async ({ limit = 100, offset = 0 }) =>
    text(await api(`/v1/sets?limit=${limit}&offset=${offset}`)),
);

server.registerTool(
  "get_progression",
  {
    description:
      "Run the findings engine locally: per-exercise progression verdicts (robust e1RM trend) plus condition correlations. Optionally filter to one exercise by name.",
    inputSchema: { exercise_name: z.string().optional() },
  },
  async ({ exercise_name }) => {
    const bundle = await fetchExport();
    const sessions = toFindingsInputs(bundle);
    const { trends, countdowns } = progressionFindings(sessions);
    const conditionMetrics = bundle.metrics
      .filter(
        (m) =>
          m.scope === "session" && (m.type === "number" || m.type === "scale"),
      )
      .map((m) => ({ id: m.id as string, name: m.name as string }));
    const conditions = conditionFindings(sessions, conditionMetrics);
    const match = (name: string) =>
      !exercise_name ||
      name.toLowerCase().includes(exercise_name.toLowerCase());
    return text({
      caveat:
        "Correlation, not causation. Trends need >=5 sessions per exercise.",
      trends: trends.filter((t) => match(t.exerciseName)),
      countdowns: countdowns.filter((c) => match(c.exerciseName)),
      condition_findings: conditions,
    });
  },
);

server.registerTool(
  "export_all",
  { description: "Full data export (every table, JSON)." },
  async () => text(await fetchExport()),
);

await server.connect(new StdioServerTransport());
