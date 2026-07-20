export interface Video {
  id: string;
  title: string;
  status: "ativo" | "pausado" | "rascunho";
  views: number;
  likes: number;
  comments: number;
  clicks: number;
  revenue: number;
  productId: string | null;
  productName: string | null;
  thumbnail: string;
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  status: "disponível" | "em breve" | "enterprise";
}

export interface CustomPage {
  id: string;
  path: string;
  name: string;
  videoCount: number;
  views: number;
  clicks: number;
  status: "ativo" | "inativo" | "rascunho";
}

export const mockVideos: Video[] = [
  {
    id: "1",
    title: "Look completo para loja de moda feminina",
    status: "ativo",
    views: 8420,
    likes: 320,
    comments: 0,
    clicks: 187,
    revenue: 2890,
    productId: "p1",
    productName: "Vestido Midi Azul",
    thumbnail: "",
  },
  {
    id: "2",
    title: "Provador: vestido midi azul",
    status: "ativo",
    views: 5200,
    likes: 210,
    comments: 0,
    clicks: 145,
    revenue: 1420,
    productId: "p1",
    productName: "Vestido Midi Azul",
    thumbnail: "",
  },
  {
    id: "3",
    title: "3 formas de usar blazer cropped",
    status: "ativo",
    views: 3890,
    likes: 178,
    comments: 0,
    clicks: 98,
    revenue: 1100,
    productId: "p3",
    productName: "Blazer Cropped Preto",
    thumbnail: "",
  },
  {
    id: "4",
    title: "Conjunto mais vendido da semana",
    status: "ativo",
    views: 2740,
    likes: 134,
    comments: 0,
    clicks: 67,
    revenue: 890,
    productId: "p2",
    productName: "Conjunto Alfaiataria Off",
    thumbnail: "",
  },
  {
    id: "5",
    title: "Novidades da coleção",
    status: "rascunho",
    views: 0,
    likes: 0,
    comments: 0,
    clicks: 0,
    revenue: 0,
    productId: null,
    productName: null,
    thumbnail: "",
  },
  {
    id: "6",
    title: "Wide leg: como usar no dia a dia",
    status: "pausado",
    views: 1890,
    likes: 89,
    comments: 0,
    clicks: 43,
    revenue: 0,
    productId: "p4",
    productName: "Calça Wide Leg",
    thumbnail: "",
  },
];

export const mockPages: CustomPage[] = [
  {
    id: "pg1",
    path: "/videos",
    name: "Feed Principal",
    videoCount: 42,
    views: 8420,
    clicks: 342,
    status: "ativo",
  },
  {
    id: "pg2",
    path: "/looks",
    name: "Looks da Semana",
    videoCount: 12,
    views: 2100,
    clicks: 198,
    status: "ativo",
  },
  {
    id: "pg3",
    path: "/provador",
    name: "Provador Virtual",
    videoCount: 8,
    views: 1200,
    clicks: 87,
    status: "inativo",
  },
  {
    id: "pg4",
    path: "/novidades",
    name: "Novidades",
    videoCount: 6,
    views: 890,
    clicks: 43,
    status: "rascunho",
  },
];

export const mockIntegrations: Integration[] = [
  {
    id: "i1",
    name: "Nuvemshop",
    description: "Importe produtos e sincronize seu catálogo automaticamente.",
    status: "disponível",
  },
  {
    id: "i2",
    name: "UP Zero",
    description: "Conecte via API key e sincronize produtos, preços e imagens.",
    status: "disponível",
  },
  {
    id: "i3",
    name: "Shopify",
    description: "Integração completa com seu catálogo e carrinho.",
    status: "disponível",
  },
  {
    id: "i4",
    name: "WooCommerce",
    description: "Plugin nativo para lojas WordPress.",
    status: "em breve",
  },
  {
    id: "i5",
    name: "Tray",
    description: "Sincronização de catálogo e pedidos.",
    status: "em breve",
  },
  {
    id: "i6",
    name: "Yampi",
    description: "Checkout transparente e produtos.",
    status: "em breve",
  },
  {
    id: "i7",
    name: "Loja Integrada",
    description: "Aplicativo oficial na loja de apps.",
    status: "em breve",
  },
  {
    id: "i8",
    name: "VTEX",
    description: "Para operações complexas e alto volume.",
    status: "em breve",
  },
  {
    id: "i9",
    name: "Google Analytics 4",
    description: "Envie eventos de visualização e clique.",
    status: "em breve",
  },
  {
    id: "i10",
    name: "Meta Pixel",
    description: "Retargeting para quem interagiu com vídeos.",
    status: "em breve",
  },
  {
    id: "i11",
    name: "TikTok Pixel",
    description: "Otimização de campanhas.",
    status: "em breve",
  },
  {
    id: "i12",
    name: "WhatsApp",
    description: "Botão de compra via WhatsApp.",
    status: "em breve",
  },
  {
    id: "i13",
    name: "Webhook",
    description: "Receba dados em tempo real.",
    status: "em breve",
  },
];
