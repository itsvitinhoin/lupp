import { Switch } from "@/components/ui/switch";

export function AdvancedSwitch({
  checked,
  description,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
        <span className="text-sm font-semibold text-slate-600">{label}</span>
      </div>
      <p className="mt-2 rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium leading-tight text-slate-500">
        {description}
      </p>
    </div>
  );
}
