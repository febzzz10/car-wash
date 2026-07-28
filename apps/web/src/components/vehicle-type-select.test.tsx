import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import VehicleTypeSelect from "./vehicle-type-select";

function getTrigger(): HTMLElement {
  return screen.getByRole("combobox", { name: "Vehicle type" });
}

function getOptions(): HTMLElement[] {
  return screen.queryAllByRole("option");
}

function getListbox(): HTMLElement | null {
  return screen.queryByRole("listbox");
}

function clickTrigger(): void {
  fireEvent.click(getTrigger());
}

describe("VehicleTypeSelect", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders three options in the correct order", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    clickTrigger();
    const options = getOptions();
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent("Two Wheeler");
    expect(options[1]).toHaveTextContent("Three Wheeler");
    expect(options[2]).toHaveTextContent("Four Wheeler");
  });

  it("shows placeholder when no value is selected", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    expect(getTrigger()).toHaveTextContent("Select vehicle type");
  });

  it("shows selected icon and label in closed state", () => {
    render(<VehicleTypeSelect onChange={() => {}} value="TWO_WHEELER" />);
    expect(getTrigger()).toHaveTextContent("Two Wheeler");
    expect(screen.queryByText("Select vehicle type")).toBeNull();
  });

  it("assigns unique IDs for multiple instances", () => {
    render(
      <div>
        <VehicleTypeSelect onChange={() => {}} />
        <VehicleTypeSelect onChange={() => {}} />
      </div>,
    );
    const triggers = screen.getAllByRole("combobox", { name: "Vehicle type" });
    expect(triggers).toHaveLength(2);
    const ids = triggers.map((t) => t.getAttribute("id"));
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("opens on click and closes on second click", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    clickTrigger();
    expect(getListbox()).toBeInTheDocument();
    clickTrigger();
    expect(getListbox()).toBeNull();
  });

  it("selects an option on click and closes", () => {
    const onChange = vi.fn();
    render(<VehicleTypeSelect onChange={onChange} />);
    clickTrigger();
    const options = getOptions();
    fireEvent.click(options[1]!);
    expect(onChange).toHaveBeenCalledWith("THREE_WHEELER");
    expect(getListbox()).toBeNull();
  });

  it("closes on click outside", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    clickTrigger();
    expect(getListbox()).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(getListbox()).toBeNull();
  });

  it("returns focus to trigger after selection", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    clickTrigger();
    fireEvent.click(getOptions()[0]!);
    expect(document.activeElement).toBe(getTrigger());
  });

  it("returns focus to trigger after Escape", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    clickTrigger();
    fireEvent.keyDown(getTrigger(), { key: "Escape" });
    expect(getListbox()).toBeNull();
    expect(document.activeElement).toBe(getTrigger());
  });

  it("opens dropdown with ArrowDown key", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    fireEvent.keyDown(getTrigger(), { key: "ArrowDown" });
    expect(getListbox()).toBeInTheDocument();
  });

  it("navigates with ArrowDown and selects with Enter", () => {
    const onChange = vi.fn();
    render(<VehicleTypeSelect onChange={onChange} />);
    fireEvent.keyDown(getTrigger(), { key: "ArrowDown" });
    fireEvent.keyDown(getTrigger(), { key: "ArrowDown" });
    fireEvent.keyDown(getTrigger(), { key: "ArrowDown" });
    fireEvent.keyDown(getTrigger(), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("THREE_WHEELER");
  });

  it("navigates with ArrowUp", () => {
    const onChange = vi.fn();
    render(<VehicleTypeSelect onChange={onChange} value="FOUR_WHEELER" />);
    fireEvent.keyDown(getTrigger(), { key: "ArrowDown" });
    fireEvent.keyDown(getTrigger(), { key: "ArrowUp" });
    fireEvent.keyDown(getTrigger(), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("THREE_WHEELER");
  });

  it("selects first option with Home key", () => {
    const onChange = vi.fn();
    render(<VehicleTypeSelect onChange={onChange} value="FOUR_WHEELER" />);
    fireEvent.keyDown(getTrigger(), { key: "ArrowDown" });
    fireEvent.keyDown(getTrigger(), { key: "Home" });
    fireEvent.keyDown(getTrigger(), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("TWO_WHEELER");
  });

  it("selects last option with End key", () => {
    const onChange = vi.fn();
    render(<VehicleTypeSelect onChange={onChange} />);
    fireEvent.keyDown(getTrigger(), { key: "ArrowDown" });
    fireEvent.keyDown(getTrigger(), { key: "End" });
    fireEvent.keyDown(getTrigger(), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("FOUR_WHEELER");
  });

  it("selects with Space key", () => {
    const onChange = vi.fn();
    render(<VehicleTypeSelect onChange={onChange} />);
    fireEvent.keyDown(getTrigger(), { key: "ArrowDown" });
    fireEvent.keyDown(getTrigger(), { key: "ArrowDown" });
    fireEvent.keyDown(getTrigger(), { key: " " });
    expect(onChange).toHaveBeenCalledWith("TWO_WHEELER");
  });

  it("closes with Tab without trapping focus", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    clickTrigger();
    fireEvent.keyDown(getTrigger(), { key: "Tab" });
    expect(getListbox()).toBeNull();
  });

  it("disables interaction when disabled prop is true", () => {
    render(<VehicleTypeSelect disabled onChange={() => {}} />);
    expect(getTrigger()).toBeDisabled();
    clickTrigger();
    expect(getListbox()).toBeNull();
  });

  it("shows error message when error prop is set", () => {
    render(
      <VehicleTypeSelect error="Select a vehicle type." onChange={() => {}} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Select a vehicle type.",
    );
    expect(getTrigger()).toHaveAttribute("aria-invalid", "true");
  });

  it("links error to trigger via aria-describedby", () => {
    render(
      <VehicleTypeSelect error="Select a vehicle type." onChange={() => {}} />,
    );
    const describedBy = getTrigger().getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const errorEl = document.getElementById(describedBy!);
    expect(errorEl).toBeInTheDocument();
    expect(errorEl).toHaveTextContent("Select a vehicle type.");
  });

  it("does not show error when error is empty", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("has correct ARIA attributes on trigger", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    const trigger = getTrigger();
    expect(trigger).toHaveAttribute("role", "combobox");
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("does not set aria-activedescendant when closed", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    expect(getTrigger()).not.toHaveAttribute("aria-activedescendant");
  });

  it("does not set aria-activedescendant when open with no focused option", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    clickTrigger();
    expect(getTrigger()).not.toHaveAttribute("aria-activedescendant");
  });

  it("sets aria-activedescendant to the focused option when navigating", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    clickTrigger();
    fireEvent.keyDown(getTrigger(), { key: "ArrowDown" });
    expect(getTrigger()).toHaveAttribute(
      "aria-activedescendant",
      expect.stringMatching(/-option-0$/),
    );
  });

  it("updates aria-activedescendant on ArrowDown", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    clickTrigger();
    fireEvent.keyDown(getTrigger(), { key: "ArrowDown" });
    fireEvent.keyDown(getTrigger(), { key: "ArrowDown" });
    expect(getTrigger()).toHaveAttribute(
      "aria-activedescendant",
      expect.stringMatching(/-option-1$/),
    );
  });

  it("clears aria-activedescendant after closing", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    clickTrigger();
    fireEvent.keyDown(getTrigger(), { key: "ArrowDown" });
    fireEvent.keyDown(getTrigger(), { key: "Escape" });
    expect(getTrigger()).not.toHaveAttribute("aria-activedescendant");
  });

  it("updates aria-activedescendant on ArrowUp", () => {
    render(<VehicleTypeSelect onChange={() => {}} value="FOUR_WHEELER" />);
    clickTrigger();
    fireEvent.keyDown(getTrigger(), { key: "ArrowUp" });
    expect(getTrigger()).toHaveAttribute(
      "aria-activedescendant",
      expect.stringMatching(/-option-2$/),
    );
  });

  it("sets aria-activedescendant to first option on Home", () => {
    render(<VehicleTypeSelect onChange={() => {}} value="FOUR_WHEELER" />);
    clickTrigger();
    fireEvent.keyDown(getTrigger(), { key: "Home" });
    expect(getTrigger()).toHaveAttribute(
      "aria-activedescendant",
      expect.stringMatching(/-option-0$/),
    );
  });

  it("sets aria-activedescendant to last option on End", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    clickTrigger();
    fireEvent.keyDown(getTrigger(), { key: "End" });
    expect(getTrigger()).toHaveAttribute(
      "aria-activedescendant",
      expect.stringMatching(/-option-2$/),
    );
  });

  it("sets aria-expanded to true when open", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    clickTrigger();
    expect(getTrigger()).toHaveAttribute("aria-expanded", "true");
  });

  it("sets aria-selected on the selected option", () => {
    render(<VehicleTypeSelect onChange={() => {}} value="TWO_WHEELER" />);
    clickTrigger();
    const options = getOptions();
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
    expect(options[2]).toHaveAttribute("aria-selected", "false");
  });

  it("has unique listbox ID per instance", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    clickTrigger();
    const listbox = getListbox();
    expect(listbox).toBeInTheDocument();
    expect(getTrigger()).toHaveAttribute("aria-controls", listbox!.id);
  });
});
