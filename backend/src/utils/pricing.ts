/**
 * Utilitários para parsing e recálculo seguro de orçamentos e personalizações
 */

export function parseMonetaryValue(val: unknown): number {
  if (typeof val === "number") {
    return isNaN(val) ? 0 : val;
  }
  if (!val || typeof val !== "string") {
    return 0;
  }

  const str = val.trim();
  if (str === "") return 0;

  // Formato brasileiro com vírgula (ex: 38,90 ou 1.945,00)
  if (str.includes(",")) {
    const normalized = str.replace(/\./g, "").replace(",", ".");
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : num;
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

export function isFreeCustomization(nameOrCode?: string): boolean {
  if (!nameOrCode) return false;
  const upper = nameOrCode.toUpperCase().trim();
  return (
    upper === "NOME" ||
    upper === "NUMERO" ||
    upper === "NÚMERO" ||
    upper.includes("NOME") ||
    upper.includes("NUMERO") ||
    upper.includes("NÚMERO")
  );
}

export interface ItemPricingResult {
  isCustom: boolean;
  baseUnitPrice: number;
  customizationTotalPerUnit: number;
  unitPrice: number;
  subtotal: number;
  quantity: number;
}

export function calculateCustomizationsTotal(customizations: any[]): {
  totalPerUnit: number;
  appliedList: Array<{ name: string; price: number }>;
} {
  let totalPerUnit = 0;
  const appliedList: Array<{ name: string; price: number }> = [];

  for (const c of customizations) {
    if (typeof c === "string") {
      const name = c.trim();
      let price = 0;
      if (isFreeCustomization(name)) {
        price = 0.0;
      } else if (name.toUpperCase().includes("TPU") || name.toUpperCase().includes("ESCUDO")) {
        price = 15.0;
      } else if (name.toUpperCase().includes("MANGA LONGA")) {
        price = 12.0;
      }
      totalPerUnit += price;
      appliedList.push({ name, price });
    } else if (typeof c === "object" && c !== null) {
      const name = c.name || c.code || "Personalização";
      const rawPrice = parseMonetaryValue(c.additionalPrice ?? c.price ?? 0);
      const price = isFreeCustomization(name) ? 0.0 : rawPrice;
      totalPerUnit += price;
      appliedList.push({ name, price });
    }
  }

  return {
    totalPerUnit: Number(totalPerUnit.toFixed(2)),
    appliedList,
  };
}
