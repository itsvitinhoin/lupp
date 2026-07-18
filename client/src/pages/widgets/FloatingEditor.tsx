import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CodeBlock } from "@/components/shared/CodeBlock";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ChevronDown,
  CloudUpload,
  Code2,
  ExternalLink,
  LayoutGrid,
  MessageCircle,
  Monitor,
  Move,
  Paintbrush,
  Palette,
  PlayCircle,
  Save,
  Settings2,
  ShoppingBag,
  Smartphone,
} from "lucide-react";
import { AdvancedSwitch } from "./AdvancedSwitch";
import type {
  SetWidgetSettingsField,
  WidgetSettingsForm,
} from "./useWidgetSettingsForm";

const sizeOptions = [
  { label: "Pequena", value: "60" },
  { label: "Média", value: "74" },
  { label: "Grande", value: "92" },
];

const modelOptions = [
  { label: "Retangular", value: "rectangular" },
  { label: "Quadrado", value: "square" },
  { label: "Circular", value: "circular" },
  { label: "Texto circular", value: "circular_text" },
  { label: "Destaque", value: "highlight" },
  { label: "Insta", value: "insta" },
  { label: "Insta neon", value: "insta_neon" },
];

function modelShape(model: string) {
  if (model === "rectangular") return "rounded-[20px] aspect-[1.45/1]";
  if (model === "square") return "rounded-[22px] aspect-square";
  return "rounded-full aspect-square";
}

export function FloatingEditor(props: {
  canPersist: boolean;
  embedCode: string;
  form: WidgetSettingsForm;
  isInstallingNuvemshop: boolean;
  isSavingSettings: boolean;
  storeSlug?: string;
  onBack: () => void;
  onCopyCode: () => void;
  onInstallNuvemshop: () => void;
  onSave: () => void;
  setField: SetWidgetSettingsField;
}) {
  const { form, setField } = props;
  const currentSizeLabel =
    sizeOptions.find((option) => option.value === form.launcherSize)?.label ??
    "Média";

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex gap-4">
          <Button
            onClick={props.onBack}
            variant="ghost"
            size="icon"
            className="mt-1 h-10 w-10 rounded-xl text-slate-700 hover:bg-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold leading-tight tracking-tight text-slate-950">
              Miniatura flutuante
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Personalize sua miniatura flutuante para que ela se destaque no
              site e ofereça uma experiência única aos seus clientes.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 flex justify-end">
        <div className="flex flex-wrap justify-end gap-3">
          {props.storeSlug && (
            <Button
              variant="outline"
              asChild
              className="h-11 rounded-xl bg-white px-4 text-sm font-semibold"
            >
              <a
                href={`/test-store/${props.storeSlug}?widget=floating_launcher`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="mr-2 h-5 w-5" />
                Prévia real
              </a>
            </Button>
          )}
          <Button
            onClick={props.onSave}
            disabled={props.isSavingSettings || !props.canPersist}
            className="h-11 rounded-xl px-8 text-sm font-bold"
          >
            <Save className="mr-2 h-5 w-5" />
            {props.isSavingSettings ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <div className="grid gap-7 xl:grid-cols-[minmax(360px,560px)_1fr]">
        <aside className="max-h-[calc(100vh-250px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 p-6">
            <Paintbrush className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-slate-950">Personalizar</h3>
          </div>
          <div className="max-h-[calc(100vh-350px)] space-y-7 overflow-y-auto p-6">
            <section>
              <div className="mb-5 flex items-center gap-3">
                <Palette className="h-5 w-5 text-slate-700" />
                <h4 className="text-base font-bold text-slate-950">Cores</h4>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <ColorField
                  label="Cor do fundo"
                  value={form.launcherAccent}
                  onChange={(value) => setField("launcherAccent", value)}
                />
                <ColorField
                  label="Cor do texto"
                  value={form.launcherTextColor}
                  onChange={(value) => setField("launcherTextColor", value)}
                />
              </div>
              <div className="mt-5 grid gap-3">
                <Label className="text-sm font-semibold text-slate-500">
                  Texto da chamada
                </Label>
                <Input
                  value={form.launcherLabel}
                  onChange={(event) =>
                    setField("launcherLabel", event.target.value)
                  }
                  className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950"
                />
              </div>
            </section>

            <SectionDivider />

            <section>
              <h4 className="mb-4 text-base font-bold text-slate-950">
                Tamanho
              </h4>
              <div className="grid grid-cols-3 gap-3">
                {sizeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setField("launcherSize", option.value)}
                    className="flex items-center gap-2 rounded-xl px-1 py-2 text-left text-sm font-semibold text-slate-500"
                  >
                    <span
                      className={cn(
                        "h-6 w-6 rounded-full border-4 border-slate-200 bg-white",
                        form.launcherSize === option.value &&
                          "border-primary bg-primary",
                      )}
                    />
                    {option.label}
                  </button>
                ))}
              </div>
            </section>

            <SectionDivider />

            <section>
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Move className="h-7 w-7" />
                  <h4 className="text-base font-bold text-slate-950">
                    Posição da miniatura
                  </h4>
                </div>
                <div className="flex rounded-xl bg-[#f2f4f5] p-1">
                  <button
                    type="button"
                    className="rounded-lg bg-primary/10 p-2 text-primary"
                  >
                    <Monitor className="h-5 w-5" />
                  </button>
                  <button type="button" className="p-2 text-slate-400">
                    <Smartphone className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <Select
                value={form.launcherPosition}
                onValueChange={(value) => setField("launcherPosition", value)}
              >
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom-left">Inferior esquerda</SelectItem>
                  <SelectItem value="bottom-right">Inferior direita</SelectItem>
                  <SelectItem value="top-left">Superior esquerda</SelectItem>
                  <SelectItem value="top-right">Superior direita</SelectItem>
                </SelectContent>
              </Select>
              <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-center text-sm font-medium leading-tight text-slate-500">
                Você pode mover a miniatura para a posição desejada e salvar a
                regra para a loja.
              </div>
            </section>

            <SectionDivider />

            <section>
              <div className="mb-5 flex items-center gap-3">
                <LayoutGrid className="h-5 w-5 text-slate-700" />
                <h4 className="text-base font-bold text-slate-950">Modelos</h4>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {modelOptions.map((model) => (
                  <button
                    key={model.value}
                    type="button"
                    onClick={() => setField("launcherModel", model.value)}
                    className={cn(
                      "min-h-36 rounded-2xl border border-slate-200 bg-white p-4 text-center transition hover:border-primary/50",
                      form.launcherModel === model.value &&
                        "border-primary ring-1 ring-primary",
                    )}
                  >
                    <div className="mx-auto flex h-24 w-24 items-center justify-center">
                      <div
                        className={cn(
                          "flex w-20 items-center justify-center bg-[#f2f2f2] text-[#9a9a9a]",
                          modelShape(model.value),
                          model.value.includes("insta") &&
                            "bg-[linear-gradient(135deg,#ffb13b,#f33f86,#7b4dff)] p-[3px]",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-full w-full items-center justify-center bg-[#f2f2f2]",
                            modelShape(model.value),
                          )}
                        >
                          <PlayCircle className="h-5 w-5" />
                        </div>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-slate-500">
                      {model.label}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <SectionDivider />

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-base font-bold text-slate-950">
                  Configurações avançadas
                </h4>
                <ChevronDown className="h-6 w-6" />
              </div>
              <div className="space-y-4">
                <AdvancedSwitch
                  checked={form.fixedVideo}
                  description="O vídeo permanece na posição configurada e não se move ao rolar a página."
                  label="Vídeo fixo (não rola com a página)"
                  onChange={(value) => setField("fixedVideo", value)}
                />
                <AdvancedSwitch
                  checked={form.allowClose}
                  description="Adiciona opção de esconder vídeo na página."
                  label="Permitir fechar o vídeo"
                  onChange={(value) => setField("allowClose", value)}
                />
                <AdvancedSwitch
                  checked={form.randomizeThumbnail}
                  description="Cada atualização de página alterna o vídeo da miniatura."
                  label="Randomizar miniatura"
                  onChange={(value) => setField("randomizeThumbnail", value)}
                />
              </div>
            </section>

            <SectionDivider />

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <Settings2 className="h-5 w-5 text-slate-700" />
                <h4 className="text-base font-bold text-slate-950">
                  Experiência na loja
                </h4>
              </div>
              <AdvancedSwitch
                checked={form.homeExperienceEnabled}
                description="Mostra a experiência principal também na Home. Nas páginas de produto, a miniatura prioriza o vídeo vinculado e continua no feed da marca."
                label="Ativar experiência na Home"
                onChange={(value) => setField("homeExperienceEnabled", value)}
              />
              <div className="space-y-2">
                <Label className="font-semibold text-slate-500">
                  Ordenação da Home
                </Label>
                <Select
                  value={form.homeOrdering}
                  onValueChange={(value) => setField("homeOrdering", value)}
                >
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="automatic">Automática</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-semibold text-slate-500">
                  URLs excluídas
                </Label>
                <Textarea
                  value={form.excludePaths}
                  onChange={(event) =>
                    setField("excludePaths", event.target.value)
                  }
                  rows={3}
                  placeholder={"/checkout\n/carrinho\n/cart"}
                  className="rounded-xl border-slate-200 bg-white text-sm text-slate-950"
                />
              </div>
            </section>

            <SectionDivider />

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <ShoppingBag className="h-5 w-5 text-slate-700" />
                <h4 className="text-base font-bold text-slate-950">
                  Condições comerciais
                </h4>
              </div>
              <AdvancedSwitch
                checked={form.customInstallmentsEnabled}
                description="Mostra uma condição de parcelamento no card quando a integração não enviar essa informação automaticamente."
                label="Usar parcelamento personalizado"
                onChange={(value) =>
                  setField("customInstallmentsEnabled", value)
                }
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-semibold text-slate-500">
                    Parcelas
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={form.customInstallmentsCount}
                    onChange={(event) =>
                      setField("customInstallmentsCount", event.target.value)
                    }
                    className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold text-slate-500">
                    Desconto Pix (%)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={form.customPixDiscountPercent}
                    onChange={(event) =>
                      setField("customPixDiscountPercent", event.target.value)
                    }
                    className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950"
                  />
                </div>
              </div>
              <AdvancedSwitch
                checked={form.customInstallmentsInterestFree}
                description="Adiciona a expressão sem juros ao parcelamento configurado."
                label="Parcelamento sem juros"
                onChange={(value) =>
                  setField("customInstallmentsInterestFree", value)
                }
              />
              <AdvancedSwitch
                checked={form.customPixDiscountEnabled}
                description="Exibe uma linha de desconto no Pix quando o percentual estiver preenchido."
                label="Exibir desconto no Pix"
                onChange={(value) => setField("customPixDiscountEnabled", value)}
              />
              <div className="space-y-2">
                <Label className="font-semibold text-slate-500">
                  Texto extra opcional
                </Label>
                <Input
                  value={form.customPaymentNote}
                  onChange={(event) =>
                    setField("customPaymentNote", event.target.value)
                  }
                  placeholder="Cupom de primeira compra disponível na loja"
                  className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950"
                />
              </div>
            </section>

            <SectionDivider />

            <section className="space-y-4 pb-6">
              <div className="flex items-center gap-3">
                <Code2 className="h-5 w-5 text-slate-700" />
                <h4 className="text-base font-bold text-slate-950">
                  Instalação
                </h4>
              </div>
              <Button
                variant="outline"
                className="h-11 w-full rounded-xl bg-white text-sm font-bold text-primary"
                onClick={props.onInstallNuvemshop}
                disabled={props.isInstallingNuvemshop || !props.canPersist}
              >
                <CloudUpload className="mr-2 h-5 w-5" />
                {props.isInstallingNuvemshop
                  ? "Instalando..."
                  : "Instalar automaticamente na Nuvemshop"}
              </Button>
              <Button
                className="h-11 w-full rounded-xl text-sm font-bold"
                onClick={props.onCopyCode}
              >
                Copiar código manual
              </Button>
              <CodeBlock code={props.embedCode} />
            </section>
          </div>
        </aside>

        <PreviewPanel
          accent={form.launcherAccent}
          background={form.launcherBackground}
          font={form.launcherFont}
          label={form.launcherLabel}
          model={form.launcherModel}
          position={form.launcherPosition}
          size={form.launcherSize}
          sizeLabel={currentSizeLabel}
          textColor={form.launcherTextColor}
        />
      </div>
    </>
  );
}

function SectionDivider() {
  return <div className="-mx-6 border-t border-slate-100" />;
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <Input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-16 w-16 shrink-0 rounded-xl border-0 p-1"
      />
      <span className="grid flex-1 gap-1">
        <span className="block text-sm font-semibold text-slate-500">
          {label}
        </span>
        <Input
          aria-label={`${label} hexadecimal`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 rounded-lg border-slate-200 bg-white font-mono text-sm font-semibold text-slate-950"
        />
      </span>
    </label>
  );
}

function PreviewPanel({
  accent,
  background,
  font,
  label,
  model,
  position,
  size,
  sizeLabel,
  textColor,
}: {
  accent: string;
  background: string;
  font: string;
  label: string;
  model: string;
  position: string;
  size: string;
  sizeLabel: string;
  textColor: string;
}) {
  const bubblePx = Math.max(60, Number(size) || 74);
  const isRight = position.includes("right");
  const isTop = position.includes("top");
  const isRectangular = model === "rectangular";
  const isSquare = model === "square";
  const previewShape = isRectangular
    ? "rounded-[22px]"
    : isSquare
      ? "rounded-[22px]"
      : "rounded-full";
  const launcherStyle: React.CSSProperties = {
    [isRight ? "right" : "left"]: "7%",
    [isTop ? "top" : "bottom"]: isTop ? "20%" : "45%",
    fontFamily: font,
  };

  return (
    <section className="min-h-[720px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex h-16 items-center justify-between border-b border-slate-100 px-6">
        <div className="flex gap-3">
          <span className="h-3.5 w-3.5 rounded-full bg-[#d7514e]" />
          <span className="h-3.5 w-3.5 rounded-full bg-[#efcf4f]" />
          <span className="h-3.5 w-3.5 rounded-full bg-[#72db92]" />
        </div>
        <div className="flex items-center gap-3 text-base font-bold text-slate-950">
          Pré-visualização
          <Monitor className="h-5 w-5" />
        </div>
      </div>
      <div className="relative min-h-[640px] overflow-hidden bg-[#fbfbfb] p-8">
        <SkeletonStorefront />
        <div
          className="absolute z-10 flex items-center drop-shadow-[0_14px_22px_rgba(0,0,0,.22)]"
          style={launcherStyle}
        >
          <div
            className={cn(
              "relative shrink-0 overflow-hidden border-[4px] border-[#1e1e1e] bg-[#d7d2ce]",
              previewShape,
              model.includes("insta") &&
                "border-transparent bg-[linear-gradient(135deg,#ffb13b,#f33f86,#7b4dff)] p-[4px]",
            )}
            style={{
              width: isRectangular ? bubblePx * 1.35 : bubblePx,
              height: isRectangular ? bubblePx * 0.78 : bubblePx,
              boxShadow: `0 0 0 5px ${accent}`,
            }}
          >
            <div
              className={cn(
                "h-full w-full bg-[linear-gradient(135deg,#b9b1aa,#5d514d)] bg-cover bg-center",
                previewShape,
              )}
              style={{
                backgroundImage:
                  "linear-gradient(135deg, rgba(255,255,255,.12), rgba(0,0,0,.2)), radial-gradient(circle at 55% 34%, #d8c5b7 0 16%, transparent 17%), linear-gradient(120deg,#9e8d84,#2d2524)",
              }}
            />
          </div>
          <div
            className="-ml-1 min-w-[210px] rounded-r-lg px-6 py-3 text-sm font-bold uppercase tracking-normal"
            style={{ backgroundColor: accent, color: textColor }}
          >
            {label || "VIDEO DO PRODUTO"}
          </div>
        </div>
        <div className="absolute bottom-6 left-8 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm">
          {sizeLabel} ·{" "}
          {modelOptions.find((option) => option.value === model)?.label ??
            "Circular"}
        </div>
        <div className="absolute bottom-8 right-8 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#4cc231] text-white shadow-[0_18px_36px_rgba(36,135,60,.3)]">
          <MessageCircle className="h-9 w-9" />
        </div>
      </div>
    </section>
  );
}

function SkeletonStorefront() {
  return (
    <div className="pointer-events-none select-none">
      <div className="mb-7 flex items-start gap-8">
        <div className="h-[104px] w-[104px] rounded-full bg-[#f0f0f0]" />
        <div className="flex-1 pt-4">
          <div className="mb-9 h-10 w-1/2 rounded-lg bg-[#f0f0f0]" />
          <div className="h-10 w-28 rounded-lg bg-[#f0f0f0]" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-8">
        <div className="h-10 rounded-lg bg-[#f0f0f0]" />
        <div className="h-10 rounded-lg bg-[#f0f0f0]" />
        <div className="h-10 rounded-lg bg-[#f0f0f0]" />
        <div className="h-10 rounded-lg bg-[#f0f0f0]" />
      </div>
      <div className="mt-5 grid grid-cols-[1fr_180px] gap-8">
        <div className="space-y-5">
          <div className="h-10 rounded-lg bg-[#f0f0f0]" />
          <div className="h-10 w-3/4 rounded-lg bg-[#f0f0f0]" />
          <div className="h-10 rounded-lg bg-[#f0f0f0]" />
          <div className="mt-8 grid grid-cols-5 gap-8">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="h-64 rounded-lg bg-[#f2f2f2]">
                <div className="mx-auto mt-14 h-[88px] w-[88px] rounded-full bg-[#f7f7f7]" />
                <div className="mx-auto mt-10 h-8 w-1/2 rounded bg-[#f7f7f7]" />
              </div>
            ))}
          </div>
        </div>
        <div className="h-40 rounded-lg bg-[#f0f0f0]" />
      </div>
    </div>
  );
}
