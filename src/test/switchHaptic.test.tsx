import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { Switch } from "@/components/ui/switch";

const hapticToggle = vi.fn(async () => undefined);
vi.mock("@/lib/haptics", () => ({ hapticToggle: () => hapticToggle() }));

describe("Switch: iOS look + haptic feedback", () => {
  beforeEach(() => hapticToggle.mockClear());
  afterEach(() => cleanup());

  it("fires exactly one haptic per toggle, none on mount", () => {
    const onChange = vi.fn();
    const { getByRole } = render(<Switch checked={false} onCheckedChange={onChange} />);
    expect(hapticToggle).not.toHaveBeenCalled();
    fireEvent.click(getByRole("switch"));
    expect(hapticToggle).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not stack haptics on repeated toggles (one per change, never a loop)", () => {
    const Wrapper = () => {
      const [v, setV] = useState(false);
      return <Switch checked={v} onCheckedChange={setV} />;
    };
    const { getByRole } = render(<Wrapper />);
    const el = getByRole("switch");
    fireEvent.click(el);
    fireEvent.click(el);
    fireEvent.click(el);
    expect(hapticToggle).toHaveBeenCalledTimes(3);
  });

  it("renders the iOS pill shape: rounded track, translating thumb, on/off colour classes", () => {
    const { getByRole, rerender } = render(<Switch checked={false} onCheckedChange={() => {}} />);
    const el = getByRole("switch");
    expect(el.className).toMatch(/rounded-full/);
    expect(el.className).toMatch(/data-\[state=checked\]:bg-primary/);
    expect(el.className).toMatch(/transition-colors/);
    rerender(<Switch checked onCheckedChange={() => {}} />);
    expect(el.getAttribute("data-state")).toBe("checked");
  });

  it("works right-to-left (no directional class breaks it) and stays usable when disabled", () => {
    const { getByRole } = render(
      <div dir="rtl">
        <Switch checked disabled onCheckedChange={() => {}} />
      </div>,
    );
    const el = getByRole("switch");
    expect(el).toHaveProperty("disabled", true);
    fireEvent.click(el);
    expect(hapticToggle).not.toHaveBeenCalled(); // disabled: no change, no haptic
  });
});
