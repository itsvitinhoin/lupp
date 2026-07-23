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
import {
  ArrowLeft,
  Code2,
  LayoutGrid,
  LockKeyhole,
  Palette,
  PlayCircle,
  Ruler,
  Save,
  Video,
} from "lucide-react";
import { AdvancedSwitch } from "./AdvancedSwitch";
import type {
  SetWidgetSettingsField,
  WidgetSettingsForm,
} from "./useWidgetSettingsForm";

function SectionDivider() {
  return <div className="-mx-6 border-t border-border" />;
}

function NumberField(props: {
  label: string;
  max: number;
  min: number;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="font-semibold text-muted-foreground">{props.label}</Label>
      <Input
        type="number"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground"
      />
    </div>
  );
}

export function HorizontalFeedEditor(props: {
  activeWidgetCount: number;
  canPersist: boolean;
  currentPlanName: string;
  embedCode: string;
  form: WidgetSettingsForm;
  isLockedByPlan: boolean;
  isSavingSettings: boolean;
  onBack: () => void;
  onCopyCode: () => void | Promise<void>;
  onSave: () => void;
  requiredPlanName: string;
  setCarouselEnabled: (value: boolean) => void;
  setField: SetWidgetSettingsField;
  widgetLimit: number;
}) {
  const { form, setField } = props;
  const desktopCount = Math.max(1, Number(form.carouselDesktopCount) || 1);
  const mobileCount = Math.max(1, Number(form.carouselMobileCount) || 1);

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
              Feed Horizontal
            </h2>
            <p className="mt-1 max-w-2xl text-sm font-medium text-muted-foreground">
              Configure o carrossel de vídeos que aparece na Home da loja antes
              de abrir o feed vertical completo.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            className="h-11 rounded-xl bg-card px-5 text-sm font-bold"
            onClick={() => void props.onCopyCode()}
          >
            <Code2 className="mr-2 h-5 w-5" />
            Copiar código
          </Button>
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
        <aside className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <Video className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">
              Aparência do carrossel
            </h3>
          </div>

          {props.isLockedByPlan ? (
            <div className="mb-6 rounded-2xl border border-warning-surface-border bg-warning-surface p-4">
              <div className="flex gap-3">
                <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                <div>
                  <p className="text-sm font-black text-warning-surface-foreground">
                    Feed Horizontal disponível no {props.requiredPlanName}
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-5 text-warning-surface-foreground">
                    O plano {props.currentPlanName} permite{" "}
                    {props.widgetLimit} widget ativo. A bolinha flutuante já
                    conta como 1 widget; o carrossel da Home é o segundo.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-6 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm font-semibold text-muted-foreground">
              Uso atual: {props.activeWidgetCount} de{" "}
              {props.widgetLimit >= 999 ? "widgets ilimitados" : `${props.widgetLimit} widgets`}{" "}
              no plano {props.currentPlanName}.
            </div>
          )}

          <div className="space-y-6">
            <AdvancedSwitch
              checked={form.carouselEnabled && !props.isLockedByPlan}
              description={
                props.isLockedByPlan
                  ? "Faça upgrade para Growth ou superior para ativar a bolinha flutuante e o Feed Horizontal ao mesmo tempo."
                  : "Mostra o carrossel na Home para lojas com vídeos ativos. Nas páginas de produto, a miniatura continua priorizando o produto vinculado."
              }
              disabled={props.isLockedByPlan}
              label="Exibir Feed Horizontal na Home"
              onChange={props.setCarouselEnabled}
            />

            <div className="space-y-2">
              <Label className="font-semibold text-muted-foreground">Título</Label>
              <Input
                value={form.carouselTitle}
                onChange={(event) =>
                  setField("carouselTitle", event.target.value)
                }
                placeholder="Descubra cada detalhe e Compre"
                className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-muted-foreground">
                Descrição opcional
              </Label>
              <Textarea
                value={form.carouselDescription}
                onChange={(event) =>
                  setField("carouselDescription", event.target.value)
                }
                rows={3}
                placeholder="Veja os produtos em vídeo e compre sem sair da experiência."
                className="rounded-xl border-border bg-card text-sm text-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-muted-foreground">
                Inserir antes da seção
              </Label>
              <Input
                value={form.carouselBeforeHeading}
                onChange={(event) =>
                  setField("carouselBeforeHeading", event.target.value)
                }
                placeholder="Com Capa"
                className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground"
              />
              <p className="text-xs font-semibold leading-5 text-muted-foreground">
                A Luup procura esse título na Home. Se não encontrar, tenta
                posicionar logo depois da faixa de benefícios da loja.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-muted-foreground">
                Âncora avançada (seletor CSS)
              </Label>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <Input
                  value={form.carouselAnchorSelector}
                  onChange={(event) =>
                    setField("carouselAnchorSelector", event.target.value)
                  }
                  placeholder="#main .products"
                  className="h-11 rounded-xl border-border bg-card font-mono text-sm text-foreground"
                />
                <Select
                  value={form.carouselAnchorPlacement}
                  onValueChange={(value) =>
                    setField("carouselAnchorPlacement", value)
                  }
                >
                  <SelectTrigger className="h-11 w-28 rounded-xl border-border bg-card text-sm font-semibold text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="before">Antes</SelectItem>
                    <SelectItem value="after">Depois</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs font-semibold leading-5 text-muted-foreground">
                Quando preenchida, a âncora tem prioridade sobre o título: o
                carrossel é inserido antes ou depois do primeiro elemento que
                casar com o seletor.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-muted-foreground">
                Posição quando nenhuma âncora é encontrada
              </Label>
              <Select
                value={form.carouselAnchorFallback}
                onValueChange={(value) => setField("carouselAnchorFallback", value)}
              >
                <SelectTrigger className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom">Final da página</SelectItem>
                  <SelectItem value="top">Início da página</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs font-semibold leading-5 text-muted-foreground">
                Se o título acima e a âncora avançada não forem encontrados
                nesse tema, o carrossel usa essa posição em vez de aparecer no
                topo da página por padrão.
              </p>
            </div>

            <AdvancedSwitch
              checked={form.carouselShowPrice}
              description="Quando desativado, o preço do produto fica oculto nos cartões do carrossel — em todas as visitas, independente de login."
              label="Mostrar preço no carrossel"
              onChange={(value) => setField("carouselShowPrice", value)}
            />

            <AdvancedSwitch
              checked={form.carouselShowCartActions}
              description="Quando desativado, o botão de compra (“Comprar”) some dos cartões do carrossel; os vídeos continuam abrindo normalmente ao clicar."
              label="Mostrar botão de compra no carrossel"
              onChange={(value) => setField("carouselShowCartActions", value)}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold text-muted-foreground">
                  Vídeos no desktop
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={form.carouselDesktopCount}
                  onChange={(event) =>
                    setField("carouselDesktopCount", event.target.value)
                  }
                  className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold text-muted-foreground">
                  Vídeos no mobile
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={form.carouselMobileCount}
                  onChange={(event) =>
                    setField("carouselMobileCount", event.target.value)
                  }
                  className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground"
                />
              </div>
            </div>

            <SectionDivider />

            <div className="flex items-center gap-3">
              <Ruler className="h-5 w-5 text-foreground/80" />
              <h4 className="text-base font-bold text-foreground">
                Espaçamento e layout
              </h4>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <NumberField
                label="Espaçamento horizontal (px)"
                min={0}
                max={120}
                value={form.carouselSectionPaddingX}
                onChange={(value) => setField("carouselSectionPaddingX", value)}
              />
              <NumberField
                label="Espaçamento vertical (px)"
                min={0}
                max={120}
                value={form.carouselSectionPaddingY}
                onChange={(value) => setField("carouselSectionPaddingY", value)}
              />
              <NumberField
                label="Margem horizontal (px)"
                min={0}
                max={120}
                value={form.carouselSectionMarginX}
                onChange={(value) => setField("carouselSectionMarginX", value)}
              />
              <NumberField
                label="Margem vertical (px)"
                min={0}
                max={120}
                value={form.carouselSectionMarginY}
                onChange={(value) => setField("carouselSectionMarginY", value)}
              />
              <NumberField
                label="Espaço entre cartões (px)"
                min={0}
                max={80}
                value={form.carouselCardGap}
                onChange={(value) => setField("carouselCardGap", value)}
              />
            </div>

            <AdvancedSwitch
              checked={form.carouselShowScrollHint}
              description="Mostra um leve degradê nas bordas indicando que dá para arrastar o carrossel para os lados."
              label="Mostrar indicador de rolagem"
              onChange={(value) => setField("carouselShowScrollHint", value)}
            />

            <AdvancedSwitch
              checked={form.carouselShowNavigationArrows}
              description="Mostra setas de avançar/voltar nos cantos do carrossel em telas desktop, que passam um vídeo por vez. O carrossel também pode ser arrastado com o mouse; no celular, o gesto de arrastar já funciona nativamente."
              label="Mostrar setas de navegação"
              onChange={(value) => setField("carouselShowNavigationArrows", value)}
            />

            <SectionDivider />

            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-foreground/80" />
              <h4 className="text-base font-bold text-foreground">Cores e fonte</h4>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ColorPickerField
                id="carousel-background-color"
                label="Cor de fundo"
                value={form.carouselBackgroundColor}
                onChange={(value) => setField("carouselBackgroundColor", value)}
              />
              <ColorPickerField
                id="carousel-title-color"
                label="Cor do título"
                value={form.carouselTitleColor}
                onChange={(value) => setField("carouselTitleColor", value)}
              />
              <ColorPickerField
                id="carousel-description-color"
                label="Cor da descrição"
                value={form.carouselDescriptionColor}
                onChange={(value) => setField("carouselDescriptionColor", value)}
              />
            </div>

            <AdvancedSwitch
              checked={Boolean(form.carouselAccentColor)}
              description="Cor de destaque usada na borda dos cartões e no botão de compra. Quando desativado, usa a mesma cor de destaque da miniatura flutuante."
              label="Cor de destaque própria"
              onChange={(value) =>
                setField("carouselAccentColor", value ? form.launcherAccent : "")
              }
            />
            {form.carouselAccentColor ? (
              <ColorPickerField
                id="carousel-accent-color"
                label="Cor de destaque do carrossel"
                value={form.carouselAccentColor}
                onChange={(value) => setField("carouselAccentColor", value)}
              />
            ) : null}

            <div className="space-y-2">
              <Label className="font-semibold text-muted-foreground">Fonte do carrossel</Label>
              <Select
                value={form.carouselFontSource}
                onValueChange={(value) => setField("carouselFontSource", value)}
              >
                <SelectTrigger className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="store">Fonte da loja (padrão)</SelectItem>
                  <SelectItem value="launcher">Mesma da miniatura flutuante</SelectItem>
                  <SelectItem value="custom">Personalizada</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs font-semibold leading-5 text-muted-foreground">
                “Fonte da loja” herda automaticamente a fonte que o tema da sua
                loja já usa, sem precisar configurar nada.
              </p>
            </div>
            {form.carouselFontSource === "custom" ? (
              <div className="space-y-2">
                <Label className="font-semibold text-muted-foreground">
                  Família da fonte (CSS)
                </Label>
                <Input
                  value={form.carouselFontFamily}
                  onChange={(event) => setField("carouselFontFamily", event.target.value)}
                  placeholder="Inter, system-ui, sans-serif"
                  className="h-11 rounded-xl border-border bg-card font-mono text-sm text-foreground"
                />
              </div>
            ) : null}

            <AdvancedSwitch
              checked={form.carouselShowTitle}
              description="Quando desativado, o título acima do carrossel não é exibido (o texto continua salvo)."
              label="Mostrar título"
              onChange={(value) => setField("carouselShowTitle", value)}
            />
            <AdvancedSwitch
              checked={form.carouselShowDescription}
              description="Quando desativado, a descrição acima do carrossel não é exibida (o texto continua salvo)."
              label="Mostrar descrição"
              onChange={(value) => setField("carouselShowDescription", value)}
            />

            <SectionDivider />

            <div className="flex items-center gap-3">
              <LayoutGrid className="h-5 w-5 text-foreground/80" />
              <h4 className="text-base font-bold text-foreground">
                Cartão de produto
              </h4>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <NumberField
                label="Arredondamento (px)"
                min={0}
                max={40}
                value={form.carouselCardBorderRadius}
                onChange={(value) => setField("carouselCardBorderRadius", value)}
              />
              <div className="space-y-2">
                <Label className="font-semibold text-muted-foreground">
                  Proporção do cartão
                </Label>
                <Select
                  value={form.carouselCardAspectRatio}
                  onValueChange={(value) => setField("carouselCardAspectRatio", value)}
                >
                  <SelectTrigger className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9:16">9:16 (retrato)</SelectItem>
                    <SelectItem value="4:5">4:5</SelectItem>
                    <SelectItem value="3:4">3:4</SelectItem>
                    <SelectItem value="1:1">1:1 (quadrado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <NumberField
                label="Largura mínima (px)"
                min={120}
                max={360}
                value={form.carouselCardMinWidth}
                onChange={(value) => setField("carouselCardMinWidth", value)}
              />
              <NumberField
                label="Largura máxima (px)"
                min={120}
                max={360}
                value={form.carouselCardMaxWidth}
                onChange={(value) => setField("carouselCardMaxWidth", value)}
              />
            </div>

            <ColorPickerField
              id="carousel-card-background-color"
              label="Cor de fundo do cartão (antes de carregar a miniatura)"
              value={form.carouselCardBackgroundColor}
              onChange={(value) => setField("carouselCardBackgroundColor", value)}
            />

            <AdvancedSwitch
              checked={form.carouselCardShadowEnabled}
              description="Adiciona uma sombra suave abaixo de cada cartão. Desativado por padrão."
              label="Sombra no cartão"
              onChange={(value) => setField("carouselCardShadowEnabled", value)}
            />
            {form.carouselCardShadowEnabled ? (
              <div className="space-y-4">
                <ColorPickerField
                  id="carousel-card-shadow-color"
                  label="Cor da sombra"
                  value={form.carouselCardShadowColor}
                  onChange={(value) => setField("carouselCardShadowColor", value)}
                />
                <div className="grid grid-cols-2 gap-4">
                  <NumberField
                    label="Opacidade (%)"
                    min={0}
                    max={100}
                    value={form.carouselCardShadowOpacity}
                    onChange={(value) => setField("carouselCardShadowOpacity", value)}
                  />
                  <NumberField
                    label="Desfoque (px)"
                    min={0}
                    max={80}
                    value={form.carouselCardShadowBlur}
                    onChange={(value) => setField("carouselCardShadowBlur", value)}
                  />
                  <NumberField
                    label="Deslocamento horizontal (px)"
                    min={-40}
                    max={40}
                    value={form.carouselCardShadowOffsetX}
                    onChange={(value) => setField("carouselCardShadowOffsetX", value)}
                  />
                  <NumberField
                    label="Deslocamento vertical (px)"
                    min={-40}
                    max={40}
                    value={form.carouselCardShadowOffsetY}
                    onChange={(value) => setField("carouselCardShadowOffsetY", value)}
                  />
                </div>
              </div>
            ) : null}

            <SectionDivider />

            <div className="flex items-center gap-3">
              <PlayCircle className="h-5 w-5 text-foreground/80" />
              <h4 className="text-base font-bold text-foreground">Rolagem automática</h4>
            </div>

            <AdvancedSwitch
              checked={form.carouselAutoplayEnabled}
              description="O carrossel avança automaticamente de tempos em tempos. Nunca roda para visitantes com redução de movimento ativada no navegador."
              label="Ativar rolagem automática"
              onChange={(value) => setField("carouselAutoplayEnabled", value)}
            />

            {form.carouselAutoplayEnabled ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <NumberField
                    label="Intervalo entre avanços (ms)"
                    min={1500}
                    max={15000}
                    value={form.carouselAutoplayIntervalMs}
                    onChange={(value) => setField("carouselAutoplayIntervalMs", value)}
                  />
                  <div className="space-y-2">
                    <Label className="font-semibold text-muted-foreground">Direção</Label>
                    <Select
                      value={form.carouselAutoplayDirection}
                      onValueChange={(value) => setField("carouselAutoplayDirection", value)}
                    >
                      <SelectTrigger className="h-11 rounded-xl border-border bg-card text-sm font-semibold text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="forward">Para frente</SelectItem>
                        <SelectItem value="backward">Para trás</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <AdvancedSwitch
                  checked={form.carouselAutoplayPauseOnHover}
                  description="Pausa a rolagem automática enquanto o mouse estiver sobre o carrossel."
                  label="Pausar ao passar o mouse"
                  onChange={(value) => setField("carouselAutoplayPauseOnHover", value)}
                />
                <AdvancedSwitch
                  checked={form.carouselAutoplayLoop}
                  description="Quando chega ao final, volta para o primeiro vídeo e continua. Quando desativado, a rolagem automática para no último vídeo."
                  label="Repetir em loop"
                  onChange={(value) => setField("carouselAutoplayLoop", value)}
                />
              </>
            ) : null}

            <CodeBlock code={props.embedCode} />
          </div>
        </aside>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-6">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">
              preview
            </p>
            <h3 className="mt-2 text-xl font-black text-foreground">
              Como aparece na Home
            </h3>
          </div>
          <div className="bg-muted/50 p-6">
            <div className="rounded-xl bg-card py-8 shadow-sm">
              <h2 className="px-6 text-center text-2xl font-semibold text-foreground">
                {form.carouselTitle || "Descubra cada detalhe e Compre"}
              </h2>
              {form.carouselDescription ? (
                <p className="mx-auto mt-3 max-w-xl px-6 text-center text-sm font-semibold leading-6 text-muted-foreground">
                  {form.carouselDescription}
                </p>
              ) : null}
              <div className="mt-7 flex gap-5 overflow-hidden px-6">
                {Array.from({ length: Math.min(desktopCount, 5) }).map(
                  (_, index) => (
                    <div
                      key={index}
                      className="relative h-[300px] w-[170px] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-blue-900 to-slate-700 shadow-lg"
                    >
                      <div className="absolute inset-x-2 bottom-2 rounded-lg border border-white/20 bg-slate-700/80 p-2 text-white backdrop-blur">
                        <div className="flex items-center gap-2">
                          <span className="h-10 w-10 rounded-md bg-card/80" />
                          <span className="min-w-0 text-xs font-bold">
                            Produto em vídeo
                          </span>
                        </div>
                        <div className="mt-2 rounded-lg border-2 border-primary bg-card px-3 py-2 text-center text-xs font-black text-foreground">
                          Comprar
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
              <div className="mt-5 px-6 text-xs font-semibold text-muted-foreground">
                Mobile exibe até {mobileCount} vídeos; desktop exibe até{" "}
                {desktopCount}.
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
