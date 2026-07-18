import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CodeBlock } from "@/components/shared/CodeBlock";
import { ArrowLeft, Code2, LockKeyhole, Save, Video } from "lucide-react";
import { AdvancedSwitch } from "./AdvancedSwitch";
import type {
  SetWidgetSettingsField,
  WidgetSettingsForm,
} from "./useWidgetSettingsForm";

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
            className="mt-1 h-10 w-10 rounded-xl text-slate-700 hover:bg-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold leading-tight tracking-tight text-slate-950">
              Feed Horizontal
            </h2>
            <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
              Configure o carrossel de vídeos que aparece na Home da loja antes
              de abrir o feed vertical completo.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            className="h-11 rounded-xl bg-white px-5 text-sm font-bold"
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
        <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <Video className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-slate-950">
              Aparência do carrossel
            </h3>
          </div>

          {props.isLockedByPlan ? (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex gap-3">
                <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-black text-amber-900">
                    Feed Horizontal disponível no {props.requiredPlanName}
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-5 text-amber-800">
                    O plano {props.currentPlanName} permite{" "}
                    {props.widgetLimit} widget ativo. A bolinha flutuante já
                    conta como 1 widget; o carrossel da Home é o segundo.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-6 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm font-semibold text-slate-600">
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
              <Label className="font-semibold text-slate-500">Título</Label>
              <Input
                value={form.carouselTitle}
                onChange={(event) =>
                  setField("carouselTitle", event.target.value)
                }
                placeholder="Descubra cada detalhe e Compre"
                className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-slate-500">
                Descrição opcional
              </Label>
              <Textarea
                value={form.carouselDescription}
                onChange={(event) =>
                  setField("carouselDescription", event.target.value)
                }
                rows={3}
                placeholder="Veja os produtos em vídeo e compre sem sair da experiência."
                className="rounded-xl border-slate-200 bg-white text-sm text-slate-950"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-semibold text-slate-500">
                Inserir antes da seção
              </Label>
              <Input
                value={form.carouselBeforeHeading}
                onChange={(event) =>
                  setField("carouselBeforeHeading", event.target.value)
                }
                placeholder="Com Capa"
                className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950"
              />
              <p className="text-xs font-semibold leading-5 text-slate-500">
                A Luup procura esse título na Home. Se não encontrar, tenta
                posicionar logo depois da faixa de benefícios da loja.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold text-slate-500">
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
                  className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold text-slate-500">
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
                  className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-950"
                />
              </div>
            </div>

            <CodeBlock code={props.embedCode} />
          </div>
        </aside>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-6">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">
              preview
            </p>
            <h3 className="mt-2 text-xl font-black text-slate-950">
              Como aparece na Home
            </h3>
          </div>
          <div className="bg-slate-50 p-6">
            <div className="rounded-xl bg-white py-8 shadow-sm">
              <h2 className="px-6 text-center text-2xl font-semibold text-slate-950">
                {form.carouselTitle || "Descubra cada detalhe e Compre"}
              </h2>
              {form.carouselDescription ? (
                <p className="mx-auto mt-3 max-w-xl px-6 text-center text-sm font-semibold leading-6 text-slate-500">
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
                          <span className="h-10 w-10 rounded-md bg-white/80" />
                          <span className="min-w-0 text-xs font-bold">
                            Produto em vídeo
                          </span>
                        </div>
                        <div className="mt-2 rounded-lg border-2 border-primary bg-white px-3 py-2 text-center text-xs font-black text-slate-950">
                          Comprar
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
              <div className="mt-5 px-6 text-xs font-semibold text-slate-500">
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
