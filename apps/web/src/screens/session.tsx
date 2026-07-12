import { useParams } from "react-router";

export default function SessionScreen() {
  const { id } = useParams();
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-lg font-semibold tracking-tight">Session</h1>
      <p className="num mt-1 text-xs text-soft">Set logging lands in P3. ({id})</p>
    </div>
  );
}
