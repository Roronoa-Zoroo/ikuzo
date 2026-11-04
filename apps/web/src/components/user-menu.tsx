import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { LogOutIcon } from "lucide-react";

const NAME_PARTS = /\s+/;

function initials(name: string) {
  const parts = name.trim().split(NAME_PARTS).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";

  return `${first}${last}`.toUpperCase();
}

export function UserMenu({
  email,
  image,
  isSigningOut,
  name,
  onSignOut,
}: {
  email: string;
  image?: string | null;
  isSigningOut: boolean;
  name: string;
  onSignOut: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant="ghost" />}>
        <Avatar size="sm">
          {image ? <AvatarImage alt={name} src={image} /> : null}
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-32 truncate sm:inline">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground">{name}</span>
              <span className="truncate font-normal">{email}</span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled={isSigningOut} onClick={onSignOut} variant="destructive">
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
