import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateExercise, useExercises } from "@/lib/queries";

export default function LibraryScreen() {
  const { data: exercises = [], isLoading } = useExercises();
  const create = useCreateExercise();
  const [name, setName] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(trimmed);
    setName("");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-20 md:pb-6">
      <h1 className="text-lg font-semibold tracking-tight">Library</h1>

      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <Input
          placeholder="New exercise name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="exercise-name-input"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={name.trim().length === 0}
          data-testid="add-exercise-btn"
        >
          Add
        </Button>
      </form>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        {isLoading ? (
          <p className="px-3.5 py-6 text-center text-xs text-faint">Loading…</p>
        ) : exercises.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-xs text-faint">
            No exercises yet. Add your first above.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {exercises.map((ex) => (
              <li
                key={ex.id}
                data-testid={`exercise-row-${ex.name}`}
                className="flex items-center justify-between px-3.5 py-2.5 text-sm transition-colors duration-100 hover:bg-surface-hover"
              >
                <span>{ex.name}</span>
                {!ex.isCustom && (
                  <span className="text-2xs text-faint uppercase">seed</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
