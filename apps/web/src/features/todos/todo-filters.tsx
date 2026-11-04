import { InputGroup, InputGroupAddon, InputGroupInput } from "@repo/ui/components/input-group";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { SearchIcon } from "lucide-react";

const STATUS_LABELS = {
  active: "Active",
  all: "All",
  completed: "Completed",
} as const;

export type TodoStatusFilter = keyof typeof STATUS_LABELS;

export function TodoFilters({
  onSearch,
  onStatusChange,
  q,
  status,
}: {
  onSearch: (q: string) => void;
  onStatusChange: (status: TodoStatusFilter) => void;
  q: string;
  status: TodoStatusFilter;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <ToggleGroup
        onValueChange={([next]) => {
          if (next === "active" || next === "all" || next === "completed") {
            onStatusChange(next);
          }
        }}
        size="sm"
        spacing={0}
        value={[status]}
        variant="outline"
      >
        {(Object.keys(STATUS_LABELS) as TodoStatusFilter[]).map((item) => (
          <ToggleGroupItem aria-label={STATUS_LABELS[item]} key={item} value={item}>
            {STATUS_LABELS[item]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <form
        className="w-full sm:max-w-56"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          onSearch(String(formData.get("q") ?? "").trim());
        }}
      >
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput aria-label="Search todos" defaultValue={q} name="q" placeholder="Search" type="search" />
        </InputGroup>
      </form>
    </div>
  );
}
