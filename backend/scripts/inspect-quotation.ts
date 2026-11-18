import { prisma } from "../src/prisma.js";
import { generateToken } from "../src/utils/security.js";

async function main() {
  const q = await prisma.quotation.findFirst({
    where: { quotationNumber: "ORC-2026-00001" },
    include: {
      attachments: true,
      productionOrder: true,
      seller: true,
      customer: true,
    },
  });
  console.log("=== ORC-2026-00001 ===");
  console.log(JSON.stringify(q, null, 2));

  if (q && q.seller) {
    const token = generateToken({
      userId: q.seller.id,
      email: q.seller.email,
      role: q.seller.role,
    });
    console.log("=== SELLER_TOKEN ===");
    console.log(token);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

