import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PaymentMethodSelect from "./payment-method-select";

function getCards(): HTMLElement[] {
  return screen.getAllByRole("radio");
}

describe("PaymentMethodSelect", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders four cards in the correct order", () => {
    render(<PaymentMethodSelect onChange={() => {}} />);
    const cards = getCards();
    expect(cards).toHaveLength(4);
    expect(cards[0]!.closest("label")).toHaveTextContent("Cash");
    expect(cards[1]!.closest("label")).toHaveTextContent("UPI");
    expect(cards[2]!.closest("label")).toHaveTextContent("Paytm");
    expect(cards[3]!.closest("label")).toHaveTextContent("Bank UPI");
  });

  it("has correct values for each radio", () => {
    render(<PaymentMethodSelect onChange={() => {}} />);
    const cards = getCards();
    expect(cards[0]).toHaveAttribute("value", "CASH");
    expect(cards[1]).toHaveAttribute("value", "UPI");
    expect(cards[2]).toHaveAttribute("value", "PAYTM");
    expect(cards[3]).toHaveAttribute("value", "BANK_UPI");
  });

  it("shows no selection when value is empty", () => {
    render(<PaymentMethodSelect onChange={() => {}} />);
    for (const card of getCards()) {
      expect(card).not.toBeChecked();
    }
  });

  it("checks the selected option via value prop", () => {
    render(<PaymentMethodSelect onChange={() => {}} value="BANK_UPI" />);
    expect(getCards()[0]).not.toBeChecked();
    expect(getCards()[3]).toBeChecked();
  });

  it("shows check indicator on selected card", () => {
    render(<PaymentMethodSelect onChange={() => {}} value="UPI" />);
    const selectedLabel = getCards()[1]!.closest("label")!;
    expect(selectedLabel.className).toContain("payment-method-card--selected");
  });

  it("selects an option on click and calls onChange", () => {
    const onChange = vi.fn();
    render(<PaymentMethodSelect onChange={onChange} />);
    fireEvent.click(getCards()[2]!.closest("label")!);
    expect(onChange).toHaveBeenCalledWith("PAYTM");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("selects an option on keyboard Enter", () => {
    const onChange = vi.fn();
    render(<PaymentMethodSelect onChange={onChange} />);
    getCards()[1]!.focus();
    fireEvent.click(getCards()[1]!);
    expect(onChange).toHaveBeenCalledWith("UPI");
  });

  it("selects Bank UPI on click", () => {
    const onChange = vi.fn();
    render(<PaymentMethodSelect onChange={onChange} />);
    fireEvent.click(getCards()[3]!.closest("label")!);
    expect(onChange).toHaveBeenCalledWith("BANK_UPI");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("all radios share a group name", () => {
    render(<PaymentMethodSelect onChange={() => {}} />);
    const cards = getCards();
    const groupName = cards[0]!.getAttribute("name");
    expect(groupName).toBeTruthy();
    for (const card of cards) {
      expect(card).toHaveAttribute("name", groupName);
    }
  });

  it("displays error message when error prop is set", () => {
    render(<PaymentMethodSelect error="Unsupported method." onChange={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Unsupported method.");
  });

  it("marks fieldset as invalid when error is set", () => {
    render(<PaymentMethodSelect error="Unsupported method." onChange={() => {}} />);
    const fieldset = document.querySelector("fieldset")!;
    expect(fieldset).toHaveAttribute("aria-invalid", "true");
  });

  it("disables all cards when disabled prop is true", () => {
    render(<PaymentMethodSelect disabled onChange={() => {}} />);
    const fieldset = document.querySelector("fieldset")!;
    expect(fieldset).toBeDisabled();
    for (const card of getCards()) {
      expect(card).toBeDisabled();
      fireEvent.click(card.closest("label")!);
      expect(card).not.toBeChecked();
    }
  });

  it("label element is associated with its radio via for/id", () => {
    render(<PaymentMethodSelect onChange={() => {}} />);
    for (const card of getCards()) {
      const label = card.closest("label")!;
      expect(label.getAttribute("for")).toBe(card.id);
    }
  });

  it("renders four images with empty alt text", () => {
    render(<PaymentMethodSelect onChange={() => {}} />);
    const images = document.querySelectorAll(".payment-method-card__image");
    expect(images).toHaveLength(4);
    images.forEach((img) => {
      expect(img).toHaveAttribute("alt", "");
      expect(img).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("images use the correct PNG sources from shared config", () => {
    render(<PaymentMethodSelect onChange={() => {}} />);
    const images = document.querySelectorAll(".payment-method-card__image");
    images.forEach((img) => {
      expect(img.getAttribute("src")).toContain("png");
    });
  });
});
