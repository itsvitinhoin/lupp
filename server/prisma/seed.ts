import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// Same rows the Supabase migrations seeded (plans + internal test coupons).
const PLANS = [
  { id: "start", name: "Start", price_monthly: 149, video_limit: 30, view_limit: 5_000, widget_limit: 1, features: ["30 vídeos", "5k views/mês", "1 widget ativo"] },
  { id: "growth", name: "Growth", price_monthly: 199, video_limit: 80, view_limit: 20_000, widget_limit: 5, features: ["80 vídeos", "20k views/mês", "5 widgets ativos"] },
  { id: "pro", name: "Pro", price_monthly: 299, video_limit: 200, view_limit: 60_000, widget_limit: 999, features: ["200 vídeos", "60k views/mês", "comentários moderados", "analytics avançado"] },
  { id: "scale", name: "Scale", price_monthly: 499, video_limit: 500, view_limit: 150_000, widget_limit: 999, features: ["500 vídeos", "150k views/mês", "multiusuário", "suporte prioritário"] },
];

const COUPONS = [
  {
    code: "TESTE99",
    name: "Teste 99",
    description: "Cupom interno para testes de checkout com 99% de desconto.",
    percent_off: 99,
    is_active: false, // deactivated by 20260618174233 in favor of TESTE98
  },
  {
    code: "TESTE98",
    name: "Teste 98",
    description: "Cupom interno para testes de checkout com 98% de desconto.",
    percent_off: 98,
    is_active: true,
  },
];

const connectionString =
  process.env.DATABASE_URL ?? "postgres://docker:docker@localhost:5433/lupp";
const schema = new URL(connectionString).searchParams.get("schema") ?? undefined;
const adapter = new PrismaPg({ connectionString }, schema ? { schema } : undefined);
const prisma = new PrismaClient({ adapter });

async function seed() {
  for (const plan of PLANS) {
    const { id, ...data } = plan;
    await prisma.plan.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  for (const coupon of COUPONS) {
    const { code, ...data } = coupon;
    await prisma.discountCoupon.upsert({
      where: { code },
      update: data,
      create: {
        code,
        ...data,
        duration: "once",
        metadata: { created_for: "checkout_testing" },
      },
    });
  }

  console.log(`Seeded ${PLANS.length} plans and ${COUPONS.length} coupons.`);
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
