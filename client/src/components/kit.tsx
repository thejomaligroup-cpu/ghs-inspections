import { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <img
      src="brand/logo-mark.png"
      alt="Green Home Solutions"
      className={`${className} object-contain`}
      draggable={false}
    />
  );
}

/** Stacked logo with wordmark and tagline — sign-in card and report letterhead. */
export function LogoFull({ className = "h-16" }: { className?: string }) {
  return (
    <img
      src="brand/logo-full.png"
      alt="Green Home Solutions — We Make Air Better!"
      className={`${className} w-auto object-contain`}
      draggable={false}
    />
  );
}

export function FieldRow({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 | 4 }) {
  const map = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };
  return <div className={`grid grid-cols-1 gap-4 ${map[cols]}`}>{children}</div>;
}

type BaseProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit?: () => void;
  placeholder?: string;
  hint?: string;
  testId: string;
  type?: string;
  className?: string;
};

export function TextField({
  label,
  value,
  onChange,
  onCommit,
  placeholder,
  hint,
  testId,
  type = "text",
  className,
}: BaseProps) {
  return (
    <div className={className}>
      <Label htmlFor={testId} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Input
        id={testId}
        data-testid={`input-${testId}`}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        className="mt-1.5"
      />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AreaField({
  label,
  value,
  onChange,
  onCommit,
  placeholder,
  testId,
  rows = 3,
}: BaseProps & { rows?: number }) {
  return (
    <div>
      <Label htmlFor={testId} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Textarea
        id={testId}
        data-testid={`input-${testId}`}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        className="mt-1.5"
      />
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  testId: string;
}) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Select value={value || options[0]} onValueChange={onChange}>
        <SelectTrigger className="mt-1.5" data-testid={`select-${testId}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const toneClasses = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  bad: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

export function Tone({
  tone,
  children,
  testId,
}: {
  tone: keyof typeof toneClasses;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <div className="mb-3 text-muted-foreground">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
