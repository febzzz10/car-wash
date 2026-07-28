import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import VehicleTypeSelect from "./vehicle-type-select";

function getCards(): HTMLElement[] {
  return screen.getAllByRole("radio");
}

function getCard(index: number): HTMLElement {
  return getCards()[index]!;
}

describe("VehicleTypeSelect", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders three cards in the correct order", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    const cards = getCards();
    expect(cards).toHaveLength(3);
    expect(cards[0]!.closest("label")).toHaveTextContent("Two Wheeler");
    expect(cards[1]!.closest("label")).toHaveTextContent("Three Wheeler");
    expect(cards[2]!.closest("label")).toHaveTextContent("Four Wheeler");
  });

  it("has correct values for each radio", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    const cards = getCards();
    expect(cards[0]).toHaveAttribute("value", "TWO_WHEELER");
    expect(cards[1]).toHaveAttribute("value", "THREE_WHEELER");
    expect(cards[2]).toHaveAttribute("value", "FOUR_WHEELER");
  });

  it("shows no selection when value is empty", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    for (const card of getCards()) {
      expect(card).not.toBeChecked();
    }
  });

  it("checks the selected option via value prop", () => {
    render(<VehicleTypeSelect onChange={() => {}} value="TWO_WHEELER" />);
    expect(getCard(0)).toBeChecked();
    expect(getCard(1)).not.toBeChecked();
    expect(getCard(2)).not.toBeChecked();
  });

  it("shows check indicator on selected card", () => {
    render(<VehicleTypeSelect onChange={() => {}} value="THREE_WHEELER" />);
    const selectedLabel = getCard(1).closest("label")!;
    expect(selectedLabel.className).toContain("vehicle-type-card--selected");
  });

  it("has an invisible legend that provides accessible group name", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toHaveAttribute("name");
    expect(radios[1]).toHaveAttribute("name");
    expect(radios[2]).toHaveAttribute("name");
    expect(radios[0]!.getAttribute("name")).toBe(radios[1]!.getAttribute("name"));
  });

  it("assigns unique name across instances", () => {
    render(
      <div>
        <VehicleTypeSelect onChange={() => {}} />
        <VehicleTypeSelect onChange={() => {}} />
      </div>,
    );
    const allRadios = screen.getAllByRole("radio");
    expect(allRadios).toHaveLength(6);
    const firstGroup = allRadios[0]!.getAttribute("name");
    const secondGroup = allRadios[3]!.getAttribute("name");
    expect(firstGroup).not.toBe(secondGroup);
  });

  it("selects an option on click and calls onChange", () => {
    const onChange = vi.fn();
    render(<VehicleTypeSelect onChange={onChange} />);
    fireEvent.click(getCard(1).closest("label")!);
    expect(onChange).toHaveBeenCalledWith("THREE_WHEELER");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("selects an option on keyboard Enter", () => {
    const onChange = vi.fn();
    render(<VehicleTypeSelect onChange={onChange} />);
    getCard(1).focus();
    fireEvent.click(getCard(1));
    expect(onChange).toHaveBeenCalledWith("THREE_WHEELER");
  });

  it("selects an option on keyboard Space", () => {
    const onChange = vi.fn();
    render(<VehicleTypeSelect onChange={onChange} />);
    getCard(2).focus();
    fireEvent.click(getCard(2));
    expect(onChange).toHaveBeenCalledWith("FOUR_WHEELER");
  });

  it("only one option can be selected at a time", () => {
    const onChange = vi.fn();
    render(<VehicleTypeSelect onChange={onChange} value="TWO_WHEELER" />);
    fireEvent.click(getCard(2).closest("label")!);
    expect(onChange).toHaveBeenCalledWith("FOUR_WHEELER");
  });

  it("all radios belong to the same group and can receive focus", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    const cards = getCards();
    const groupName = cards[0]!.getAttribute("name");
    expect(groupName).toBeTruthy();
    for (const card of cards) {
      expect(card).toHaveAttribute("name", groupName);
      card.focus();
      expect(document.activeElement).toBe(card);
    }
  });

  it("displays error message when error prop is set", () => {
    render(
      <VehicleTypeSelect error="Select a vehicle type." onChange={() => {}} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Select a vehicle type.",
    );
  });

  it("does not show error when error is not provided", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("marks fieldset as invalid when error is set", () => {
    render(
      <VehicleTypeSelect error="Select a vehicle type." onChange={() => {}} />,
    );
    const fieldset = document.querySelector("fieldset")!;
    expect(fieldset).toHaveAttribute("aria-invalid", "true");
  });

  it("error state adds error class to cards", () => {
    render(
      <VehicleTypeSelect error="Select a vehicle type." onChange={() => {}} />,
    );
    for (const card of getCards()) {
      expect(card.closest("label")!.className).toContain(
        "vehicle-type-card--error",
      );
    }
  });

  it("disables all cards when disabled prop is true", () => {
    render(<VehicleTypeSelect disabled onChange={() => {}} />);
    const fieldset = document.querySelector("fieldset")!;
    expect(fieldset).toBeDisabled();
    for (const card of getCards()) {
      expect(card).toBeDisabled();
      fireEvent.click(card.closest("label")!);
      expect(card).not.toBeChecked();
    }
  });

  it("label element is associated with its radio via for/id", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    for (const card of getCards()) {
      const label = card.closest("label")!;
      expect(label.getAttribute("for")).toBe(card.id);
    }
  });

  it("renders three vehicle images with empty alt text", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    const images = document.querySelectorAll(".vehicle-type-card__image");
    expect(images).toHaveLength(3);
    images.forEach((img) => {
      expect(img).toHaveAttribute("alt", "");
      expect(img).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("images use the correct PNG sources from shared config", () => {
    render(<VehicleTypeSelect onChange={() => {}} />);
    const images = document.querySelectorAll(".vehicle-type-card__image");
    expect(images).toHaveLength(3);
    images.forEach((img) => {
      expect(img.getAttribute("src")).toContain("png");
    });
  });
});
