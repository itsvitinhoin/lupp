export interface Store {
  name: string;
  platform: string;
  status: string;
}

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

export interface Product {
  id: string;
  name: string;
  price: number;
  videosLinked: number;
  clicks: number;
  addToCart: number;
  revenue: number;
}

export interface Widget {
  id: string;
  name: string;
  description: string;
  status: "ativo" | "inativo";
}

export interface Comment {
  id: string;
  userName: string;
  videoTitle: string;
  productName: string | null;
  text: string;
  date: string;
  status: "pendente" | "aprovado" | "oculto" | "denunciado";
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  status: "disponível" | "em breve" | "enterprise";
}

export interface Plan {
  name: string;
  price: number;
  features: string[];
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

export const mockProducts: Product[] = [
  {
    id: "p1",
    name: "Vestido Midi Azul",
    price: 189.9,
    videosLinked: 12,
    clicks: 342,
    addToCart: 87,
    revenue: 4310,
  },
  {
    id: "p2",
    name: "Conjunto Alfaiataria Off",
    price: 249.9,
    videosLinked: 5,
    clicks: 187,
    addToCart: 45,
    revenue: 2100,
  },
  {
    id: "p3",
    name: "Blazer Cropped Preto",
    price: 219.9,
    videosLinked: 8,
    clicks: 234,
    addToCart: 67,
    revenue: 2870,
  },
  {
    id: "p4",
    name: "Calça Wide Leg",
    price: 179.9,
    videosLinked: 3,
    clicks: 98,
    addToCart: 23,
    revenue: 1120,
  },
  {
    id: "p5",
    name: "Macacão Premium",
    price: 299.9,
    videosLinked: 2,
    clicks: 67,
    addToCart: 18,
    revenue: 890,
  },
];

export const mockComments: Comment[] = [
  {
    id: "c1",
    userName: "Ana Carolina",
    videoTitle: "Look completo",
    productName: "Vestido Midi Azul",
    text: "Tem P desse vestido?",
    date: "10 min atrás",
    status: "pendente",
  },
  {
    id: "c2",
    userName: "Juliana Silva",
    videoTitle: "Provador",
    productName: "Vestido Midi Azul",
    text: "Perfeito o caimento, vou comprar!",
    date: "2 horas atrás",
    status: "aprovado",
  },
  {
    id: "c3",
    userName: "Marina Costa",
    videoTitle: "3 formas de usar blazer",
    productName: "Blazer Cropped Preto",
    text: "Quais as cores disponíveis?",
    date: "1 dia atrás",
    status: "aprovado",
  },
  {
    id: "c4",
    userName: "Paula Santos",
    videoTitle: "Conjunto mais vendido",
    productName: "Conjunto Alfaiataria Off",
    text: "Achei o tecido um pouco transparente na luz",
    date: "2 dias atrás",
    status: "oculto",
  },
  {
    id: "c5",
    userName: "Carla Dias",
    videoTitle: "Look completo",
    productName: "Vestido Midi Azul",
    text: "Amei as combinações!",
    date: "3 dias atrás",
    status: "aprovado",
  },
  {
    id: "c6",
    userName: "Fernanda Lima",
    videoTitle: "Wide leg",
    productName: "Calça Wide Leg",
    text: "Sou baixinha, será que fica bom?",
    date: "3 dias atrás",
    status: "pendente",
  },
  {
    id: "c7",
    userName: "Camila Rocha",
    videoTitle: "3 formas de usar blazer",
    productName: "Blazer Cropped Preto",
    text: "Vocês têm loja física?",
    date: "4 dias atrás",
    status: "aprovado",
  },
  {
    id: "c8",
    userName: "Bárbara Alves",
    videoTitle: "Conjunto mais vendido",
    productName: "Conjunto Alfaiataria Off",
    text: "Demorou muito para entregar, péssimo",
    date: "5 dias atrás",
    status: "denunciado",
  },
];

export const mockWidgets: Widget[] = [
  {
    id: "w1",
    name: "Product Video",
    description: "Mostre vídeos compráveis dentro da página de produto",
    status: "ativo",
  },
  {
    id: "w2",
    name: "Home Showcase",
    description: "Adicione uma vitrine de vídeos na página inicial",
    status: "inativo",
  },
  {
    id: "w3",
    name: "Floating Video",
    description: "Exiba um vídeo flutuante no canto da loja",
    status: "inativo",
  },
  {
    id: "w4",
    name: "Collection Feed",
    description: "Mostre vídeos por coleção ou categoria",
    status: "inativo",
  },
  {
    id: "w5",
    name: "Stories Bar",
    description: "Adicione bolhas de vídeos no estilo stories",
    status: "inativo",
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

export const generateAnalyticsData = () => {
  const data = [];
  let baseViews = 500;
  let baseClicks = 50;
  let baseRevenue = 600;

  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    // Add some random variation
    const views = Math.floor(baseViews + (Math.random() * 200 - 50));
    const clicks = Math.floor(views * (Math.random() * 0.05 + 0.08)); // 8-13% CTR
    const revenue = Math.floor(clicks * (Math.random() * 10 + 10)); // R$10-20 per click

    data.push({
      date: date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      }),
      views,
      clicks,
      revenue,
    });

    // Slight upward trend
    baseViews += 5;
  }
  return data;
};

export const mockAnalyticsChart = generateAnalyticsData();
