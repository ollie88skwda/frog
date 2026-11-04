import {
  Barbell,
  BookOpen,
  CalendarDots,
  ClockCounterClockwise,
  Flask,
  Gear,
  House,
  Lightbulb,
  Moon,
  Notebook,
  type Play,
  Ruler,
  Scroll,
  SignOut,
  Sun,
  User,
} from "@phosphor-icons/react";
import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useSignOut } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

type Item = {
  label: string;
  icon: typeof Play;
  action: () => void;
  keywords?: string;
  shortcut?: string;
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const signOut = useSignOut();

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
    { label: "Home", icon: House, action: () => navigate("/") },
    { label: "Training", icon: Barbell, action: () => navigate("/train") },
    {
      label: "Routines",
      icon: Notebook,
      action: () => navigate("/routines"),
      keywords: "plans folders workout",
    },
    { label: "Profile", icon: User, action: () => navigate("/profile") },
    {
      label: "Library",
      icon: BookOpen,
      action: () => navigate("/library"),
      shortcut: "L",
    },
    {
      label: "History",
      icon: ClockCounterClockwise,
      action: () => navigate("/history"),
      shortcut: "H",
    },
    {
      label: "Findings",
      icon: Flask,
      action: () => navigate("/findings"),
      shortcut: "F",
    },
    {
      label: "Calendar",
      icon: CalendarDots,
      action: () => navigate("/calendar"),
      keywords: "streak consistency month year",
    },
    {
      label: "Measures",
      icon: Ruler,
      action: () => navigate("/measures"),
      keywords: "body weight measurements photos",
    },
    { label: "Settings", icon: Gear, action: () => navigate("/settings") },
    {
      label: "Training tips",
      icon: Lightbulb,
      action: () => navigate("/tips"),
      keywords: "lessons education info help",
    },
    {
      label: "Changelog",
      icon: Scroll,
      action: () => navigate("/changelog"),
      keywords: "whats new updates decisions dev log",
    },
  ];

  const actions: Item[] = [
    {
      label:
        theme === "night" ? "Switch to light theme" : "Switch to dark theme",
      icon: theme === "night" ? Sun : Moon,
      action: toggle,
      keywords: "theme toggle appearance",
    },
    {
      label: "Sign out",
      icon: SignOut,
      action: () => void signOut(),
      keywords: "logout",
    },
  ];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      overlayClassName="fixed inset-0 z-50 bg-scrim"
      contentClassName="float-in fixed top-[18%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-md bg-raised shadow-lg"
    >
      <Command.Input
        placeholder="Type a command…"
        className="h-11 w-full bg-transparent px-4 text-sm text-ink placeholder:text-faint"
      />
      <Command.List className="max-h-72 overflow-y-auto p-1">
        <Command.Empty className="px-2 py-6 text-center text-xs text-faint">
          No results.
        </Command.Empty>
        <Command.Group
          heading="Go to"
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-faint [&_[cmdk-group-heading]]:uppercase"
        >
          {nav.map((item) => (
            <PaletteItem key={item.label} item={item} onRun={run} />
          ))}
        </Command.Group>
        <Command.Group
          heading="Actions"
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-faint [&_[cmdk-group-heading]]:uppercase"
        >
          {actions.map((item) => (
            <PaletteItem key={item.label} item={item} onRun={run} />
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}

function PaletteItem({
  item,
  onRun,
}: {
  item: Item;
  onRun: (a: () => void) => void;
}) {
  const Icon = item.icon;
  return (
    <Command.Item
      keywords={item.keywords ? [item.keywords] : undefined}
      onSelect={() => onRun(item.action)}
      className="flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-sm text-ink data-[selected=true]:bg-surface-hover"
    >
      <Icon className="size-4 shrink-0 text-soft" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.shortcut && <kbd className="keycap">{item.shortcut}</kbd>}
    </Command.Item>
  );
}
