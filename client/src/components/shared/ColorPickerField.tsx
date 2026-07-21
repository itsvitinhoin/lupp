import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Labeled color field: native color picker swatch + editable hex input.
 * The picker needs a valid #rrggbb value, so anything else (mid-typing,
 * legacy data) falls back to black in the swatch only.
 */
export function ColorPickerField({
  id,
  label,
  onChange,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2">
        <input
          aria-label={`${label} (seletor de cor)`}
          type="color"
          value={HEX_COLOR.test(value) ? value : "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent"
        />
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="font-mono text-sm uppercase"
        />
      </div>
    </div>
  );
}
