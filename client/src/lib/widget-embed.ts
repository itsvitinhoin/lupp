import { env } from "@/lib/env";

export function jsStringLiteral(value: string) {
  return JSON.stringify(value).replace(/<\/script/gi, "<\\/script");
}

type EmbedStoreIdentity = {
  id?: string | null;
  slug?: string | null;
  url?: string | null;
};

const DEFAULT_COMMENT = [
  "Apenas identidade: aparência, exibição e vídeos vêm das configurações",
  "salvas no painel Luup, resolvidas pelo servidor a cada página. Atributos",
  "extras SOBRESCREVEM o painel — não adicione a menos que queira fixar um",
  "valor para sempre.",
];

/**
 * Manual <script> embed for widget.js, kept in lockstep with the public
 * SCRIPT_VALUE_SPECS contract (widget-src/main.ts). It carries only the
 * store identity (id → slug → domain, the same resolution chain the server
 * walks) plus environment endpoints — appearance/display/carousel settings
 * are resolved server-side from the dashboard on every page load, and any
 * extra data-* attribute permanently overrides the panel.
 */
export function buildWidgetEmbedCode({
  commentLines = DEFAULT_COMMENT,
  store,
  widgetType = "floating_launcher",
}: {
  commentLines?: string[];
  store: EmbedStoreIdentity | null | undefined;
  widgetType?: string;
}) {
  if (!store?.id || !store?.slug) {
    return "<!-- Crie uma loja para gerar o código de instalação da Lupp. -->";
  }

  const identityLines = [
    `  s.setAttribute('data-store-id', ${jsStringLiteral(store.id)});`,
    `  s.setAttribute('data-store', ${jsStringLiteral(store.slug)});`,
  ];
  if (store.url) {
    try {
      identityLines.push(
        `  s.setAttribute('data-store-domain', ${jsStringLiteral(new URL(store.url).hostname)});`,
      );
    } catch {
      // stores.url isn't a parseable URL — skip the domain fallback
    }
  }

  const comment = commentLines.map((line) => `  // ${line}`).join("\n");

  return `<script>
(function () {
  var s = document.createElement('script');
  s.async = true;
  s.src = ${jsStringLiteral(env.widgetCdnUrl)};

${comment}
${identityLines.join("\n")}
  s.setAttribute('data-widget', ${jsStringLiteral(widgetType)});
  s.setAttribute('data-require-active', 'true');
  s.setAttribute('data-lupp-url', ${jsStringLiteral(env.appUrl)});
  s.setAttribute('data-api-url', ${jsStringLiteral(env.apiUrl)});

  var firstScript = document.getElementsByTagName('script')[0];
  firstScript.parentNode.insertBefore(s, firstScript);
})();
</script>`;
}
