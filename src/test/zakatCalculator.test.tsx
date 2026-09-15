import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { ZakatCalculator } from "@/components/services/Calculators";

// MEDIUM severity fix: zeroing/blanking the gold-price field made
// `nisab = 85 * goldPrice` equal 0, so the calculator incorrectly declared
// "Zakat is due" on any non-negative wealth amount — a wrong religious-
// calculation verdict from a single blanked input.

function renderCalculator() {
  render(
    <LocaleProvider>
      <ZakatCalculator />
    </LocaleProvider>,
  );
  // Cash, Trade goods, Gold (grams), Gold price / gram, Debts due — in that order.
  const [cashInput, , , goldPriceInput] = screen.getAllByRole("spinbutton");
  return { cashInput, goldPriceInput };
}

describe("ZakatCalculator — nisab must never be treated as reachable when unknown", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does not report 'Zakat is due' when the gold price is blanked to zero", () => {
    const { cashInput, goldPriceInput } = renderCalculator();

    fireEvent.change(cashInput, { target: { value: "100" } });
    fireEvent.change(goldPriceInput, { target: { value: "" } });

    expect(screen.queryByText("Zakat is due")).not.toBeInTheDocument();
    expect(screen.getByText("Enter a gold price to compute nisab")).toBeInTheDocument();
  });

  it("still correctly reports 'Zakat is due' with a real gold price and wealth above nisab", () => {
    const { cashInput, goldPriceInput } = renderCalculator();

    fireEvent.change(goldPriceInput, { target: { value: "300" } });
    // nisab = 85 * 300 = 25500; well above it:
    fireEvent.change(cashInput, { target: { value: "100000" } });

    expect(screen.getByText("Zakat is due")).toBeInTheDocument();
  });

  it("reports 'below nisab' (not due) for wealth under a real nisab", () => {
    const { cashInput, goldPriceInput } = renderCalculator();

    fireEvent.change(goldPriceInput, { target: { value: "300" } });
    fireEvent.change(cashInput, { target: { value: "1" } });

    expect(screen.getByText("Below nisab")).toBeInTheDocument();
  });
});
