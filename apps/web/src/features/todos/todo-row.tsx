import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@repo/ui/components/item";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/tooltip";
import { NotebookIcon, PaperclipIcon, PencilIcon, Trash2Icon } from "lucide-react";

import type { TodoAttachmentItem } from "@/features/todos/todo-attachments";

export interface TodoItem {
  _id: string;
  attachments?: TodoAttachmentItem[];
  completed: boolean;
  dueAt?: string;
  listId: string;
  notes?: string;
  priority: "high" | "low" | "medium";
  title: string;
}

const PRIORITY_VARIANT = {
  high: "destructive",
  low: "outline",
  medium: "secondary",
} as const;

function formatDueDate(due: string) {
  return new Date(`${due}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function TodoRow({
  isDeleting,
  onDelete,
  onEdit,
  onToggle,
  todo,
}: {
  isDeleting: boolean;
  onDelete: (_id: string) => void;
  onEdit: (todo: TodoItem) => void;
  onToggle: (_id: string) => void;
  todo: TodoItem;
}) {
  const due = todo.dueAt;
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = due !== undefined && !todo.completed && due < today;

  function handleToggle() {
    onToggle(todo._id);
  }

  function handleDelete() {
    onDelete(todo._id);
  }

  function handleEdit() {
    onEdit(todo);
  }

  return (
    <Item size="sm" variant={todo.completed ? "muted" : "outline"}>
      <ItemMedia>
        <Checkbox
          aria-label={`Mark ${todo.title} as ${todo.completed ? "incomplete" : "complete"}`}
          checked={todo.completed}
          onCheckedChange={handleToggle}
        />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className={todo.completed ? "text-muted-foreground line-through" : undefined}>
          {todo.title}
        </ItemTitle>
        <ItemDescription>
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={PRIORITY_VARIANT[todo.priority]}>{todo.priority}</Badge>
            {due ? (
              <Badge variant={isOverdue ? "destructive" : "outline"}>
                {isOverdue ? "Overdue" : "Due"} {formatDueDate(due)}
              </Badge>
            ) : null}
            {todo.notes ? (
              <Badge variant="ghost">
                <NotebookIcon data-icon="inline-start" />
                Notes
              </Badge>
            ) : null}
            {(todo.attachments?.length ?? 0) > 0 ? (
              <Badge variant="ghost">
                <PaperclipIcon data-icon="inline-start" />
                {todo.attachments?.length}
              </Badge>
            ) : null}
          </span>
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Tooltip>
          <TooltipTrigger
            onClick={handleEdit}
            render={<Button aria-label={`Edit ${todo.title}`} size="icon-sm" variant="ghost" />}
          >
            <PencilIcon />
          </TooltipTrigger>
          <TooltipContent>Edit</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            onClick={handleDelete}
            render={<Button aria-label={`Delete ${todo.title}`} disabled={isDeleting} size="icon-sm" variant="ghost" />}
          >
            <Trash2Icon />
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </ItemActions>
    </Item>
  );
}
