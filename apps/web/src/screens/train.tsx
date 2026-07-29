import type { Routine, RoutineFolder } from "@frog/core";
import {
  ChevronDown,
  ChevronRight,
  Compass,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Play,
  Plus,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatTime } from "@/lib/format";
import { useActiveSession } from "@/lib/queries";
import { useRepo } from "@/lib/repo";
import {
  useCreateRoutineFolder,
  useDeleteRoutine,
  useDeleteRoutineFolder,
  useDuplicateRoutine,
  useMoveRoutine,
  useRenameRoutineFolder,
  useRoutineFolders,
  useRoutines,
} from "@/lib/routine-queries";
import { useStartSession } from "@/lib/start-session";
import { cn } from "@/lib/utils";
import { useVoice } from "@/lib/voice";

export default function TrainScreen() {
  const navigate = useNavigate();
  const { t } = useVoice();
  const { data: active } = useActiveSession();
  const { start, starting, error } = useStartSession();
  const { data: folders = [] } = useRoutineFolders();
  const { data: routines = [] } = useRoutines();
  const createFolder = useCreateRoutineFolder();
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");

  const byFolder = useMemo(() => {
    const map = new Map<string | null, Routine[]>();
    for (const r of routines) {
      const key = r.folderId;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return map;
  }, [routines]);

  const unfiled = byFolder.get(null) ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Training</h1>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="New folder"
            onClick={() => setNewFolderOpen(true)}
            data-testid="new-folder-btn"
          >
            <FolderPlus className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/routines/new")}
            data-testid="new-routine-btn"
          >
            <Plus className="size-4" /> New routine
          </Button>
        </div>
      </div>

      {/* Quick start */}
      <div className="mt-4 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {active && (
            <Button
              variant="primary"
              className="w-full sm:w-auto"
              onClick={() => navigate(`/session/${active.id}`)}
              data-testid="resume-session-btn"
            >
              <Play className="size-4" /> Resume session
            </Button>
          )}
          <Button
            variant={active ? "outline" : "primary"}
            className="w-full sm:w-auto"
            disabled={starting}
            onClick={() => void start()}
            data-testid="start-session-btn"
          >
            {!active && <Play className="size-4" />}
            {starting
              ? "Starting…"
              : active
                ? "Start empty workout"
                : "Start empty workout"}
          </Button>
          {active && (
            <span className="num self-center text-2xs text-faint">
              started {formatTime(active.startedAt)}
            </span>
          )}
        </div>
        {/* Error framing is playground; the exact message stays outside t()
            so the fact survives every register. */}
        {error && (
          <p className="mt-2 text-xs text-neg">
            {t(
              "Could not start the session.",
              "The frog is annoyed. The session did not start.",
            )}{" "}
            {error}
          </p>
        )}
      </div>

      {/* Programs + Trainer entry points */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => navigate("/programs")}
          data-testid="programs-link"
        >
          <Compass className="size-4" /> Programs
        </Button>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => navigate("/trainer")}
          data-testid="trainer-link"
        >
          <Sparkles className="size-4" /> Trainer
        </Button>
      </div>

      {/* Folders */}
      <div className="mt-6 flex flex-col gap-4">
        {folders.map((f) => (
          <FolderSection
            key={f.id}
            folder={f}
            routines={byFolder.get(f.id) ?? []}
            folders={folders}
          />
        ))}

        {unfiled.length > 0 && (
          <div data-testid="unfiled-routines">
            {folders.length > 0 && (
              <p className="mb-2 text-2xs font-medium tracking-widest text-faint uppercase">
                Routines
              </p>
            )}
            <div className="flex flex-col gap-2">
              {unfiled.map((r) => (
                <RoutineCard key={r.id} routine={r} folders={folders} />
              ))}
            </div>
          </div>
        )}

        {routines.length === 0 && folders.length === 0 && (
          <div className="rounded-lg border border-border bg-surface p-6 text-center">
            <p className="text-sm text-soft">
              {t(
                "No routines yet. Build one to make every session start pre-filled.",
                "The lab is empty. The frog is waiting.",
              )}
            </p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => navigate("/routines/new")}
            >
              <Plus className="size-4" /> Create your first routine
            </Button>
          </div>
        )}
      </div>

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent title="New folder">
          <Input
            placeholder="Folder name"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            autoFocus
            data-testid="folder-name-input"
            onKeyDown={(e) => {
              if (e.key === "Enter" && folderName.trim()) {
                createFolder.mutate(folderName.trim());
                setFolderName("");
                setNewFolderOpen(false);
              }
            }}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!folderName.trim()}
              onClick={() => {
                createFolder.mutate(folderName.trim());
                setFolderName("");
                setNewFolderOpen(false);
              }}
              data-testid="folder-create-btn"
            >
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FolderSection({
  folder,
  routines,
  folders,
}: {
  folder: RoutineFolder;
  routines: Routine[];
  folders: RoutineFolder[];
}) {
  const { t } = useVoice();
  const [open, setOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(folder.name);
  const rename = useRenameRoutineFolder();
  const del = useDeleteRoutineFolder();

  return (
    <div data-testid={`folder-${folder.name}`}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="flex h-10 flex-1 items-center gap-2 rounded-md px-1 text-left hover:bg-surface-2"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? (
            <ChevronDown className="size-4 text-faint" />
          ) : (
            <ChevronRight className="size-4 text-faint" />
          )}
          <Folder className="size-4 text-faint" />
          <span className="text-sm font-medium">{folder.name}</span>
          <span className="num text-2xs text-faint">{routines.length}</span>
        </button>
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Folder menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreHorizontal className="size-4" />
          </Button>
          {menuOpen && (
            <div className="absolute right-0 z-10 mt-1 flex w-36 flex-col rounded-md border border-border bg-surface p-1 shadow-md">
              <MenuItem
                label="Rename"
                onClick={() => {
                  setMenuOpen(false);
                  setRenaming(true);
                }}
              />
              <MenuItem
                label="Delete folder"
                destructive
                onClick={() => {
                  setMenuOpen(false);
                  if (
                    window.confirm(
                      `Delete folder "${folder.name}"? Its routines stay (unfiled).`,
                    )
                  )
                    del.mutate(folder.id);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {renaming && (
        <div className="mt-1 flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 flex-1"
            autoFocus
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              if (name.trim())
                rename.mutate({ id: folder.id, name: name.trim() });
              setRenaming(false);
            }}
          >
            Save
          </Button>
        </div>
      )}

      {open && (
        <div className="mt-2 flex flex-col gap-2 pl-6">
          {routines.map((r) => (
            <RoutineCard key={r.id} routine={r} folders={folders} />
          ))}
          {routines.length === 0 && (
            <p className="text-xs text-faint">
              {t("Empty folder", "Empty. The frog checked.")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function RoutineCard({
  routine,
  folders,
}: {
  routine: Routine;
  folders: RoutineFolder[];
}) {
  const navigate = useNavigate();
  const repo = useRepo();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [startingR, setStartingR] = useState(false);
  const duplicate = useDuplicateRoutine();
  const move = useMoveRoutine();
  const del = useDeleteRoutine();

  async function startRoutine() {
    if (startingR) return;
    setStartingR(true);
    try {
      const session = await repo.startRoutineSession(routine.id);
      navigate(`/session/${session.id}`);
    } finally {
      setStartingR(false);
    }
  }

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3"
      data-testid={`routine-card-${routine.name}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{routine.name}</p>
        {routine.description && (
          <p className="truncate text-2xs text-faint">{routine.description}</p>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={startingR}
        onClick={() => void startRoutine()}
        data-testid={`routine-start-${routine.name}`}
      >
        <Play className="size-4" /> Start
      </Button>
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Routine menu"
          onClick={() => setMenuOpen((o) => !o)}
          data-testid={`routine-menu-${routine.name}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
        {menuOpen && (
          <div className="absolute right-0 z-10 mt-1 flex w-40 flex-col rounded-md border border-border bg-surface p-1 shadow-md">
            <MenuItem
              label="Edit"
              onClick={() => navigate(`/routines/${routine.id}/edit`)}
            />
            <MenuItem
              label="Duplicate"
              onClick={() => {
                setMenuOpen(false);
                duplicate.mutate(routine.id);
              }}
            />
            {folders.length > 0 && (
              <MenuItem
                label="Move to folder…"
                onClick={() => {
                  setMenuOpen(false);
                  setMoveOpen(true);
                }}
              />
            )}
            <MenuItem
              label="Delete"
              destructive
              onClick={() => {
                setMenuOpen(false);
                if (window.confirm(`Delete routine "${routine.name}"?`))
                  del.mutate(routine.id);
              }}
              testId={`routine-delete-${routine.name}`}
            />
          </div>
        )}
      </div>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent title={`Move “${routine.name}”`}>
          <div className="mt-2 flex flex-col gap-1">
            <button
              type="button"
              className="flex h-10 items-center rounded-md px-2 text-left text-sm hover:bg-surface-2"
              onClick={() => {
                move.mutate({ routineId: routine.id, folderId: null });
                setMoveOpen(false);
              }}
            >
              No folder
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                className={cn(
                  "flex h-10 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-surface-2",
                  f.id === routine.folderId && "text-accent",
                )}
                onClick={() => {
                  move.mutate({ routineId: routine.id, folderId: f.id });
                  setMoveOpen(false);
                }}
              >
                <Folder className="size-4 text-faint" /> {f.name}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  destructive,
  testId,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 items-center rounded px-2 text-left text-xs hover:bg-surface-2",
        destructive && "text-neg",
      )}
      onClick={onClick}
      data-testid={testId}
    >
      {label}
    </button>
  );
}
