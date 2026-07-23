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
import { ColorPickerField } from "@/components/shared/ColorPickerField";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ChevronDown,
  CloudUpload,
  Code2,
  ExternalLink,
  LayoutGrid,
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
  const realPreviewSrc = useDebouncedRealPreviewSrc(props.storeSlug, form);
  const [previewViewport, setPreviewViewport] = React.useState<
    "desktop" | "mobile"
  >("desktop");

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex gap-4">
          <Button
            onClick={props.onBack}
            variant="ghost"
            size="icon"
            className="mt-1 h-10 w-10 rounded-xl text-foreground/80 hover:bg-card"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
              Miniatura flutuante
            </h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Personalize sua miniatura flutuante para que ela se destaque no
              site e ofereça uma experiência única aos seus clientes.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 xl:justify-end">
          {props.storeSlug && (
            <Button
              variant="outline"
              asChild
              className="h-11 rounded-xl bg-card px-4 text-sm font-semibold"
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
        <aside className="max-h-[calc(100vh-250px)] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b border-border p-6">
            <Paintbrush className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">Personalizar</h3>
          </div>
          <div className="max-h-[calc(100vh-350px)] space-y-7 overflow-y-auto p-6">
            <section>
              <div className="mb-5 flex items-center gap-3">
                <Palette className="h-5 w-5 text-foreground/80" />
                <h4 className="text-base font-bold text-foreground">Cores</h4>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <ColorField
                  label="Cor de destaque"
                  value={form.launcherAccent}
                  onChange={(value) => setField("launcherAccent", value)}
                />
                <ColorField
                  label="Cor do texto"
                  value={form.launcherTextColor}
                  onChange={(value) => setField("launcherTextColor", value)}
                />
                <ColorField
                  label="Cor do fundo"
                  value={form.launcherBackground}
                  onChange={(value) => setField("launcherBackground", value)}
                />
              </div>
              <div className="mt-5 grid gap-3">
                <Label className="text-sm font-semibold text-muted-foreground">
                  Texto da chamada
                </Label>
                <Input
                  value={form.launcherLabel}
                  onChange={(event) =>
                    setField("launcherLabel", event.target.value)
                  }
                  className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground"
                />
              </div>
            </section>

            <SectionDivider />

            <section>
              <h4 className="mb-4 text-base font-bold text-foreground">
                Tamanho
              </h4>
              <div className="grid grid-cols-3 gap-3">
                {sizeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setField("launcherSize", option.value)}
                    className="flex items-center gap-2 rounded-xl px-1 py-2 text-left text-sm font-semibold text-muted-foreground"
                  >
                    <span
                      className={cn(
                        "h-6 w-6 rounded-full border-4 border-border bg-card",
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
                  <h4 className="text-base font-bold text-foreground">
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
                  <button type="button" className="p-2 text-muted-foreground/70">
                    <Smartphone className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <Select
                value={form.launcherPosition}
                onValueChange={(value) => setField("launcherPosition", value)}
              >
                <SelectTrigger className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom-left">Inferior esquerda</SelectItem>
                  <SelectItem value="bottom-right">Inferior direita</SelectItem>
                  <SelectItem value="top-left">Superior esquerda</SelectItem>
                  <SelectItem value="top-right">Superior direita</SelectItem>
                </SelectContent>
              </Select>
              <div className="mt-4 grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-muted-foreground">
                    Margem horizontal (px)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={form.launcherOffsetX}
                    onChange={(event) =>
                      setField("launcherOffsetX", event.target.value)
                    }
                    className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-muted-foreground">
                    Margem vertical (px)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={form.launcherOffsetY}
                    onChange={(event) =>
                      setField("launcherOffsetY", event.target.value)
                    }
                    className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground"
                  />
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-muted/50 px-4 py-3 text-center text-sm font-medium leading-tight text-muted-foreground">
                As margens afastam a miniatura do canto escolhido — útil para
                não sobrepor botões de WhatsApp ou cookies da loja.
              </div>
            </section>

            <SectionDivider />

            <section>
              <div className="mb-5 flex items-center gap-3">
                <LayoutGrid className="h-5 w-5 text-foreground/80" />
                <h4 className="text-base font-bold text-foreground">Modelos</h4>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {modelOptions.map((model) => (
                  <button
                    key={model.value}
                    type="button"
                    onClick={() => setField("launcherModel", model.value)}
                    className={cn(
                      "min-h-36 rounded-2xl border border-border bg-card p-4 text-center transition hover:border-primary/50",
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
                    <span className="text-sm font-semibold text-muted-foreground">
                      {model.label}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <SectionDivider />

            <section>
              <div className="mb-5 flex items-center gap-3">
                <LayoutGrid className="h-5 w-5 text-foreground/80" />
                <h4 className="text-base font-bold text-foreground">
                  Borda e sombra
                </h4>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-muted-foreground">
                  Raio da borda (px) — em branco usa o padrão do modelo
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={60}
                  placeholder="Automático"
                  value={form.launcherBorderRadius}
                  onChange={(event) =>
                    setField("launcherBorderRadius", event.target.value)
                  }
                  className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground"
                />
              </div>
              <div className="mt-4">
                <AdvancedSwitch
                  checked={form.launcherShadowEnabled}
                  description="Sombra suave projetada pela miniatura flutuante."
                  label="Sombra na miniatura"
                  onChange={(value) => setField("launcherShadowEnabled", value)}
                />
              </div>
              {form.launcherShadowEnabled ? (
                <div className="mt-4 space-y-4">
                  <ColorPickerField
                    id="launcher-shadow-color"
                    label="Cor da sombra"
                    value={form.launcherShadowColor}
                    onChange={(value) => setField("launcherShadowColor", value)}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-muted-foreground">
                        Opacidade (%)
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={form.launcherShadowOpacity}
                        onChange={(event) =>
                          setField("launcherShadowOpacity", event.target.value)
                        }
                        className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-muted-foreground">
                        Desfoque (px)
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={80}
                        value={form.launcherShadowBlur}
                        onChange={(event) =>
                          setField("launcherShadowBlur", event.target.value)
                        }
                        className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            <SectionDivider />

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-base font-bold text-foreground">
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
                <Settings2 className="h-5 w-5 text-foreground/80" />
                <h4 className="text-base font-bold text-foreground">
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
                <Label className="font-semibold text-muted-foreground">
                  Ordenação da Home
                </Label>
                <Select
                  value={form.homeOrdering}
                  onValueChange={(value) => setField("homeOrdering", value)}
                >
                  <SelectTrigger className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="automatic">Automática</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <AdvancedSwitch
                checked={form.hideWithoutVideos}
                description="A miniatura só aparece em páginas que têm vídeo para mostrar."
                label="Ocultar quando não houver vídeos"
                onChange={(value) => setField("hideWithoutVideos", value)}
              />
              <div className="space-y-2">
                <Label className="font-semibold text-muted-foreground">
                  Onde exibir
                </Label>
                <Select
                  value={form.displayMode}
                  onValueChange={(value) => setField("displayMode", value)}
                >
                  <SelectTrigger className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Loja inteira</SelectItem>
                    <SelectItem value="product">
                      Apenas páginas de produto
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-semibold text-muted-foreground">
                  Vídeo nas páginas de produto
                </Label>
                <Select
                  value={form.productMode}
                  onValueChange={(value) => setField("productMode", value)}
                >
                  <SelectTrigger className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linked_or_all">
                      Vídeo vinculado, ou todos se não houver
                    </SelectItem>
                    <SelectItem value="linked_only">
                      Somente vídeo vinculado ao produto
                    </SelectItem>
                    <SelectItem value="all">Todos os vídeos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-semibold text-muted-foreground">
                  URLs incluídas (vazio = todas)
                </Label>
                <Textarea
                  value={form.includePaths}
                  onChange={(event) =>
                    setField("includePaths", event.target.value)
                  }
                  rows={2}
                  placeholder={"/colecoes/verao\n/produto"}
                  className="rounded-xl border-border bg-card text-sm text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold text-muted-foreground">
                  URLs excluídas
                </Label>
                <Textarea
                  value={form.excludePaths}
                  onChange={(event) =>
                    setField("excludePaths", event.target.value)
                  }
                  rows={3}
                  placeholder={"/checkout\n/carrinho\n/cart"}
                  className="rounded-xl border-border bg-card text-sm text-foreground"
                />
              </div>
            </section>

            <SectionDivider />

            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <ShoppingBag className="h-5 w-5 text-foreground/80" />
                <h4 className="text-base font-bold text-foreground">
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
                  <Label className="font-semibold text-muted-foreground">
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
                    className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold text-muted-foreground">
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
                    className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground"
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
                <Label className="font-semibold text-muted-foreground">
                  Texto extra opcional
                </Label>
                <Input
                  value={form.customPaymentNote}
                  onChange={(event) =>
                    setField("customPaymentNote", event.target.value)
                  }
                  placeholder="Cupom de primeira compra disponível na loja"
                  className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground"
                />
              </div>
            </section>

            <SectionDivider />

            <section className="space-y-4 pb-6">
              <div className="flex items-center gap-3">
                <Code2 className="h-5 w-5 text-foreground/80" />
                <h4 className="text-base font-bold text-foreground">
                  Instalação
                </h4>
              </div>
              <Button
                variant="outline"
                className="h-11 w-full rounded-xl bg-card text-sm font-bold text-primary"
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

        <div className="flex min-h-[560px] flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-lg bg-muted/50 px-4 py-2 text-sm font-semibold text-muted-foreground">
              Prévia instantânea
            </span>
            <div className="flex rounded-xl border border-border bg-muted/50 p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setPreviewViewport("desktop")}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2 text-muted-foreground",
                  previewViewport === "desktop" &&
                    "bg-card text-foreground shadow-sm",
                )}
              >
                <Monitor className="h-4 w-4" />
                Desktop
              </button>
              <button
                type="button"
                onClick={() => setPreviewViewport("mobile")}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2 text-muted-foreground",
                  previewViewport === "mobile" &&
                    "bg-card text-foreground shadow-sm",
                )}
              >
                <Smartphone className="h-4 w-4" />
                Mobile
              </button>
            </div>
          </div>
          {props.storeSlug ? (
            // The real production widget bundle, styled by the pending edits
            // (lupp_* overrides on the /test-store script src). The mobile
            // viewport narrows the frame to a phone-width column.
            <iframe
              key={realPreviewSrc}
              src={realPreviewSrc}
              title="Prévia instantânea do widget"
              className={cn(
                "min-h-[560px] w-full flex-1 rounded-2xl border border-border bg-card shadow-sm",
                previewViewport === "mobile" && "mx-auto max-w-sm",
              )}
            />
          ) : (
            <div className="flex min-h-[560px] flex-1 items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm font-medium text-muted-foreground">
              Conclua o cadastro da loja para visualizar a prévia do widget.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * The real preview embeds /test-store with the CURRENT (unsaved) form as
 * lupp_* query overrides — the widget runtime reads them from its script src
 * with the same precedence as data-* attributes, so what renders is the real
 * production bundle styled exactly like the pending edits.
 */
function buildRealPreviewSrc(storeSlug: string, form: WidgetSettingsForm) {
  const params = new URLSearchParams({
    widget: "floating_launcher",
    lupp_position: form.launcherPosition,
    lupp_accent_color: form.launcherAccent,
    lupp_background_color: form.launcherBackground,
    lupp_text_color: form.launcherTextColor,
    lupp_label: form.launcherLabel,
    lupp_font_family: form.launcherFont,
    lupp_bubble_size: form.launcherSize,
    lupp_model: form.launcherModel,
    lupp_offset_x: form.launcherOffsetX,
    lupp_offset_y: form.launcherOffsetY,
  });
  return `/test-store/${storeSlug}?${params.toString()}`;
}

function useDebouncedRealPreviewSrc(
  storeSlug: string | undefined,
  form: WidgetSettingsForm,
) {
  const target = storeSlug ? buildRealPreviewSrc(storeSlug, form) : "";
  const [src, setSrc] = React.useState(target);
  React.useEffect(() => {
    const handle = window.setTimeout(() => setSrc(target), 600);
    return () => window.clearTimeout(handle);
  }, [target]);
  return src;
}

function SectionDivider() {
  return <div className="-mx-6 border-t border-border" />;
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
        <span className="block text-sm font-semibold text-muted-foreground">
          {label}
        </span>
        <Input
          aria-label={`${label} hexadecimal`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 rounded-lg border-border bg-card font-mono text-sm font-semibold text-foreground"
        />
      </span>
    </label>
  );
}

