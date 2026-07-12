import { Command } from "cmdk";
import {
  BookOpen,
  Dumbbell,
  FlaskConical,
  History,
  LogOut,
  Moon,
  Play,
  Settings,
  Sun,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

type Item = {
  label: string;
  icon: typeof Play;
  action: () => void;
  keywords?: string;
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  const nav: Item[] = [
    { label: "Train", icon: Dumbbell, action: () => navigate("/") },
    { label: "Library", icon: BookOpen, action: () => navigate("/library") },
    { label: "History", icon: History, action: () => navigate("/history") },
    { label: "Findings", icon: FlaskConical, action: () => navigate("/findings") },
    { label: "Settings", icon: Settings, action: () => navigate("/settings") },
  ];

  const actions: Item[] = [
    {
      label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      icon: theme === "dark" ? Sun : Moon,
      action: toggle,
      keywords: "theme toggle appearance",
    },
    {
      label: "Sign out",
      icon: LogOut,
      action: () => void supabase.auth.signOut(),
      keywords: "logout",
    },
  ];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      overlayClassName="fixed inset-0 z-50 bg-black/40"
      contentClassName="fixed top-[18%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl shadow-black/30"
    >
      <Command.Input
        placeholder="Type a command…"
        className="h-11 w-full border-b border-border bg-transparent px-4 text-sm text-ink placeholder:text-faint focus:outline-none"
      />
      <Command.List className="max-h-72 overflow-y-auto p-1.5">
        <Command.Empty className="px-2.5 py-6 text-center text-xs text-faint">
          No results.
        </Command.Empty>
        <Command.Group
          heading="Go to"
          className="text-2xs font-medium tracking-wide text-faint uppercase [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5"
        >
          {nav.map((item) => (
            <PaletteItem key={item.label} item={item} onRun={run} />
          ))}
        </Command.Group>
        <Command.Group
          heading="Actions"
          className="text-2xs font-medium tracking-wide text-faint uppercase [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5"
        >
          {actions.map((item) => (
            <PaletteItem key={item.label} item={item} onRun={run} />
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}

function PaletteItem({ item, onRun }: { item: Item; onRun: (a: () => void) => void }) {
  const Icon = item.icon;
  return (
    <Command.Item
      keywords={item.keywords ? [item.keywords] : undefined}
      onSelect={() => onRun(item.action)}
      className="flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-normal text-ink normal-case tracking-normal data-[selected=true]:bg-surface-hover"
    >
      <Icon className="size-4 text-soft" />
      {item.label}
    </Command.Item>
  );
}
