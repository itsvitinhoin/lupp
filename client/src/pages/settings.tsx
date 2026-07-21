import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentStore } from "@/hooks/useStore";
import { storesService } from "@/services/stores.service";
import { UploadCloud } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const logoMimeTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
];

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export default function Settings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { store, isLoading } = useCurrentStore();
  const logoInputRef = React.useRef<HTMLInputElement | null>(null);

  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [platform, setPlatform] = React.useState("custom");
  const [segment, setSegment] = React.useState("moda");
  const [primaryColor, setPrimaryColor] = React.useState("#006BFF");
  const [secondaryColor, setSecondaryColor] = React.useState("#0B1020");
  const [buttonColor, setButtonColor] = React.useState("#006BFF");
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoPreview, setLogoPreview] = React.useState("");
  const [isSavingStore, setIsSavingStore] = React.useState(false);
  const [isSavingBrand, setIsSavingBrand] = React.useState(false);

  React.useEffect(() => {
    if (!store) return;
    setName(store.name || "");
    setUrl(store.url || "");
    setPlatform(store.platform || "custom");
    setSegment(store.segment || "moda");
    setPrimaryColor(store.primary_color || "#006BFF");
    setSecondaryColor(store.secondary_color || "#0B1020");
    setButtonColor(store.button_color || "#006BFF");
    setLogoPreview(store.logo_url || "");
    setLogoFile(null);
  }, [store?.id]);

  React.useEffect(() => {
    return () => {
      if (logoFile && logoPreview.startsWith("blob:"))
        URL.revokeObjectURL(logoPreview);
    };
  }, [logoFile, logoPreview]);

  const refreshStore = async () => {
    if (user?.id)
      await queryClient.invalidateQueries({ queryKey: ["stores", user.id] });
  };

  const handleLogoChange = (file?: File | null) => {
    if (!file) return;
    if (!logoMimeTypes.includes(file.type)) {
      toast({
        title: "Formato inválido",
        description: "Envie PNG, JPG, WebP ou SVG.",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Logo muito grande", description: "O limite é 10MB." });
      return;
    }
    if (logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const saveStoreData = async () => {
    if (!store) {
      toast({
        title: "Loja não encontrada",
        description: "Entre novamente ou conclua o onboarding.",
      });
      return;
    }
    if (!name.trim()) {
      toast({ title: "Informe o nome da loja." });
      return;
    }

    try {
      setIsSavingStore(true);
      await storesService.updateStoreIdentity(store.id, {
        name: name.trim(),
        url: normalizeUrl(url) || null,
        platform,
        segment,
      });
      await refreshStore();
      toast({
        title: "Dados da loja salvos",
        description: "O script de instalação já passa a usar esses dados.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível salvar",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em instantes.",
      });
    } finally {
      setIsSavingStore(false);
    }
  };

  const saveBrandData = async () => {
    if (!store) {
      toast({
        title: "Loja não encontrada",
        description: "Entre novamente ou conclua o onboarding.",
      });
      return;
    }

    try {
      setIsSavingBrand(true);
      let logoUrl = store.logo_url;
      if (logoFile) {
        logoUrl = await storesService.uploadStoreLogo(store.id, logoFile);
      }

      await storesService.updateStore(store.id, {
        logo_url: logoUrl || null,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        button_color: buttonColor,
      });
      await refreshStore();
      setLogoFile(null);
      toast({
        title: "Marca salva",
        description: "Logo, cores e identidade da loja foram atualizadas.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível salvar a marca",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em instantes.",
      });
    } finally {
      setIsSavingBrand(false);
    }
  };

  return (
    <AppLayout title="Configurações">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Configurações da loja
        </h2>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Esses dados alimentam Perfil, Integrações, widgets e scripts
          instalados no e-commerce.
        </p>
      </div>

      <Tabs defaultValue="loja" className="w-full">
        <TabsList className="mb-6 h-auto w-full justify-start overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger
            value="loja"
            className="rounded-none py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            Loja
          </TabsTrigger>
          <TabsTrigger
            value="marca"
            className="rounded-none py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            Marca
          </TabsTrigger>
          <TabsTrigger
            value="notificacoes"
            className="rounded-none py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            Notificações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="loja">
          <Card className="border-border bg-card text-foreground">
            <CardHeader>
              <CardTitle>Dados da loja</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <p className="text-sm font-medium text-muted-foreground">
                  Carregando loja...
                </p>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="store-name">Nome da loja</Label>
                      <Input
                        id="store-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Ex: CELEB"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="store-url">URL da loja</Label>
                      <Input
                        id="store-url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder="https://sualoja.com.br"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Plataforma</Label>
                      <Select value={platform} onValueChange={setPlatform}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="upzero">UP Zero</SelectItem>
                          <SelectItem value="nuvemshop">Nuvemshop</SelectItem>
                          <SelectItem value="shopify">Shopify</SelectItem>
                          <SelectItem value="woocommerce">
                            WooCommerce
                          </SelectItem>
                          <SelectItem value="custom">
                            Loja customizada
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Segmento</Label>
                      <Select value={segment} onValueChange={setSegment}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="moda">Moda feminina</SelectItem>
                          <SelectItem value="beleza">Beleza</SelectItem>
                          <SelectItem value="acessorios">Acessórios</SelectItem>
                          <SelectItem value="outros">Outros</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={saveStoreData} disabled={isSavingStore}>
                    {isSavingStore ? "Salvando..." : "Salvar dados da loja"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marca">
          <Card className="border-border bg-card text-foreground">
            <CardHeader>
              <CardTitle>Configurações da marca</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label>Logo no topo dos vídeos</Label>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept={logoMimeTypes.join(",")}
                      className="sr-only"
                      onChange={(event) =>
                        handleLogoChange(event.target.files?.item(0))
                      }
                    />
                    <button
                      type="button"
                      className="flex w-full items-center gap-4 rounded-2xl border border-dashed border-input bg-muted/50 p-4 text-left transition hover:border-primary/50 hover:bg-primary/5"
                      onClick={() => logoInputRef.current?.click()}
                    >
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
                        {logoPreview ? (
                          <img
                            src={logoPreview}
                            alt="Logo da loja"
                            className="h-full w-full object-contain p-2"
                          />
                        ) : (
                          <UploadCloud className="h-6 w-6 text-muted-foreground/70" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">
                          {logoPreview ? "Trocar logo" : "Enviar logo"}
                        </p>
                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                          PNG, JPG, WebP ou SVG até 10MB. Ela aparece no topo do
                          feed vertical.
                        </p>
                      </div>
                    </button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <ColorField
                      label="Cor principal"
                      value={primaryColor}
                      onChange={setPrimaryColor}
                    />
                    <ColorField
                      label="Cor secundária"
                      value={secondaryColor}
                      onChange={setSecondaryColor}
                    />
                    <ColorField
                      label="Cor dos botões"
                      value={buttonColor}
                      onChange={setButtonColor}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-muted/50 p-5">
                  <p className="mb-4 text-sm font-bold text-foreground">
                    Preview da marca
                  </p>
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
                        {logoPreview ? (
                          <img
                            src={logoPreview}
                            alt=""
                            className="h-full w-full object-contain p-1.5"
                          />
                        ) : (
                          <span className="text-xs font-black text-muted-foreground/70">
                            LOGO
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">
                          {name || store?.name || "Sua loja"}
                        </p>
                        <p className="text-xs font-medium text-muted-foreground">
                          {url || store?.url || "sualoja.com.br"}
                        </p>
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      style={{ backgroundColor: buttonColor }}
                    >
                      Comprar agora
                    </Button>
                  </div>
                </div>
              </div>

              <Button onClick={saveBrandData} disabled={isSavingBrand}>
                {isSavingBrand ? "Salvando..." : "Salvar marca"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notificacoes">
          <Card className="border-border bg-card text-foreground">
            <CardHeader>
              <CardTitle>Preferências de notificação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  title: "Relatório semanal",
                  desc: "Receba um resumo de performance toda segunda-feira.",
                  checked: true,
                },
                {
                  title: "Alertas de limite",
                  desc: "Avisar quando atingir 80% do limite de views do plano.",
                  checked: true,
                },
                {
                  title: "Novos comentários",
                  desc: "Receber email para cada comentário aguardando aprovação.",
                  checked: false,
                },
                {
                  title: "Vídeo em alta",
                  desc: "Avisar quando um vídeo tiver performance 50% acima da média.",
                  checked: true,
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex items-center justify-between border-b border-border pb-4 last:border-0 last:pb-0"
                >
                  <div className="space-y-0.5">
                    <Label className="text-base">{item.title}</Label>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch defaultChecked={item.checked} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

function ColorField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2">
        <input
          aria-label={label}
          className="h-10 w-10 cursor-pointer rounded-lg border border-border bg-transparent"
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="font-mono text-sm uppercase"
        />
      </div>
    </div>
  );
}
