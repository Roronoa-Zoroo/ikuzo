import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { type Theme, useTheme } from "@/components/theme-provider";

const THEME_OPTIONS = [
  { icon: SunIcon, label: "Light", value: "light" },
  { icon: MoonIcon, label: "Dark", value: "dark" },
  { icon: MonitorIcon, label: "System", value: "system" },
] as const satisfies ReadonlyArray<{
  icon: typeof SunIcon;
  label: string;
  value: Theme;
}>;

export function ModeToggle() {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button className="relative" size="icon-sm" variant="outline" />}>
        <SunIcon className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <MoonIcon className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {THEME_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => {
                setTheme(option.value);
              }}
            >
              <option.icon />
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
