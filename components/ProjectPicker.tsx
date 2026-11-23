"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/Icon";

interface Props {
  cwd: string | null;
  /** Folders used before, most recent first */
  recent: string[];
  onPick: (dir: string) => void;
  onBrowse: () => void;
  onNone: () => void;
}

const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

/** opencode-style project row under the composer: "D Desktop ⌄" on the left, the full path on the right. */
export function ProjectPicker({ cwd, recent, onPick, onBrowse, onNone }: Props) {
  const name = cwd ? base(cwd) : "No project";
  return (
    <div className="flex items-center justify-between px-3 pt-2 text-[13px]">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-7 items-center gap-1.5 rounded-[6px] px-1.5 outline-none hover:bg-accent data-[popup-open]:bg-accent">
          <span className="flex size-4 items-center justify-center rounded-[4px] bg-layer-4 text-[10px] font-semibold uppercase">{name[0]}</span>
          <span className="font-medium">{name}</span>
          <Icon name="chevron-down" className="text-faint" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {recent.length > 0 && (
            <DropdownMenuGroup>
              <DropdownMenuLabel>Recent projects</DropdownMenuLabel>
              {recent.map((r) => (
                <DropdownMenuItem key={r} onClick={() => onPick(r)}>
                  <span className="flex size-4 items-center justify-center rounded-[4px] bg-layer-4 text-[10px] font-semibold uppercase">{base(r)[0]}</span>
                  <span className="min-w-0 flex-1 truncate">{base(r)}</span>
                  <span className="max-w-32 truncate text-xs text-faint">{r}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}
          {recent.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={onBrowse}>
            <Icon name="folder-add-left" /> Open folder…
          </DropdownMenuItem>
          {cwd && (
            <DropdownMenuItem onClick={onNone}>
              <Icon name="close" /> No project
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {cwd && <span className="truncate pl-4 text-faint">{cwd}</span>}
    </div>
  );
}
